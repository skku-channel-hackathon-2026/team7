import { z } from "zod";
import { MemberViewSchema } from "./common.js";

export const STAGE_KEYS = [
  "intro",
  "question",
  "event",
  "pick",
  "mission",
  "after",
] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export const STAGES: { key: StageKey; label: string; startMin: number }[] = [
  { key: "intro", label: "자기소개", startMin: 0 },
  { key: "question", label: "랜덤 질문", startMin: 15 },
  { key: "event", label: "미팅 이벤트", startMin: 30 },
  { key: "pick", label: "사랑의 짝대기", startMin: 45 },
  { key: "mission", label: "랜덤 미션", startMin: 60 },
  { key: "after", label: "애프터 의사 확인", startMin: 75 },
];

/** Minutes at which a fresh conversation topic is generated. */
export const TOPIC_MINUTES = [8, 22, 38, 52, 68] as const;
/** After this many minutes the session is closed automatically. */
export const SESSION_END_MIN = 150;
export const SPEED_OPTIONS = [1, 10, 60] as const;

export const PromptKindSchema = z.enum([
  "intro",
  "question",
  "event",
  "pick",
  "mission",
  "after",
  "topic",
]);
export type PromptKind = z.infer<typeof PromptKindSchema>;

export const PromptViewSchema = z.object({
  slot: z.string(),
  kind: PromptKindSchema,
  minute: z.number(),
  title: z.string(),
  body: z.string(),
  voteable: z.boolean(),
  myVote: z.number().nullable(),
  voteResult: z
    .array(z.object({ memberId: z.number(), votes: z.number() }))
    .nullable(),
});
export type PromptView = z.infer<typeof PromptViewSchema>;

export const StageViewSchema = z.object({
  key: z.string(),
  label: z.string(),
  startMin: z.number(),
  state: z.enum(["done", "active", "upcoming"]),
});
export type StageView = z.infer<typeof StageViewSchema>;

export const PickStateSchema = z.object({
  open: z.boolean(),
  revealed: z.boolean(),
  myPick: z.number().nullable(),
  candidates: z.array(MemberViewSchema),
  mutual: z.array(MemberViewSchema),
  receivedCount: z.number(),
});
export type PickState = z.infer<typeof PickStateSchema>;

export const SessionStateSchema = z.object({
  meetingId: z.string(),
  status: z.string(),
  started: z.boolean(),
  startedAt: z.string().nullable(),
  speed: z.number(),
  elapsedMin: z.number(),
  nextStageInSec: z.number().nullable(),
  stages: z.array(StageViewSchema),
  prompts: z.array(PromptViewSchema),
  pick: PickStateSchema,
  canStart: z.boolean(),
  isHost: z.boolean(),
  afterOpen: z.boolean(),
  members: z.array(MemberViewSchema),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

export const SessionGetInputSchema = z.object({ meetingId: z.string().min(1) });
export type SessionGetInput = z.infer<typeof SessionGetInputSchema>;
export const SessionGetOutputSchema = z.object({ session: SessionStateSchema });
export type SessionGetOutput = z.infer<typeof SessionGetOutputSchema>;

export const SessionStartInputSchema = z.object({
  meetingId: z.string().min(1),
  speed: z
    .number()
    .refine((v) => (SPEED_OPTIONS as readonly number[]).includes(v), {
      message: "지원하지 않는 배속이에요",
    }),
});
export type SessionStartInput = z.infer<typeof SessionStartInputSchema>;

export const SessionPickInputSchema = z.object({
  meetingId: z.string().min(1),
  targetMemberId: z.number().int(),
});
export type SessionPickInput = z.infer<typeof SessionPickInputSchema>;

export const SessionVoteInputSchema = z.object({
  meetingId: z.string().min(1),
  slot: z.string().min(1),
  targetMemberId: z.number().int(),
});
export type SessionVoteInput = z.infer<typeof SessionVoteInputSchema>;
