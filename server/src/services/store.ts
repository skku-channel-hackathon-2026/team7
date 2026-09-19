import {
  SideConditionSchema,
  matchesCondition,
  type MeetingSummary,
  type MemberView,
  type Profile,
  type Side,
  type SideCondition,
} from "@tutorial/shared";
import {
  ServiceError,
  queryAll,
  queryFirst,
  type ServiceContext,
} from "./core.js";

export interface MeetingRow {
  id: string;
  host_id: string;
  kind: "recruit" | "proposal";
  title: string;
  description: string;
  size: number;
  start_at: string;
  region: string;
  cond_a: string;
  cond_b: string;
  status: MeetingSummary["status"];
  place_id: string;
  place_name: string;
  place_url: string;
  place_note: string;
  reserved_for: string;
  started_at: string | null;
  speed: number;
  matched_at: string | null;
  finished_at: string | null;
  last_nudge_at: string | null;
  created_at: string;
}

export interface MemberRow {
  id: number;
  meeting_id: string;
  manager_id: string;
  side: Side;
  seq: number;
  is_demo: number;
  dept: string;
  admission_year: number;
  age: number;
  gender: "male" | "female";
  schedule_acked_at: string | null;
  after_submitted_at: string | null;
  joined_at: string;
}

export async function loadMeeting(
  sc: ServiceContext,
  meetingId: string,
): Promise<MeetingRow> {
  const row = await queryFirst<MeetingRow>(
    sc,
    "SELECT * FROM meetings WHERE id = ?",
    meetingId,
  );
  if (!row)
    throw new ServiceError(
      "미팅을 찾을 수 없어요.",
      "meetingNotFound",
      "notFound",
    );
  return row;
}

export function loadMembers(
  sc: ServiceContext,
  meetingId: string,
): Promise<MemberRow[]> {
  return queryAll<MemberRow>(
    sc,
    "SELECT * FROM meeting_members WHERE meeting_id = ? ORDER BY seq ASC",
    meetingId,
  );
}

export async function requireMember(
  sc: ServiceContext,
  meetingId: string,
): Promise<{ meeting: MeetingRow; members: MemberRow[]; me: MemberRow }> {
  const meeting = await loadMeeting(sc, meetingId);
  const members = await loadMembers(sc, meetingId);
  const me = members.find((m) => m.manager_id === sc.userId);
  if (!me)
    throw new ServiceError("이 미팅의 참가자만 사용할 수 있어요.", "notMember");
  return { meeting, members, me };
}

export function parseCondition(json: string): SideCondition {
  return SideConditionSchema.parse(JSON.parse(json));
}

export const aliasLabel = (index: number): string =>
  `참가자 ${String.fromCharCode(65 + index)}`;

/** Aliases are assigned by join order so they stay stable once a meeting is matched. */
export function aliasMap(members: MemberRow[]): Map<number, string> {
  const map = new Map<number, string>();
  [...members]
    .sort((a, b) => a.seq - b.seq)
    .forEach((m, index) => map.set(m.id, aliasLabel(index)));
  return map;
}

export function toMemberView(
  member: MemberRow,
  aliases: Map<number, string>,
  userId: string,
): MemberView {
  return {
    memberId: member.id,
    alias: aliases.get(member.id) ?? "참가자",
    side: member.side,
    dept: member.dept,
    admissionYear: member.admission_year,
    age: member.age,
    gender: member.gender,
    isMe: member.manager_id === userId,
    isDemo: member.is_demo === 1,
    scheduleAcked: member.schedule_acked_at !== null,
  };
}

export function toMemberViews(
  members: MemberRow[],
  userId: string,
): MemberView[] {
  const aliases = aliasMap(members);
  return members.map((m) => toMemberView(m, aliases, userId));
}

export function toSummary(
  meeting: MeetingRow,
  members: MemberRow[],
  userId: string,
  profile: Profile | null,
): MeetingSummary {
  const condA = parseCondition(meeting.cond_a);
  const condB = parseCondition(meeting.cond_b);
  const countA = members.filter((m) => m.side === "a").length;
  const countB = members.filter((m) => m.side === "b").length;
  const mine = members.find((m) => m.manager_id === userId);
  const applicableSides: Side[] = [];
  if (meeting.status === "recruiting" && !mine && profile) {
    if (countA < meeting.size && matchesCondition(condA, profile))
      applicableSides.push("a");
    if (countB < meeting.size && matchesCondition(condB, profile))
      applicableSides.push("b");
  }
  return {
    id: meeting.id,
    kind: meeting.kind,
    title: meeting.title,
    description: meeting.description,
    size: meeting.size,
    startAt: meeting.start_at,
    region: meeting.region,
    status: meeting.status,
    condA,
    condB,
    countA,
    countB,
    isHost: meeting.host_id === userId,
    mySide: mine?.side ?? null,
    applicableSides,
    createdAt: meeting.created_at,
  };
}

/** Minutes of "meeting time" that have elapsed since the session started. */
export function elapsedMinutes(meeting: MeetingRow, now: Date): number {
  if (!meeting.started_at) return 0;
  const realMin =
    (now.getTime() - new Date(meeting.started_at).getTime()) / 60000;
  return Math.max(0, realMin * meeting.speed);
}

export function groupMembersByMeeting(
  rows: MemberRow[],
): Map<string, MemberRow[]> {
  const map = new Map<string, MemberRow[]>();
  for (const row of rows) {
    const list = map.get(row.meeting_id);
    if (list) list.push(row);
    else map.set(row.meeting_id, [row]);
  }
  return map;
}
