import { z } from "zod";
import { MemberViewSchema } from "./common.js";

export const AfterMatchSchema = z.object({
  roomId: z.string(),
  partner: MemberViewSchema,
});
export type AfterMatch = z.infer<typeof AfterMatchSchema>;

export const AfterStateSchema = z.object({
  meetingId: z.string(),
  open: z.boolean(),
  submitted: z.boolean(),
  choices: z.array(z.number()),
  none: z.boolean(),
  candidates: z.array(MemberViewSchema),
  final: z.boolean(),
  waitingCount: z.number(),
  matches: z.array(AfterMatchSchema),
});
export type AfterState = z.infer<typeof AfterStateSchema>;

export const AfterGetInputSchema = z.object({ meetingId: z.string().min(1) });
export type AfterGetInput = z.infer<typeof AfterGetInputSchema>;
export const AfterGetOutputSchema = z.object({ after: AfterStateSchema });
export type AfterGetOutput = z.infer<typeof AfterGetOutputSchema>;

export const AfterSubmitInputSchema = z.object({
  meetingId: z.string().min(1),
  targetMemberIds: z.array(z.number().int()).max(10),
});
export type AfterSubmitInput = z.infer<typeof AfterSubmitInputSchema>;

export const DmRoomViewSchema = z.object({
  roomId: z.string(),
  meetingId: z.string(),
  meetingTitle: z.string(),
  partner: MemberViewSchema,
  myConsent: z.boolean(),
  partnerConsent: z.boolean(),
  myContact: z.string(),
  partnerContact: z.string().nullable(),
  createdAt: z.string(),
});
export type DmRoomView = z.infer<typeof DmRoomViewSchema>;

export const DmListOutputSchema = z.object({
  rooms: z.array(DmRoomViewSchema),
});
export type DmListOutput = z.infer<typeof DmListOutputSchema>;
export const DmGetInputSchema = z.object({ roomId: z.string().min(1) });
export type DmGetInput = z.infer<typeof DmGetInputSchema>;
export const DmGetOutputSchema = z.object({ room: DmRoomViewSchema });
export type DmGetOutput = z.infer<typeof DmGetOutputSchema>;
export const DmConsentInputSchema = z.object({
  roomId: z.string().min(1),
  consent: z.boolean(),
  contact: z.string().trim().max(100).default(""),
});
export type DmConsentInput = z.infer<typeof DmConsentInputSchema>;
