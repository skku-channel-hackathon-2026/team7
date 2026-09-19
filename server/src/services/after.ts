import type {
  AfterState,
  AfterSubmitInput,
  DmConsentInput,
  DmRoomView,
} from "@tutorial/shared";
import {
  ServiceError,
  exec,
  newId,
  nowIso,
  queryAll,
  queryFirst,
  stmt,
  type ServiceContext,
} from "./core.js";
import { postSystem } from "./chat.js";
import {
  AFTER_OPEN_MIN,
  ensureDemoActivity,
  finishMeeting,
} from "./session.js";
import {
  aliasMap,
  elapsedMinutes,
  loadMeeting,
  loadMembers,
  requireMember,
  toMemberView,
  toMemberViews,
  type MemberRow,
} from "./store.js";

interface DmRow {
  id: string;
  meeting_id: string;
  member_a: number;
  member_b: number;
  a_consent: number;
  b_consent: number;
  a_contact: string;
  b_contact: string;
  created_at: string;
}

function afterIsOpen(status: string, elapsed: number): boolean {
  return (
    status === "finished" ||
    (status === "in_progress" && elapsed >= AFTER_OPEN_MIN)
  );
}

async function dmRoomsFor(
  sc: ServiceContext,
  meetingId: string,
  memberId: number,
): Promise<DmRow[]> {
  return queryAll<DmRow>(
    sc,
    `SELECT * FROM dm_rooms WHERE meeting_id = ? AND (member_a = ? OR member_b = ?)
     ORDER BY created_at ASC`,
    meetingId,
    memberId,
    memberId,
  );
}

export async function getAfterState(
  sc: ServiceContext,
  meetingId: string,
): Promise<AfterState> {
  const { meeting, members, me } = await requireMember(sc, meetingId);
  const elapsed = elapsedMinutes(meeting, sc.now);
  const open = afterIsOpen(meeting.status, elapsed);
  if (open)
    await ensureDemoActivity(
      sc,
      meeting,
      members,
      Math.max(elapsed, AFTER_OPEN_MIN),
    );
  await ensureDemoAfterChoices(sc, meetingId, members, open);

  const fresh = open ? await loadMembers(sc, meetingId) : members;
  const self = fresh.find((m) => m.id === me.id) ?? me;
  const choices = await queryAll<{ target_member_id: number }>(
    sc,
    "SELECT target_member_id FROM after_choices WHERE meeting_id = ? AND chooser_member_id = ?",
    meetingId,
    me.id,
  );
  const aliases = aliasMap(fresh);
  const rooms = await dmRoomsFor(sc, meetingId, me.id);
  const submitted = self.after_submitted_at !== null;
  const waiting = fresh.filter((m) => m.after_submitted_at === null).length;

  return {
    meetingId,
    open,
    submitted,
    choices: choices.map((c) => c.target_member_id),
    none: submitted && choices.length === 0,
    candidates: toMemberViews(fresh, sc.userId).filter(
      (m) => m.side !== me.side,
    ),
    final: waiting === 0,
    waitingCount: waiting,
    matches: rooms.map((room) => {
      const partnerId = room.member_a === me.id ? room.member_b : room.member_a;
      const partner = fresh.find((m) => m.id === partnerId) as MemberRow;
      return {
        roomId: room.id,
        partner: toMemberView(partner, aliases, sc.userId),
      };
    }),
  };
}

/** Demo participants answer once the after stage is open (mutual only with real people sometimes). */
async function ensureDemoAfterChoices(
  sc: ServiceContext,
  meetingId: string,
  members: MemberRow[],
  open: boolean,
): Promise<void> {
  if (!open) return;
  const now = nowIso(sc);
  for (const demo of members.filter(
    (m) => m.is_demo === 1 && m.after_submitted_at === null,
  )) {
    const others = members.filter((m) => m.side !== demo.side);
    const real = others.filter((m) => m.is_demo === 0);
    const pool = real.length > 0 ? real : others;
    // Demo members choose the first real participant of the other side and skip the rest.
    const target = pool[0];
    const statements = [
      stmt(
        sc,
        "UPDATE meeting_members SET after_submitted_at = ? WHERE id = ? AND after_submitted_at IS NULL",
        now,
        demo.id,
      ),
    ];
    if (target && demo.id % 2 === 1)
      statements.push(
        stmt(
          sc,
          `INSERT OR IGNORE INTO after_choices (meeting_id, chooser_member_id, target_member_id, created_at)
           VALUES (?, ?, ?, ?)`,
          meetingId,
          demo.id,
          target.id,
          now,
        ),
      );
    await sc.db.batch(statements);
  }
}

export async function submitAfter(
  sc: ServiceContext,
  input: AfterSubmitInput,
): Promise<{ matches: number }> {
  const { meeting, members, me } = await requireMember(sc, input.meetingId);
  const elapsed = elapsedMinutes(meeting, sc.now);
  if (!afterIsOpen(meeting.status, elapsed))
    throw new ServiceError(
      "아직 애프터 의사를 선택할 시간이 아니에요.",
      "afterClosed",
    );
  if (me.after_submitted_at)
    throw new ServiceError(
      "이미 애프터 의사를 제출했어요.",
      "alreadySubmitted",
      "conflict",
    );
  await ensureDemoActivity(
    sc,
    meeting,
    members,
    Math.max(elapsed, AFTER_OPEN_MIN),
  );
  await ensureDemoAfterChoices(sc, input.meetingId, members, true);

  const targets = [...new Set(input.targetMemberIds)];
  for (const id of targets) {
    const target = members.find((m) => m.id === id);
    if (!target || target.side === me.side)
      throw new ServiceError(
        "상대 팀 참가자만 선택할 수 있어요.",
        "invalidTarget",
      );
  }
  const now = nowIso(sc);
  await sc.db.batch([
    ...targets.map((id) =>
      stmt(
        sc,
        `INSERT OR IGNORE INTO after_choices (meeting_id, chooser_member_id, target_member_id, created_at)
         VALUES (?, ?, ?, ?)`,
        input.meetingId,
        me.id,
        id,
        now,
      ),
    ),
    stmt(
      sc,
      "UPDATE meeting_members SET after_submitted_at = ? WHERE id = ? AND after_submitted_at IS NULL",
      now,
      me.id,
    ),
  ]);

  // A room opens only when both sides chose each other; nothing else is ever disclosed.
  let created = 0;
  for (const id of targets) {
    const reciprocal = await queryFirst<{ n: number }>(
      sc,
      `SELECT COUNT(*) AS n FROM after_choices
       WHERE meeting_id = ? AND chooser_member_id = ? AND target_member_id = ?`,
      input.meetingId,
      id,
      me.id,
    );
    if ((reciprocal?.n ?? 0) === 0) continue;
    const [a, b] = me.id < id ? [me.id, id] : [id, me.id];
    const roomId = newId();
    const changed = await exec(
      sc,
      `INSERT OR IGNORE INTO dm_rooms (id, meeting_id, member_a, member_b, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      roomId,
      input.meetingId,
      a,
      b,
      now,
    );
    if (changed === 1) {
      created += 1;
      await postSystem(
        sc,
        "dm",
        roomId,
        "💌 서로 애프터를 원했어요! 이 채팅방에서 편하게 이야기해 보세요. 연락처·SNS 교환은 두 사람이 모두 동의해야 공개돼요.",
      );
    }
  }

  const fresh = await loadMembers(sc, input.meetingId);
  if (fresh.every((m) => m.after_submitted_at !== null)) {
    const current = await loadMeeting(sc, input.meetingId);
    if (current.status === "in_progress")
      await finishMeeting(
        sc,
        input.meetingId,
        "🏁 모든 참가자가 애프터 의사를 선택했어요. 미팅이 종료됐어요. 후기를 남겨 주세요!",
      );
  }
  return { matches: created };
}

// ---- direct chat rooms ---------------------------------------------------

async function toRoomView(
  sc: ServiceContext,
  room: DmRow,
  members: MemberRow[],
  title: string,
): Promise<DmRoomView> {
  const me = members.find((m) => m.manager_id === sc.userId);
  if (!me || (me.id !== room.member_a && me.id !== room.member_b))
    throw new ServiceError("이 채팅방의 참가자만 볼 수 있어요.", "notMember");
  const iAmA = me.id === room.member_a;
  const partnerId = iAmA ? room.member_b : room.member_a;
  const partner = members.find((m) => m.id === partnerId) as MemberRow;
  const myConsent = (iAmA ? room.a_consent : room.b_consent) === 1;
  const partnerConsent = (iAmA ? room.b_consent : room.a_consent) === 1;
  return {
    roomId: room.id,
    meetingId: room.meeting_id,
    meetingTitle: title,
    partner: toMemberView(partner, aliasMap(members), sc.userId),
    myConsent,
    partnerConsent,
    myContact: iAmA ? room.a_contact : room.b_contact,
    // The partner's contact is only released once both people agreed.
    partnerContact:
      myConsent && partnerConsent
        ? iAmA
          ? room.b_contact
          : room.a_contact
        : null,
    createdAt: room.created_at,
  };
}

export async function listDmRooms(sc: ServiceContext): Promise<DmRoomView[]> {
  const rows = await queryAll<DmRow & { title: string }>(
    sc,
    `SELECT d.*, m.title AS title FROM dm_rooms d
     JOIN meetings m ON m.id = d.meeting_id
     WHERE d.member_a IN (SELECT id FROM meeting_members WHERE manager_id = ?)
        OR d.member_b IN (SELECT id FROM meeting_members WHERE manager_id = ?)
     ORDER BY d.created_at DESC`,
    sc.userId,
    sc.userId,
  );
  const views: DmRoomView[] = [];
  for (const row of rows) {
    const members = await loadMembers(sc, row.meeting_id);
    views.push(await toRoomView(sc, row, members, row.title));
  }
  return views;
}

export async function getDmRoom(
  sc: ServiceContext,
  roomId: string,
): Promise<DmRoomView> {
  const row = await queryFirst<DmRow>(
    sc,
    "SELECT * FROM dm_rooms WHERE id = ?",
    roomId,
  );
  if (!row)
    throw new ServiceError(
      "채팅방을 찾을 수 없어요.",
      "roomNotFound",
      "notFound",
    );
  const meeting = await loadMeeting(sc, row.meeting_id);
  const members = await loadMembers(sc, row.meeting_id);
  return toRoomView(sc, row, members, meeting.title);
}

export async function setContactConsent(
  sc: ServiceContext,
  input: DmConsentInput,
): Promise<DmRoomView> {
  const view = await getDmRoom(sc, input.roomId);
  const row = (await queryFirst<DmRow>(
    sc,
    "SELECT * FROM dm_rooms WHERE id = ?",
    input.roomId,
  )) as DmRow;
  const members = await loadMembers(sc, row.meeting_id);
  const me = members.find((m) => m.manager_id === sc.userId) as MemberRow;
  const iAmA = me.id === row.member_a;
  const contact = input.consent ? input.contact : "";
  if (input.consent && !contact)
    throw new ServiceError(
      "공유할 연락처나 SNS 아이디를 입력해 주세요.",
      "contactRequired",
    );
  if (view.myConsent === input.consent && view.myContact === contact)
    return view;

  await exec(
    sc,
    iAmA
      ? "UPDATE dm_rooms SET a_consent = ?, a_contact = ? WHERE id = ?"
      : "UPDATE dm_rooms SET b_consent = ?, b_contact = ? WHERE id = ?",
    input.consent ? 1 : 0,
    contact,
    input.roomId,
  );
  const updated = await getDmRoom(sc, input.roomId);
  if (input.consent && !view.myConsent) {
    await postSystem(
      sc,
      "dm",
      input.roomId,
      updated.partnerConsent
        ? "🎉 두 사람 모두 동의해서 연락처가 교환됐어요!"
        : "한 사람이 연락처 교환에 동의했어요. 상대도 동의하면 서로의 연락처가 공개돼요.",
    );
  }
  return updated;
}
