import {
  DEPARTMENTS,
  MeetingCreateInputSchema,
  matchesCondition,
  type MeetingCreateInput,
  type MeetingDetail,
  type MeetingListInput,
  type MeetingSummary,
  type Profile,
  type Side,
  type SideCondition,
} from "@tutorial/shared";
import {
  ServiceError,
  clamp,
  exec,
  hash,
  newId,
  nowIso,
  queryAll,
  stmt,
  type ServiceContext,
} from "./core.js";
import { getProfile, requireProfile } from "./profile.js";
import { formatKst } from "./format.js";
import { postSystem } from "./chat.js";
import {
  groupMembersByMeeting,
  loadMeeting,
  loadMembers,
  parseCondition,
  requireMember,
  toMemberViews,
  toSummary,
  type MeetingRow,
  type MemberRow,
} from "./store.js";

const MAX_ACTIVE_HOSTED = 5;
const MAX_DAYS_AHEAD = 60;

// ---- listing -------------------------------------------------------------

async function summariesFor(
  sc: ServiceContext,
  meetings: MeetingRow[],
  profile: Profile | null,
): Promise<MeetingSummary[]> {
  if (meetings.length === 0) return [];
  const placeholders = meetings.map(() => "?").join(",");
  const members = await queryAll<MemberRow>(
    sc,
    `SELECT * FROM meeting_members WHERE meeting_id IN (${placeholders}) ORDER BY seq ASC`,
    ...meetings.map((m) => m.id),
  );
  const grouped = groupMembersByMeeting(members);
  return meetings.map((m) =>
    toSummary(m, grouped.get(m.id) ?? [], sc.userId, profile),
  );
}

export async function listMeetings(
  sc: ServiceContext,
  filters: MeetingListInput,
): Promise<MeetingSummary[]> {
  const profile = await getProfile(sc);
  const rows = await queryAll<MeetingRow>(
    sc,
    `SELECT * FROM meetings
     WHERE status = 'recruiting' AND kind = 'recruit' AND start_at >= ?
     ORDER BY start_at ASC LIMIT 100`,
    nowIso(sc),
  );
  let summaries = await summariesFor(sc, rows, profile);
  const { dept, region, gender } = filters;
  summaries = summaries.filter((s) => {
    if (region && s.region !== region) return false;
    if (dept && s.condA.dept !== dept && s.condB.dept !== dept) return false;
    if (
      gender &&
      gender !== "any" &&
      s.condA.gender !== gender &&
      s.condB.gender !== gender &&
      !(s.condA.gender === "any" || s.condB.gender === "any")
    )
      return false;
    if (filters.onlyApplicable && s.applicableSides.length === 0) return false;
    return true;
  });
  return summaries;
}

export async function myMeetings(
  sc: ServiceContext,
): Promise<MeetingSummary[]> {
  const profile = await getProfile(sc);
  const rows = await queryAll<MeetingRow>(
    sc,
    `SELECT m.* FROM meetings m
     WHERE m.id IN (SELECT meeting_id FROM meeting_members WHERE manager_id = ?)
     ORDER BY m.start_at DESC LIMIT 100`,
    sc.userId,
  );
  return summariesFor(sc, rows, profile);
}

/** Proposals from other departments that the caller is eligible to accept. */
export async function proposalInbox(
  sc: ServiceContext,
): Promise<MeetingSummary[]> {
  const profile = await getProfile(sc);
  if (!profile) return [];
  const rows = await queryAll<MeetingRow>(
    sc,
    `SELECT * FROM meetings
     WHERE status = 'recruiting' AND kind = 'proposal' AND host_id != ? AND start_at >= ?
       AND id NOT IN (SELECT meeting_id FROM meeting_hidden WHERE manager_id = ?)
     ORDER BY start_at ASC LIMIT 100`,
    sc.userId,
    nowIso(sc),
    sc.userId,
  );
  const summaries = await summariesFor(sc, rows, profile);
  // A proposal is addressed to the B team; teammates of the proposer are not "receivers".
  return summaries
    .map((s) => ({
      ...s,
      applicableSides: s.applicableSides.filter((side) => side === "b"),
    }))
    .filter((s) => s.applicableSides.length > 0);
}

export async function declineProposal(
  sc: ServiceContext,
  meetingId: string,
): Promise<void> {
  const meeting = await loadMeeting(sc, meetingId);
  if (meeting.kind !== "proposal")
    throw new ServiceError("제안 미팅만 거절할 수 있어요.", "notProposal");
  await exec(
    sc,
    "INSERT OR IGNORE INTO meeting_hidden (meeting_id, manager_id) VALUES (?, ?)",
    meetingId,
    sc.userId,
  );
}

export async function getMeetingDetail(
  sc: ServiceContext,
  meetingId: string,
): Promise<MeetingDetail> {
  const meeting = await loadMeeting(sc, meetingId);
  const members = await loadMembers(sc, meetingId);
  const profile = await getProfile(sc);
  const summary = toSummary(meeting, members, sc.userId, profile);
  const me = members.find((m) => m.manager_id === sc.userId);
  return {
    ...summary,
    members: toMemberViews(members, sc.userId),
    place: meeting.place_id
      ? {
          placeId: meeting.place_id,
          name: meeting.place_name,
          url: meeting.place_url,
          note: meeting.place_note,
          reservedFor: meeting.reserved_for,
        }
      : null,
    startedAt: meeting.started_at,
    speed: meeting.speed,
    matchedAt: meeting.matched_at,
    myMemberId: me?.id ?? null,
    myScheduleAcked: me ? me.schedule_acked_at !== null : false,
    pendingAcks: members.filter((m) => m.schedule_acked_at === null).length,
  };
}

// ---- create / join -------------------------------------------------------

function memberInsert(
  sc: ServiceContext,
  meetingId: string,
  side: Side,
  size: number,
  who: {
    managerId: string;
    profile: Profile;
    isDemo: boolean;
  },
) {
  const now = nowIso(sc);
  return stmt(
    sc,
    `INSERT INTO meeting_members
       (meeting_id, manager_id, side, seq, is_demo, dept, admission_year, age, gender, schedule_acked_at, joined_at)
     SELECT ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM meeting_members WHERE meeting_id = ?),
            ?, ?, ?, ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM meeting_members WHERE meeting_id = ? AND side = ?) < ?
       AND EXISTS (SELECT 1 FROM meetings WHERE id = ? AND status = 'recruiting')`,
    meetingId,
    who.managerId,
    side,
    meetingId,
    who.isDemo ? 1 : 0,
    who.profile.dept,
    who.profile.admissionYear,
    who.profile.age,
    who.profile.gender,
    who.isDemo ? now : null,
    now,
    meetingId,
    side,
    size,
    meetingId,
  );
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE|constraint/i.test(error.message);
}

export async function createMeeting(
  sc: ServiceContext,
  rawInput: MeetingCreateInput,
): Promise<string> {
  const input = MeetingCreateInputSchema.parse(rawInput);
  const profile = await requireProfile(sc);
  const startAt = new Date(input.startAt);
  if (startAt.getTime() <= sc.now.getTime())
    throw new ServiceError("미팅 시간은 현재보다 이후여야 해요.", "pastStart");
  if (startAt.getTime() > sc.now.getTime() + MAX_DAYS_AHEAD * 86400000)
    throw new ServiceError(
      `미팅은 ${MAX_DAYS_AHEAD}일 이내로만 잡을 수 있어요.`,
      "tooFar",
    );
  if (!matchesCondition(input.condA, profile))
    throw new ServiceError(
      "내 프로필이 우리 팀(A팀) 조건과 맞지 않아요.",
      "hostNotEligible",
    );
  if (input.kind === "proposal") {
    if (!input.condB.dept)
      throw new ServiceError(
        "제안할 상대 학과를 선택해 주세요.",
        "targetRequired",
      );
    if (input.condB.dept === (input.condA.dept || profile.dept))
      throw new ServiceError(
        "다른 학과에 제안해야 해요. 같은 학과는 모집글로 올려 주세요.",
        "sameDept",
      );
  }

  const active = await queryAll<{ n: number }>(
    sc,
    `SELECT COUNT(*) AS n FROM meetings WHERE host_id = ? AND status = 'recruiting'`,
    sc.userId,
  );
  if ((active[0]?.n ?? 0) >= MAX_ACTIVE_HOSTED)
    throw new ServiceError(
      `모집 중인 미팅은 최대 ${MAX_ACTIVE_HOSTED}개까지 만들 수 있어요.`,
      "tooManyMeetings",
    );

  const id = newId();
  const now = nowIso(sc);
  await sc.db.batch([
    stmt(
      sc,
      `INSERT INTO meetings
         (id, host_id, kind, title, description, size, start_at, region, cond_a, cond_b, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recruiting', ?)`,
      id,
      sc.userId,
      input.kind,
      input.title,
      input.description,
      input.size,
      startAt.toISOString(),
      input.region,
      JSON.stringify(input.condA),
      JSON.stringify(input.condB),
      now,
    ),
    memberInsert(sc, id, "a", input.size, {
      managerId: sc.userId,
      profile,
      isDemo: false,
    }),
  ]);
  await maybeMatch(sc, id);
  return id;
}

export async function applyToMeeting(
  sc: ServiceContext,
  meetingId: string,
  side: Side,
): Promise<void> {
  const profile = await requireProfile(sc);
  const meeting = await loadMeeting(sc, meetingId);
  if (meeting.status !== "recruiting")
    throw new ServiceError(
      "이미 모집이 끝난 미팅이에요.",
      "notRecruiting",
      "conflict",
    );
  if (new Date(meeting.start_at).getTime() < sc.now.getTime())
    throw new ServiceError("이미 시작 시간이 지난 미팅이에요.", "expired");
  const members = await loadMembers(sc, meetingId);
  if (members.some((m) => m.manager_id === sc.userId))
    throw new ServiceError(
      "이미 참여 중인 미팅이에요.",
      "alreadyJoined",
      "conflict",
    );
  const cond = parseCondition(side === "a" ? meeting.cond_a : meeting.cond_b);
  if (!matchesCondition(cond, profile))
    throw new ServiceError(
      "내 프로필이 이 팀의 조건과 맞지 않아요.",
      "notEligible",
    );

  try {
    const [result] = await sc.db.batch([
      memberInsert(sc, meetingId, side, meeting.size, {
        managerId: sc.userId,
        profile,
        isDemo: false,
      }),
    ]);
    if ((result?.meta?.changes ?? 0) === 0)
      throw new ServiceError(
        "해당 팀의 자리가 이미 찼어요.",
        "sideFull",
        "conflict",
      );
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (isUniqueViolation(error))
      throw new ServiceError(
        "다른 사람이 동시에 신청했어요. 다시 시도해 주세요.",
        "raceLost",
        "conflict",
      );
    throw error;
  }
  await maybeMatch(sc, meetingId);
}

export async function leaveMeeting(
  sc: ServiceContext,
  meetingId: string,
): Promise<void> {
  const { meeting, me } = await requireMember(sc, meetingId);
  if (meeting.status !== "recruiting")
    throw new ServiceError("성사된 미팅에서는 나갈 수 없어요.", "cannotLeave");
  if (meeting.host_id === sc.userId)
    throw new ServiceError(
      "모집한 사람은 나갈 수 없어요. 모집을 취소해 주세요.",
      "hostCannotLeave",
    );
  await exec(sc, "DELETE FROM meeting_members WHERE id = ?", me.id);
}

export async function cancelMeeting(
  sc: ServiceContext,
  meetingId: string,
): Promise<void> {
  const meeting = await loadMeeting(sc, meetingId);
  if (meeting.host_id !== sc.userId)
    throw new ServiceError("모집한 사람만 취소할 수 있어요.", "notHost");
  if (meeting.status !== "recruiting" && meeting.status !== "matched")
    throw new ServiceError(
      "이미 진행된 미팅은 취소할 수 없어요.",
      "cannotCancel",
    );
  const wasMatched = meeting.status === "matched";
  await exec(
    sc,
    "UPDATE meetings SET status = 'cancelled' WHERE id = ? AND status IN ('recruiting', 'matched')",
    meetingId,
  );
  if (wasMatched)
    await postSystem(
      sc,
      "meeting",
      meetingId,
      "모집한 사람이 미팅을 취소했어요.",
    );
}

// ---- matching ------------------------------------------------------------

/** Moves a full meeting to "matched" once and announces it in the group chat. */
export async function maybeMatch(
  sc: ServiceContext,
  meetingId: string,
): Promise<boolean> {
  const meeting = await loadMeeting(sc, meetingId);
  if (meeting.status !== "recruiting") return false;
  const members = await loadMembers(sc, meetingId);
  if (members.length < meeting.size * 2) return false;

  const changed = await exec(
    sc,
    "UPDATE meetings SET status = 'matched', matched_at = ? WHERE id = ? AND status = 'recruiting'",
    nowIso(sc),
    meetingId,
  );
  if (changed === 0) return false;

  await postSystem(
    sc,
    "meeting",
    meetingId,
    `🎉 미팅이 성사됐어요! ${meeting.size}:${meeting.size} 미팅 · 참가자 ${members.length}명이 모였어요.`,
  );
  await postSystem(
    sc,
    "meeting",
    meetingId,
    `📅 ${formatKst(meeting.start_at)} · 📍 ${meeting.region}\n일정을 확인했다면 '일정 확인' 버튼을 눌러 주세요. 장소는 '장소' 탭에서 추천받고 예약할 수 있어요.`,
  );
  return true;
}

// ---- schedule confirmation ----------------------------------------------

export async function ackSchedule(
  sc: ServiceContext,
  meetingId: string,
): Promise<void> {
  const { meeting, me, members } = await requireMember(sc, meetingId);
  if (meeting.status !== "matched" && meeting.status !== "in_progress")
    throw new ServiceError(
      "성사된 미팅에서만 일정을 확인할 수 있어요.",
      "notMatched",
    );
  if (me.schedule_acked_at) return;
  await exec(
    sc,
    "UPDATE meeting_members SET schedule_acked_at = ? WHERE id = ? AND schedule_acked_at IS NULL",
    nowIso(sc),
    me.id,
  );
  const pending = members.filter(
    (m) => m.id !== me.id && m.schedule_acked_at === null,
  ).length;
  if (pending === 0)
    await postSystem(
      sc,
      "meeting",
      meetingId,
      "✅ 모든 참가자가 일정을 확인했어요!",
    );
}

// ---- demo helpers --------------------------------------------------------

function demoProfile(cond: SideCondition, side: Side, salt: string): Profile {
  const dept =
    cond.dept || DEPARTMENTS[hash(`${salt}:dept`) % DEPARTMENTS.length];
  const gender =
    cond.gender === "any" ? (side === "a" ? "male" : "female") : cond.gender;
  return {
    dept: dept ?? DEPARTMENTS[0],
    gender,
    age: clamp(22, cond.ageMin, cond.ageMax),
    admissionYear: clamp(23, cond.yearMin, cond.yearMax),
  };
}

/** Fills the remaining seats with clearly-marked demo participants (host only). */
export async function fillWithDemoMembers(
  sc: ServiceContext,
  meetingId: string,
): Promise<number> {
  const meeting = await loadMeeting(sc, meetingId);
  if (meeting.host_id !== sc.userId)
    throw new ServiceError("모집한 사람만 사용할 수 있어요.", "notHost");
  if (meeting.status !== "recruiting")
    throw new ServiceError(
      "모집 중인 미팅에서만 사용할 수 있어요.",
      "notRecruiting",
    );
  const members = await loadMembers(sc, meetingId);
  let added = 0;
  for (const side of ["a", "b"] as const) {
    const cond = parseCondition(side === "a" ? meeting.cond_a : meeting.cond_b);
    let count = members.filter((m) => m.side === side).length;
    while (count < meeting.size) {
      const salt = `${meetingId}:${side}:${count}`;
      const managerId = `demo:${meetingId}:${newId()}`;
      const [result] = await sc.db.batch([
        memberInsert(sc, meetingId, side, meeting.size, {
          managerId,
          profile: demoProfile(cond, side, salt),
          isDemo: true,
        }),
      ]);
      if ((result?.meta?.changes ?? 0) === 0) break;
      count += 1;
      added += 1;
    }
  }
  await maybeMatch(sc, meetingId);
  return added;
}
