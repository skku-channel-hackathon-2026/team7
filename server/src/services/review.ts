import type {
  AfterReviewInput,
  AfterReviewView,
  DeptStat,
  RecordView,
  ReviewGetOutput,
  ReviewInput,
} from "@tutorial/shared";
import {
  ServiceError,
  exec,
  nowIso,
  queryAll,
  queryFirst,
  type ServiceContext,
} from "./core.js";
import { formatKstDate } from "./format.js";
import { AFTER_OPEN_MIN } from "./session.js";
import {
  aliasMap,
  elapsedMinutes,
  loadMembers,
  requireMember,
  type MeetingRow,
} from "./store.js";

export const MIN_STAT_SAMPLE = 3;
const RECENT_DAYS = 30;

function canReview(meeting: MeetingRow, now: Date): boolean {
  if (meeting.status === "finished") return true;
  return (
    meeting.status === "in_progress" &&
    elapsedMinutes(meeting, now) >= AFTER_OPEN_MIN
  );
}

interface ReviewRow {
  mood: number;
  talk: number;
  place: number;
  content: number;
  rejoin: number;
  comment: string;
  created_at: string;
}

export async function getReview(
  sc: ServiceContext,
  meetingId: string,
): Promise<ReviewGetOutput> {
  const { meeting, members, me } = await requireMember(sc, meetingId);
  const review = await queryFirst<ReviewRow>(
    sc,
    "SELECT * FROM reviews WHERE meeting_id = ? AND member_id = ?",
    meetingId,
    me.id,
  );
  const aliases = aliasMap(members);
  const rooms = await queryAll<{
    id: string;
    member_a: number;
    member_b: number;
  }>(
    sc,
    "SELECT id, member_a, member_b FROM dm_rooms WHERE meeting_id = ? AND (member_a = ? OR member_b = ?)",
    meetingId,
    me.id,
    me.id,
  );
  const afterReviews: AfterReviewView[] = [];
  for (const room of rooms) {
    const partnerId = room.member_a === me.id ? room.member_b : room.member_a;
    const row = await queryFirst<{
      met: number;
      score: number | null;
      comment: string;
    }>(
      sc,
      "SELECT met, score, comment FROM after_reviews WHERE room_id = ? AND member_id = ?",
      room.id,
      me.id,
    );
    afterReviews.push({
      roomId: room.id,
      partnerAlias: aliases.get(partnerId) ?? "참가자",
      met: row?.met === 1,
      score: row?.score ?? null,
      comment: row?.comment ?? "",
      submitted: row !== null,
    });
  }
  return {
    canReview: canReview(meeting, sc.now),
    review: review
      ? {
          mood: review.mood,
          talk: review.talk,
          place: review.place,
          content: review.content,
          rejoin: review.rejoin === 1,
          comment: review.comment,
          createdAt: review.created_at,
        }
      : null,
    afterReviews,
  };
}

export async function submitReview(
  sc: ServiceContext,
  input: ReviewInput,
): Promise<void> {
  const { meeting, me } = await requireMember(sc, input.meetingId);
  if (!canReview(meeting, sc.now))
    throw new ServiceError(
      "미팅이 끝난 뒤에 후기를 남길 수 있어요.",
      "reviewClosed",
    );
  const changed = await exec(
    sc,
    `INSERT OR IGNORE INTO reviews
       (meeting_id, member_id, mood, talk, place, content, rejoin, comment, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.meetingId,
    me.id,
    input.mood,
    input.talk,
    input.place,
    input.content,
    input.rejoin ? 1 : 0,
    input.comment,
    nowIso(sc),
  );
  if (changed === 0)
    throw new ServiceError(
      "이미 후기를 남겼어요.",
      "alreadyReviewed",
      "conflict",
    );
}

export async function submitAfterReview(
  sc: ServiceContext,
  input: AfterReviewInput,
): Promise<void> {
  const room = await queryFirst<{
    meeting_id: string;
    member_a: number;
    member_b: number;
  }>(
    sc,
    "SELECT meeting_id, member_a, member_b FROM dm_rooms WHERE id = ?",
    input.roomId,
  );
  if (!room)
    throw new ServiceError(
      "채팅방을 찾을 수 없어요.",
      "roomNotFound",
      "notFound",
    );
  const { me } = await requireMember(sc, room.meeting_id);
  if (me.id !== room.member_a && me.id !== room.member_b)
    throw new ServiceError(
      "이 애프터의 참가자만 후기를 남길 수 있어요.",
      "notMember",
    );
  if (input.met && input.score === null)
    throw new ServiceError("만족도 점수를 선택해 주세요.", "scoreRequired");
  const changed = await exec(
    sc,
    `INSERT OR IGNORE INTO after_reviews (room_id, member_id, met, score, comment, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    input.roomId,
    me.id,
    input.met ? 1 : 0,
    input.met ? input.score : null,
    input.comment,
    nowIso(sc),
  );
  if (changed === 0)
    throw new ServiceError(
      "이미 애프터 후기를 남겼어요.",
      "alreadyReviewed",
      "conflict",
    );
}

// ---- personal records ----------------------------------------------------

export async function listRecords(sc: ServiceContext): Promise<RecordView[]> {
  const meetings = await queryAll<
    MeetingRow & { my_member_id: number; my_dept: string; my_side: string }
  >(
    sc,
    `SELECT m.*, mm.id AS my_member_id, mm.dept AS my_dept, mm.side AS my_side
     FROM meetings m JOIN meeting_members mm ON mm.meeting_id = m.id
     WHERE mm.manager_id = ? AND m.status IN ('matched', 'in_progress', 'finished')
     ORDER BY m.start_at DESC LIMIT 100`,
    sc.userId,
  );
  const records: RecordView[] = [];
  for (const m of meetings) {
    const members = await loadMembers(sc, m.id);
    const otherDepts = [
      ...new Set(
        members.filter((x) => x.side !== m.my_side).map((x) => x.dept),
      ),
    ];
    const afterCount = await queryFirst<{ n: number }>(
      sc,
      "SELECT COUNT(*) AS n FROM dm_rooms WHERE meeting_id = ? AND (member_a = ? OR member_b = ?)",
      m.id,
      m.my_member_id,
      m.my_member_id,
    );
    const reviewed = await queryFirst<{ n: number }>(
      sc,
      "SELECT COUNT(*) AS n FROM reviews WHERE meeting_id = ? AND member_id = ?",
      m.id,
      m.my_member_id,
    );
    records.push({
      meetingId: m.id,
      date: formatKstDate(m.start_at),
      title: m.title,
      myDept: m.my_dept,
      otherDept: otherDepts.join(", "),
      size: m.size,
      region: m.region,
      placeName: m.place_name,
      status: m.status,
      afterCount: afterCount?.n ?? 0,
      reviewed: (reviewed?.n ?? 0) > 0,
    });
  }
  return records;
}

// ---- department statistics ------------------------------------------------

/**
 * Aggregated per department from real (non-demo) participants only.
 * The data describes meetings, it never ranks or scores a department.
 */
export async function departmentStats(sc: ServiceContext): Promise<DeptStat[]> {
  const rows = await queryAll<{
    dept: string;
    meeting_id: string;
    member_id: number;
    status: string;
    start_at: string;
  }>(
    sc,
    `SELECT mm.dept AS dept, mm.meeting_id AS meeting_id, mm.id AS member_id,
            m.status AS status, m.start_at AS start_at
     FROM meeting_members mm JOIN meetings m ON m.id = mm.meeting_id
     WHERE mm.is_demo = 0`,
  );
  const reviews = await queryAll<{
    member_id: number;
    mood: number;
    talk: number;
    place: number;
    content: number;
    rejoin: number;
  }>(sc, "SELECT member_id, mood, talk, place, content, rejoin FROM reviews");
  const rooms = await queryAll<{
    meeting_id: string;
    member_a: number;
    member_b: number;
  }>(sc, "SELECT meeting_id, member_a, member_b FROM dm_rooms");

  const reviewByMember = new Map(reviews.map((r) => [r.member_id, r]));
  const withAfter = new Set<number>();
  for (const room of rooms) {
    withAfter.add(room.member_a);
    withAfter.add(room.member_b);
  }

  const recentCutoff = sc.now.getTime() - RECENT_DAYS * 86400000;
  const byDept = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byDept.get(row.dept);
    if (list) list.push(row);
    else byDept.set(row.dept, [row]);
  }

  const stats: DeptStat[] = [];
  for (const [dept, deptRows] of byDept) {
    const meetingStatus = new Map<
      string,
      { status: string; startAt: string }
    >();
    for (const r of deptRows)
      meetingStatus.set(r.meeting_id, {
        status: r.status,
        startAt: r.start_at,
      });
    const all = [...meetingStatus.values()];
    const held = all.filter((m) =>
      ["matched", "in_progress", "finished"].includes(m.status),
    );
    const finishedRows = deptRows.filter((r) => r.status === "finished");
    const reviewed = deptRows
      .map((r) => reviewByMember.get(r.member_id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined);

    const avg = reviewed.length
      ? reviewed.reduce(
          (s, r) => s + (r.mood + r.talk + r.place + r.content) / 4,
          0,
        ) / reviewed.length
      : null;
    stats.push({
      dept,
      meetings: held.length,
      recentMeetings: held.filter(
        (m) => new Date(m.startAt).getTime() >= recentCutoff,
      ).length,
      matchRate: all.length ? held.length / all.length : null,
      afterRate: finishedRows.length
        ? finishedRows.filter((r) => withAfter.has(r.member_id)).length /
          finishedRows.length
        : null,
      avgSatisfaction: avg === null ? null : Math.round(avg * 10) / 10,
      reviewCount: reviewed.length,
      rejoinRate: reviewed.length
        ? reviewed.filter((r) => r.rejoin === 1).length / reviewed.length
        : null,
    });
  }
  return stats.sort(
    (a, b) => b.meetings - a.meetings || a.dept.localeCompare(b.dept, "ko"),
  );
}
