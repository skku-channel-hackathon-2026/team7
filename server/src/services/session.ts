import {
  SESSION_END_MIN,
  STAGES,
  TOPIC_MINUTES,
  type PromptKind,
  type PromptView,
  type SessionState,
  type SessionPickInput,
  type SessionVoteInput,
} from "@tutorial/shared";
import {
  ServiceError,
  exec,
  hash,
  nowIso,
  queryAll,
  type ServiceContext,
} from "./core.js";
import { postSystem } from "./chat.js";
import {
  AFTER_PROMPT,
  EVENTS,
  INTRO,
  MISSIONS,
  PICK_PROMPT,
  QUESTIONS,
  TOPICS,
  pickContent,
  type ContentItem,
} from "./content.js";
import {
  elapsedMinutes,
  loadMeeting,
  requireMember,
  toMemberViews,
  type MeetingRow,
  type MemberRow,
} from "./store.js";

const PICK_OPEN_MIN = 45;
export const AFTER_OPEN_MIN = 75;
const VOTE_REVEAL_GRACE_MIN = 10;

interface PromptRow {
  slot: string;
  kind: PromptKind;
  minute: number;
  title: string;
  body: string;
  voteable: number;
}

interface DuePrompt {
  slot: string;
  kind: PromptKind;
  minute: number;
  pool: ContentItem[] | null;
  fixed?: ContentItem;
}

function duePrompts(): DuePrompt[] {
  const list: DuePrompt[] = [
    { slot: "stage:intro", kind: "intro", minute: 0, pool: null, fixed: INTRO },
    { slot: "stage:question", kind: "question", minute: 15, pool: QUESTIONS },
    { slot: "stage:event", kind: "event", minute: 30, pool: EVENTS },
    {
      slot: "stage:pick",
      kind: "pick",
      minute: 45,
      pool: null,
      fixed: PICK_PROMPT,
    },
    { slot: "stage:mission", kind: "mission", minute: 60, pool: MISSIONS },
    {
      slot: "stage:after",
      kind: "after",
      minute: 75,
      pool: null,
      fixed: AFTER_PROMPT,
    },
    ...TOPIC_MINUTES.map((minute): DuePrompt => ({
      slot: `topic:${minute}`,
      kind: "topic",
      minute,
      pool: TOPICS,
    })),
  ];
  return list.sort((a, b) => a.minute - b.minute);
}

/** Inserts a prompt once (safe under concurrent polling) and posts it to the group chat. */
async function ensurePrompt(
  sc: ServiceContext,
  meeting: MeetingRow,
  due: DuePrompt,
  used: Map<string, number>,
): Promise<void> {
  const usedCount = used.get(due.kind) ?? 0;
  const item =
    due.fixed ??
    pickContent(
      due.pool as ContentItem[],
      hash(`${meeting.id}:${due.kind}`),
      usedCount,
    );
  const body =
    due.kind === "topic"
      ? `미팅 시작 후 ${due.minute}분이 지났어요. 다음 주제로 이야기해보세요!\n${item.body}`
      : item.body;
  const changed = await exec(
    sc,
    `INSERT OR IGNORE INTO meeting_prompts (meeting_id, slot, kind, minute, title, body, voteable, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    meeting.id,
    due.slot,
    due.kind,
    due.minute,
    item.title,
    body,
    item.vote ? 1 : 0,
    nowIso(sc),
  );
  used.set(due.kind, usedCount + 1);
  if (changed === 1)
    await postSystem(
      sc,
      "meeting",
      meeting.id,
      `${item.title}\n${body}`,
      "prompt",
    );
}

async function generateDuePrompts(
  sc: ServiceContext,
  meeting: MeetingRow,
  elapsed: number,
): Promise<void> {
  const existing = await queryAll<{ slot: string; kind: string }>(
    sc,
    "SELECT slot, kind FROM meeting_prompts WHERE meeting_id = ?",
    meeting.id,
  );
  const have = new Set(existing.map((p) => p.slot));
  const used = new Map<string, number>();
  for (const p of existing) used.set(p.kind, (used.get(p.kind) ?? 0) + 1);
  for (const due of duePrompts()) {
    if (due.minute > elapsed) break;
    if (!have.has(due.slot)) await ensurePrompt(sc, meeting, due, used);
  }
}

// ---- demo participants ---------------------------------------------------

/**
 * Demo participants behave deterministically so a single tester can walk through the whole flow.
 * They prefer choosing real participants of the opposite side.
 */
export async function ensureDemoActivity(
  sc: ServiceContext,
  meeting: MeetingRow,
  members: MemberRow[],
  elapsed: number,
): Promise<void> {
  const demos = members.filter((m) => m.is_demo === 1);
  if (demos.length === 0) return;
  const now = nowIso(sc);

  if (elapsed >= PICK_OPEN_MIN) {
    for (const demo of demos) {
      const others = members.filter((m) => m.side !== demo.side);
      const real = others.filter((m) => m.is_demo === 0);
      const pool = real.length > 0 ? real : others;
      const target = pool[hash(`${meeting.id}:pick:${demo.id}`) % pool.length];
      if (!target) continue;
      await exec(
        sc,
        `INSERT OR IGNORE INTO picks (meeting_id, chooser_member_id, target_member_id, created_at)
         VALUES (?, ?, ?, ?)`,
        meeting.id,
        demo.id,
        target.id,
        now,
      );
    }
  }

  const voteables = await queryAll<{ slot: string }>(
    sc,
    "SELECT slot FROM meeting_prompts WHERE meeting_id = ? AND voteable = 1",
    meeting.id,
  );
  for (const { slot } of voteables) {
    for (const demo of demos) {
      const pool = members.filter((m) => m.id !== demo.id);
      const target =
        pool[hash(`${meeting.id}:vote:${slot}:${demo.id}`) % pool.length];
      if (!target) continue;
      await exec(
        sc,
        `INSERT OR IGNORE INTO prompt_votes (meeting_id, slot, voter_member_id, target_member_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        meeting.id,
        slot,
        demo.id,
        target.id,
        now,
      );
    }
  }
}

// ---- lifecycle -----------------------------------------------------------

export async function finishMeeting(
  sc: ServiceContext,
  meetingId: string,
  message: string,
): Promise<boolean> {
  const changed = await exec(
    sc,
    "UPDATE meetings SET status = 'finished', finished_at = ? WHERE id = ? AND status = 'in_progress'",
    nowIso(sc),
    meetingId,
  );
  if (changed === 0) return false;
  await postSystem(sc, "meeting", meetingId, message);
  return true;
}

export async function startSession(
  sc: ServiceContext,
  meetingId: string,
  speed: number,
): Promise<void> {
  const { meeting } = await requireMember(sc, meetingId);
  if (meeting.host_id !== sc.userId)
    throw new ServiceError("모집한 사람만 미팅을 시작할 수 있어요.", "notHost");
  if (meeting.status !== "matched")
    throw new ServiceError(
      "성사된 미팅만 시작할 수 있어요.",
      "notMatched",
      "conflict",
    );
  const changed = await exec(
    sc,
    `UPDATE meetings SET status = 'in_progress', started_at = ?, speed = ?
     WHERE id = ? AND status = 'matched'`,
    nowIso(sc),
    speed,
    meetingId,
  );
  if (changed === 0) return;
  await postSystem(
    sc,
    "meeting",
    meetingId,
    speed === 1
      ? "🚀 미팅이 시작됐어요! 이제부터 앱이 진행을 도와드릴게요."
      : `🚀 미팅이 시작됐어요! (데모 ${speed}배속) 앱이 진행을 도와드릴게요.`,
  );
}

export async function finishSession(
  sc: ServiceContext,
  meetingId: string,
): Promise<void> {
  const { meeting } = await requireMember(sc, meetingId);
  if (meeting.host_id !== sc.userId)
    throw new ServiceError("모집한 사람만 미팅을 종료할 수 있어요.", "notHost");
  if (meeting.status !== "in_progress")
    throw new ServiceError(
      "진행 중인 미팅만 종료할 수 있어요.",
      "notInProgress",
      "conflict",
    );
  await finishMeeting(
    sc,
    meetingId,
    "🏁 미팅이 종료됐어요. 후기를 남겨 주세요!",
  );
}

// ---- read model ----------------------------------------------------------

export async function getSession(
  sc: ServiceContext,
  meetingId: string,
): Promise<SessionState> {
  const access = await requireMember(sc, meetingId);
  const { members, me } = access;
  let meeting = access.meeting;
  const started =
    meeting.status === "in_progress" || meeting.status === "finished";
  let elapsed = elapsedMinutes(meeting, sc.now);

  if (meeting.status === "in_progress" && elapsed >= SESSION_END_MIN) {
    await finishMeeting(
      sc,
      meetingId,
      "🏁 미팅 시간이 끝나 자동으로 종료됐어요. 후기를 남겨 주세요!",
    );
    meeting = await loadMeeting(sc, meetingId);
  }
  if (meeting.status === "in_progress") {
    await generateDuePrompts(sc, meeting, elapsed);
  }
  if (started) {
    elapsed =
      meeting.status === "finished"
        ? Math.max(elapsed, AFTER_OPEN_MIN)
        : elapsed;
    await ensureDemoActivity(sc, meeting, members, elapsed);
  }

  const finished = meeting.status === "finished";
  const promptRows = started
    ? await queryAll<PromptRow>(
        sc,
        "SELECT slot, kind, minute, title, body, voteable FROM meeting_prompts WHERE meeting_id = ? ORDER BY minute ASC, slot ASC",
        meetingId,
      )
    : [];
  const votes = started
    ? await queryAll<{
        slot: string;
        voter_member_id: number;
        target_member_id: number;
      }>(
        sc,
        "SELECT slot, voter_member_id, target_member_id FROM prompt_votes WHERE meeting_id = ?",
        meetingId,
      )
    : [];
  const realMembers = members.filter((m) => m.is_demo === 0);

  const prompts: PromptView[] = promptRows.map((p) => {
    const slotVotes = votes.filter((v) => v.slot === p.slot);
    const mine = slotVotes.find((v) => v.voter_member_id === me.id);
    const allVoted = realMembers.every((m) =>
      slotVotes.some((v) => v.voter_member_id === m.id),
    );
    const reveal =
      p.voteable === 1 &&
      (finished || allVoted || elapsed >= p.minute + VOTE_REVEAL_GRACE_MIN);
    const tally = new Map<number, number>();
    for (const v of slotVotes)
      tally.set(v.target_member_id, (tally.get(v.target_member_id) ?? 0) + 1);
    return {
      slot: p.slot,
      kind: p.kind,
      minute: p.minute,
      title: p.title,
      body: p.body,
      voteable: p.voteable === 1,
      myVote: mine?.target_member_id ?? null,
      voteResult: reveal
        ? [...tally.entries()]
            .map(([memberId, count]) => ({ memberId, votes: count }))
            .sort((a, b) => b.votes - a.votes)
        : null,
    };
  });

  const memberViews = toMemberViews(members, sc.userId);
  const pickRows = started
    ? await queryAll<{ chooser_member_id: number; target_member_id: number }>(
        sc,
        "SELECT chooser_member_id, target_member_id FROM picks WHERE meeting_id = ?",
        meetingId,
      )
    : [];
  const pickOpen = started && elapsed >= PICK_OPEN_MIN;
  const pickRevealed = started && (finished || elapsed >= AFTER_OPEN_MIN);
  const myPick =
    pickRows.find((p) => p.chooser_member_id === me.id)?.target_member_id ??
    null;
  const mutual =
    pickRevealed && myPick !== null
      ? pickRows.some(
          (p) => p.chooser_member_id === myPick && p.target_member_id === me.id,
        )
        ? memberViews.filter((m) => m.memberId === myPick)
        : []
      : [];

  const nextStage = STAGES.find((s) => s.startMin > elapsed);
  const stages = STAGES.map((s, i) => {
    const next = STAGES[i + 1];
    const state: "done" | "active" | "upcoming" = !started
      ? "upcoming"
      : elapsed >= (next?.startMin ?? Infinity)
        ? "done"
        : elapsed >= s.startMin
          ? "active"
          : "upcoming";
    return {
      key: s.key,
      label: s.label,
      startMin: s.startMin,
      state: finished ? "done" : state,
    };
  });

  return {
    meetingId,
    status: meeting.status,
    started,
    startedAt: meeting.started_at,
    speed: meeting.speed,
    elapsedMin: Math.floor(elapsed * 10) / 10,
    nextStageInSec:
      started && !finished && nextStage
        ? Math.max(
            0,
            Math.round(((nextStage.startMin - elapsed) * 60) / meeting.speed),
          )
        : null,
    stages,
    prompts,
    pick: {
      open: pickOpen,
      revealed: pickRevealed,
      myPick,
      candidates: memberViews.filter((m) => m.side !== me.side),
      mutual,
      receivedCount: pickRevealed
        ? pickRows.filter((p) => p.target_member_id === me.id).length
        : 0,
    },
    canStart: meeting.status === "matched" && meeting.host_id === sc.userId,
    isHost: meeting.host_id === sc.userId,
    afterOpen: started && (finished || elapsed >= AFTER_OPEN_MIN),
    members: memberViews,
  };
}

// ---- actions -------------------------------------------------------------

export async function pickMember(
  sc: ServiceContext,
  input: SessionPickInput,
): Promise<void> {
  const { meeting, members, me } = await requireMember(sc, input.meetingId);
  const elapsed = elapsedMinutes(meeting, sc.now);
  if (meeting.status !== "in_progress" || elapsed < PICK_OPEN_MIN)
    throw new ServiceError("아직 사랑의 짝대기 시간이 아니에요.", "pickClosed");
  if (elapsed >= AFTER_OPEN_MIN)
    throw new ServiceError(
      "짝대기 결과가 공개되어 더 이상 바꿀 수 없어요.",
      "pickRevealed",
    );
  const target = members.find((m) => m.id === input.targetMemberId);
  if (!target || target.side === me.side)
    throw new ServiceError(
      "상대 팀 참가자만 선택할 수 있어요.",
      "invalidTarget",
    );
  await exec(
    sc,
    `INSERT INTO picks (meeting_id, chooser_member_id, target_member_id, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(meeting_id, chooser_member_id) DO UPDATE SET
       target_member_id = excluded.target_member_id, created_at = excluded.created_at`,
    input.meetingId,
    me.id,
    target.id,
    nowIso(sc),
  );
}

export async function voteMember(
  sc: ServiceContext,
  input: SessionVoteInput,
): Promise<void> {
  const { meeting, members, me } = await requireMember(sc, input.meetingId);
  if (meeting.status !== "in_progress")
    throw new ServiceError(
      "진행 중인 미팅에서만 투표할 수 있어요.",
      "notInProgress",
    );
  const [prompt] = await queryAll<{ voteable: number; minute: number }>(
    sc,
    "SELECT voteable, minute FROM meeting_prompts WHERE meeting_id = ? AND slot = ?",
    input.meetingId,
    input.slot,
  );
  if (!prompt || prompt.voteable !== 1)
    throw new ServiceError("투표할 수 없는 항목이에요.", "notVoteable");
  const target = members.find((m) => m.id === input.targetMemberId);
  if (!target || target.id === me.id)
    throw new ServiceError(
      "나를 제외한 참가자를 선택해 주세요.",
      "invalidTarget",
    );
  await exec(
    sc,
    `INSERT INTO prompt_votes (meeting_id, slot, voter_member_id, target_member_id, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(meeting_id, slot, voter_member_id) DO UPDATE SET
       target_member_id = excluded.target_member_id, created_at = excluded.created_at`,
    input.meetingId,
    input.slot,
    me.id,
    target.id,
    nowIso(sc),
  );
}
