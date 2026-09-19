import { z } from "zod";
import {
  GenderConditionSchema,
  MeetingDetailSchema,
  MeetingKindSchema,
  MeetingSummarySchema,
  ProfileSchema,
  SideConditionSchema,
  SideSchema,
} from "./common.js";

export const MEETING_FUNCTIONS = {
  open: "meeting.open",
  profileGet: "profile.get",
  profileSave: "profile.save",
  list: "meeting.list",
  mine: "meeting.mine",
  get: "meeting.get",
  create: "meeting.create",
  apply: "meeting.apply",
  leave: "meeting.leave",
  cancel: "meeting.cancel",
  inbox: "proposal.inbox",
  decline: "proposal.decline",
  ack: "meeting.ack",
  nudge: "meeting.nudge",
  demoFill: "meeting.demoFill",
  chatList: "chat.list",
  chatSend: "chat.send",
  sessionGet: "session.get",
  sessionStart: "session.start",
  sessionFinish: "session.finish",
  sessionPick: "session.pick",
  sessionVote: "session.vote",
  afterGet: "after.get",
  afterSubmit: "after.submit",
  dmList: "dm.list",
  dmGet: "dm.get",
  dmConsent: "dm.consent",
  placeRecommend: "place.recommend",
  placeSelect: "place.select",
  placeReserve: "place.reserve",
  reviewGet: "review.get",
  reviewSubmit: "review.submit",
  afterReviewSubmit: "review.afterSubmit",
  recordList: "record.list",
  statsDepartments: "stats.departments",
} as const;

export const CommandActionInputSchema = z.object({
  chat: z.object({ type: z.string(), id: z.string() }).optional(),
  trigger: z
    .object({
      type: z.string(),
      attributes: z
        .record(z.string())
        .nullish()
        .transform((attributes) => attributes ?? {}),
    })
    .optional(),
  input: z
    .record(z.unknown())
    .nullish()
    .transform((input) => input ?? {}),
  language: z.string().optional(),
});
export type CommandActionInput = z.infer<typeof CommandActionInputSchema>;

export const EmptyInputSchema = z.object({}).passthrough();

// ---- profile -------------------------------------------------------------
export const ProfileGetOutputSchema = z.object({
  profile: ProfileSchema.nullable(),
});
export type ProfileGetOutput = z.infer<typeof ProfileGetOutputSchema>;
export const ProfileSaveInputSchema = ProfileSchema;
export type ProfileSaveInput = z.infer<typeof ProfileSaveInputSchema>;

// ---- meetings ------------------------------------------------------------
export const MeetingListInputSchema = z.object({
  dept: z.string().max(40).optional(),
  region: z.string().max(20).optional(),
  gender: GenderConditionSchema.optional(),
  onlyApplicable: z.boolean().default(false),
});
export type MeetingListInput = z.infer<typeof MeetingListInputSchema>;
export const MeetingListOutputSchema = z.object({
  meetings: z.array(MeetingSummarySchema),
});
export type MeetingListOutput = z.infer<typeof MeetingListOutputSchema>;

export const MeetingIdInputSchema = z.object({ meetingId: z.string().min(1) });
export type MeetingIdInput = z.infer<typeof MeetingIdInputSchema>;

export const MeetingGetOutputSchema = z.object({
  meeting: MeetingDetailSchema,
});
export type MeetingGetOutput = z.infer<typeof MeetingGetOutputSchema>;

export const MeetingCreateInputSchema = z.object({
  kind: MeetingKindSchema.default("recruit"),
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).default(""),
  size: z.number().int().min(1).max(5),
  startAt: z.string().datetime(),
  region: z.string().min(1).max(20),
  condA: SideConditionSchema,
  condB: SideConditionSchema,
});
export type MeetingCreateInput = z.infer<typeof MeetingCreateInputSchema>;

export const MeetingCreateOutputSchema = z.object({ meetingId: z.string() });
export type MeetingCreateOutput = z.infer<typeof MeetingCreateOutputSchema>;

export const MeetingApplyInputSchema = z.object({
  meetingId: z.string().min(1),
  side: SideSchema,
});
export type MeetingApplyInput = z.infer<typeof MeetingApplyInputSchema>;

export const OkOutputSchema = z.object({ ok: z.boolean() });
export type OkOutput = z.infer<typeof OkOutputSchema>;

export const NudgeOutputSchema = z.object({
  sent: z.boolean(),
  pending: z.number(),
});
export type NudgeOutput = z.infer<typeof NudgeOutputSchema>;

export const DemoFillOutputSchema = z.object({ added: z.number() });
export type DemoFillOutput = z.infer<typeof DemoFillOutputSchema>;

// ---- chat ----------------------------------------------------------------
export const ChatRoomTypeSchema = z.enum(["meeting", "dm"]);
export type ChatRoomType = z.infer<typeof ChatRoomTypeSchema>;

export const ChatMessageViewSchema = z.object({
  id: z.number(),
  kind: z.enum(["text", "system", "nudge", "prompt"]),
  senderAlias: z.string(),
  mine: z.boolean(),
  body: z.string(),
  createdAt: z.string(),
});
export type ChatMessageView = z.infer<typeof ChatMessageViewSchema>;

export const ChatListInputSchema = z.object({
  roomType: ChatRoomTypeSchema,
  roomId: z.string().min(1),
  afterId: z.number().int().min(0).default(0),
});
export type ChatListInput = z.infer<typeof ChatListInputSchema>;
export const ChatListOutputSchema = z.object({
  messages: z.array(ChatMessageViewSchema),
});
export type ChatListOutput = z.infer<typeof ChatListOutputSchema>;

export const ChatSendInputSchema = z.object({
  roomType: ChatRoomTypeSchema,
  roomId: z.string().min(1),
  body: z.string().trim().min(1).max(1000),
});
export type ChatSendInput = z.infer<typeof ChatSendInputSchema>;
