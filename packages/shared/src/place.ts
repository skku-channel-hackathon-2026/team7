import { z } from "zod";
import { PlaceInfoSchema } from "./common.js";

export const PlaceViewSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  category: z.string(),
  region: z.string(),
  address: z.string(),
  capacityMax: z.number(),
  priceLevel: z.number(),
  tags: z.array(z.string()),
  rating: z.number(),
  reviewCount: z.number(),
  perk: z.string().nullable(),
  reservationUrl: z.string(),
  mapUrl: z.string(),
  reason: z.string(),
  recentReviews: z.array(z.string()),
});
export type PlaceView = z.infer<typeof PlaceViewSchema>;

export const PlaceRecommendInputSchema = z.object({
  meetingId: z.string().optional(),
  region: z.string().max(20).optional(),
  category: z.string().max(20).optional(),
  headcount: z.number().int().min(2).max(20).optional(),
  startAt: z.string().optional(),
});
export type PlaceRecommendInput = z.infer<typeof PlaceRecommendInputSchema>;
export const PlaceRecommendOutputSchema = z.object({
  places: z.array(PlaceViewSchema),
});
export type PlaceRecommendOutput = z.infer<typeof PlaceRecommendOutputSchema>;

export const PlaceSelectInputSchema = z.object({
  meetingId: z.string().min(1),
  placeId: z.string().min(1),
});
export type PlaceSelectInput = z.infer<typeof PlaceSelectInputSchema>;
export const PlaceSelectOutputSchema = z.object({ place: PlaceInfoSchema });
export type PlaceSelectOutput = z.infer<typeof PlaceSelectOutputSchema>;

export const PlaceReserveInputSchema = z.object({
  meetingId: z.string().min(1),
  reservedFor: z.string().trim().min(1).max(100),
  note: z.string().trim().max(200).default(""),
});
export type PlaceReserveInput = z.infer<typeof PlaceReserveInputSchema>;
