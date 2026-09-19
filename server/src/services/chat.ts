import type {
  ChatListInput,
  ChatMessageView,
  ChatRoomType,
  ChatSendInput,
} from "@tutorial/shared";
import {
  ServiceError,
  exec,
  nowIso,
  queryAll,
  queryFirst,
  type ServiceContext,
} from "./core.js";
import {
  aliasMap,
  loadMeeting,
  loadMembers,
  requireMember,
  type MemberRow,
} from "./store.js";

type MessageKind = ChatMessageView["kind"];

interface MessageRow {
  id: number;
  sender_member_id: number | null;
  kind: MessageKind;
  body: string;
  created_at: string;
}

const CHAT_STATUSES = ["matched", "in_progress", "finished"];
const NUDGE_INTERVAL_MS = 30 * 60 * 1000;
const NUDGE_MANUAL_INTERVAL_MS = 10 * 60 * 1000;

export async function postMessage(
  sc: ServiceContext,
  roomType: ChatRoomType,
  roomId: string,
  senderMemberId: number | null,
  kind: MessageKind,
  body: string,
): Promise<void> {
  await exec(
    sc,
    `INSERT INTO chat_messages (room_type, room_id, sender_member_id, kind, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    roomType,
    roomId,
    senderMemberId,
    kind,
    body,
    nowIso(sc),
  );
}

export const postSystem = (
  sc: ServiceContext,
  roomType: ChatRoomType,
  roomId: string,
  body: string,
  kind: MessageKind = "system",
) => postMessage(sc, roomType, roomId, null, kind, body);

interface RoomAccess {
  me: MemberRow;
  members: MemberRow[];
  writable: boolean;
}

/** Resolves the caller's membership in a chat room, or throws. */
async function resolveRoom(
  sc: ServiceContext,
  roomType: ChatRoomType,
  roomId: string,
): Promise<RoomAccess> {
  if (roomType === "meeting") {
    const { meeting, members, me } = await requireMember(sc, roomId);
    if (!CHAT_STATUSES.includes(meeting.status))
      throw new ServiceError(
        "미팅이 성사된 뒤에 단체 채팅을 사용할 수 있어요.",
        "chatNotReady",
      );
    return { me, members, writable: true };
  }
  const room = await queryFirst<{
    meeting_id: string;
    member_a: number;
    member_b: number;
  }>(
    sc,
    "SELECT meeting_id, member_a, member_b FROM dm_rooms WHERE id = ?",
    roomId,
  );
  if (!room)
    throw new ServiceError(
      "채팅방을 찾을 수 없어요.",
      "roomNotFound",
      "notFound",
    );
  const members = await loadMembers(sc, room.meeting_id);
  const me = members.find((m) => m.manager_id === sc.userId);
  if (!me || (me.id !== room.member_a && me.id !== room.member_b))
    throw new ServiceError(
      "이 채팅방의 참가자만 사용할 수 있어요.",
      "notMember",
    );
  return { me, members, writable: true };
}

export async function listMessages(
  sc: ServiceContext,
  input: ChatListInput,
): Promise<ChatMessageView[]> {
  const { me, members } = await resolveRoom(sc, input.roomType, input.roomId);
  if (input.roomType === "meeting") await maybeAutoNudge(sc, input.roomId);

  const rows =
    input.afterId > 0
      ? await queryAll<MessageRow>(
          sc,
          `SELECT id, sender_member_id, kind, body, created_at FROM chat_messages
           WHERE room_type = ? AND room_id = ? AND id > ? ORDER BY id ASC LIMIT 200`,
          input.roomType,
          input.roomId,
          input.afterId,
        )
      : (
          await queryAll<MessageRow>(
            sc,
            `SELECT id, sender_member_id, kind, body, created_at FROM chat_messages
             WHERE room_type = ? AND room_id = ? ORDER BY id DESC LIMIT 200`,
            input.roomType,
            input.roomId,
          )
        ).reverse();

  const aliases = aliasMap(members);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    senderAlias:
      row.sender_member_id === null
        ? "미팅봇"
        : (aliases.get(row.sender_member_id) ?? "참가자"),
    mine: row.sender_member_id === me.id,
    body: row.body,
    createdAt: row.created_at,
  }));
}

export async function sendMessage(
  sc: ServiceContext,
  input: ChatSendInput,
): Promise<void> {
  const { me } = await resolveRoom(sc, input.roomType, input.roomId);
  await postMessage(
    sc,
    input.roomType,
    input.roomId,
    me.id,
    "text",
    input.body,
  );
}

/**
 * Reminds the room when someone still hasn't confirmed the schedule.
 * Only the number of pending people is revealed, never who they are.
 */
export async function sendNudge(
  sc: ServiceContext,
  meetingId: string,
  minIntervalMs: number,
): Promise<{ sent: boolean; pending: number }> {
  const meeting = await loadMeeting(sc, meetingId);
  if (meeting.status !== "matched" && meeting.status !== "in_progress")
    return { sent: false, pending: 0 };
  const members = await loadMembers(sc, meetingId);
  const pending = members.filter((m) => m.schedule_acked_at === null).length;
  if (pending === 0) return { sent: false, pending };

  const reference = meeting.last_nudge_at ?? meeting.matched_at;
  if (
    reference &&
    sc.now.getTime() - new Date(reference).getTime() < minIntervalMs
  )
    return { sent: false, pending };

  const changed = await exec(
    sc,
    "UPDATE meetings SET last_nudge_at = ? WHERE id = ? AND last_nudge_at IS ?",
    nowIso(sc),
    meetingId,
    meeting.last_nudge_at,
  );
  if (changed === 0) return { sent: false, pending };
  await postSystem(
    sc,
    "meeting",
    meetingId,
    `아직 미팅 일정을 확인하지 않은 사람이 있어요. (${pending}명) 일정 확인 버튼을 눌러 주세요!`,
    "nudge",
  );
  return { sent: true, pending };
}

export const manualNudge = (sc: ServiceContext, meetingId: string) =>
  sendNudge(sc, meetingId, NUDGE_MANUAL_INTERVAL_MS);

async function maybeAutoNudge(
  sc: ServiceContext,
  meetingId: string,
): Promise<void> {
  await sendNudge(sc, meetingId, NUDGE_INTERVAL_MS);
}
