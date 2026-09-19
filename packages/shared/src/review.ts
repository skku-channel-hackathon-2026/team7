import { z } from "zod";

const ScoreSchema = z.number().int().min(1).max(5);

export const ReviewInputSchema = z.object({
  meetingId: z.string().min(1),
  mood: ScoreSchema,
  talk: ScoreSchema,
  place: ScoreSchema,
  content: ScoreSchema,
  rejoin: z.boolean(),
  comment: z.string().trim().max(500).default(""),
});
export type ReviewInput = z.infer<typeof ReviewInputSchema>;

export const ReviewViewSchema = z.object({
  mood: ScoreSchema,
  talk: ScoreSchema,
  place: ScoreSchema,
  content: ScoreSchema,
  rejoin: z.boolean(),
  comment: z.string(),
  createdAt: z.string(),
});
export type ReviewView = z.infer<typeof ReviewViewSchema>;

export const AfterReviewViewSchema = z.object({
  roomId: z.string(),
  partnerAlias: z.string(),
  met: z.boolean(),
  score: ScoreSchema.nullable(),
  comment: z.string(),
  submitted: z.boolean(),
});
export type AfterReviewView = z.infer<typeof AfterReviewViewSchema>;

export const ReviewGetOutputSchema = z.object({
  canReview: z.boolean(),
  review: ReviewViewSchema.nullable(),
  afterReviews: z.array(AfterReviewViewSchema),
});
export type ReviewGetOutput = z.infer<typeof ReviewGetOutputSchema>;

export const AfterReviewInputSchema = z.object({
  roomId: z.string().min(1),
  met: z.boolean(),
  score: ScoreSchema.nullable(),
  comment: z.string().trim().max(500).default(""),
});
export type AfterReviewInput = z.infer<typeof AfterReviewInputSchema>;

export const RecordViewSchema = z.object({
  meetingId: z.string(),
  date: z.string(),
  title: z.string(),
  myDept: z.string(),
  otherDept: z.string(),
  size: z.number(),
  region: z.string(),
  placeName: z.string(),
  status: z.string(),
  afterCount: z.number(),
  reviewed: z.boolean(),
});
export type RecordView = z.infer<typeof RecordViewSchema>;
export const RecordListOutputSchema = z.object({
  records: z.array(RecordViewSchema),
});
export type RecordListOutput = z.infer<typeof RecordListOutputSchema>;

export const DeptStatSchema = z.object({
  dept: z.string(),
  meetings: z.number(),
  recentMeetings: z.number(),
  matchRate: z.number().nullable(),
  afterRate: z.number().nullable(),
  avgSatisfaction: z.number().nullable(),
  reviewCount: z.number(),
  rejoinRate: z.number().nullable(),
});
export type DeptStat = z.infer<typeof DeptStatSchema>;
export const StatsOutputSchema = z.object({
  stats: z.array(DeptStatSchema),
  minSample: z.number(),
});
export type StatsOutput = z.infer<typeof StatsOutputSchema>;
