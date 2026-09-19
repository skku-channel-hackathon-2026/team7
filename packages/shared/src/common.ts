import { z } from "zod";

export const MEETING_WAM_NAME = "meeting";

export const DEPARTMENTS = [
  "컴퓨터공학과",
  "소프트웨어학과",
  "전자전기공학부",
  "기계공학부",
  "화학공학부",
  "신소재공학부",
  "건축학과",
  "산업공학과",
  "경영학과",
  "경제학과",
  "통계학과",
  "국어국문학과",
  "영어영문학과",
  "사학과",
  "철학과",
  "심리학과",
  "사회학과",
  "정치외교학과",
  "행정학과",
  "미디어커뮤니케이션학과",
  "법학과",
  "교육학과",
  "수학과",
  "물리학과",
  "화학과",
  "생명과학과",
  "약학과",
  "의학과",
  "간호학과",
  "체육학과",
  "디자인학과",
  "음악학과",
] as const;

export const REGIONS = [
  "성수",
  "건대",
  "강남",
  "홍대",
  "신촌",
  "혜화",
  "잠실",
  "종로",
] as const;

export const PLACE_CATEGORIES = [
  "음식점",
  "카페",
  "술집",
  "보드게임카페",
  "방탈출",
  "기타",
] as const;

export const GenderSchema = z.enum(["male", "female"]);
export type Gender = z.infer<typeof GenderSchema>;
export const GenderConditionSchema = z.enum(["male", "female", "any"]);
export type GenderCondition = z.infer<typeof GenderConditionSchema>;

export const SideSchema = z.enum(["a", "b"]);
export type Side = z.infer<typeof SideSchema>;

export const MeetingKindSchema = z.enum(["recruit", "proposal"]);
export type MeetingKind = z.infer<typeof MeetingKindSchema>;

export const MeetingStatusSchema = z.enum([
  "recruiting",
  "matched",
  "in_progress",
  "finished",
  "cancelled",
]);
export type MeetingStatus = z.infer<typeof MeetingStatusSchema>;

export const GENDER_LABEL: Record<GenderCondition, string> = {
  male: "남자",
  female: "여자",
  any: "성별 무관",
};

export const ProfileSchema = z.object({
  dept: z.string().min(1).max(40),
  admissionYear: z.number().int().min(0).max(99),
  age: z.number().int().min(18).max(40),
  gender: GenderSchema,
});
export type Profile = z.infer<typeof ProfileSchema>;

const SideConditionShape = z.object({
  dept: z.string().max(40).default(""),
  gender: GenderConditionSchema.default("any"),
  ageMin: z.number().int().min(18).max(40).default(18),
  ageMax: z.number().int().min(18).max(40).default(40),
  yearMin: z.number().int().min(0).max(99).default(0),
  yearMax: z.number().int().min(0).max(99).default(99),
});

export const SideConditionSchema = SideConditionShape.refine(
  (v) => v.ageMin <= v.ageMax && v.yearMin <= v.yearMax,
  { message: "범위의 최솟값이 최댓값보다 클 수 없어요" },
);
export type SideCondition = z.infer<typeof SideConditionSchema>;

export const MemberViewSchema = z.object({
  memberId: z.number(),
  alias: z.string(),
  side: SideSchema,
  dept: z.string(),
  admissionYear: z.number(),
  age: z.number(),
  gender: GenderSchema,
  isMe: z.boolean(),
  isDemo: z.boolean(),
  scheduleAcked: z.boolean(),
});
export type MemberView = z.infer<typeof MemberViewSchema>;

export const PlaceInfoSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  url: z.string(),
  note: z.string(),
  reservedFor: z.string(),
});
export type PlaceInfo = z.infer<typeof PlaceInfoSchema>;

export const MeetingSummarySchema = z.object({
  id: z.string(),
  kind: MeetingKindSchema,
  title: z.string(),
  description: z.string(),
  size: z.number(),
  startAt: z.string(),
  region: z.string(),
  status: MeetingStatusSchema,
  condA: SideConditionSchema,
  condB: SideConditionSchema,
  countA: z.number(),
  countB: z.number(),
  isHost: z.boolean(),
  mySide: SideSchema.nullable(),
  applicableSides: z.array(SideSchema),
  createdAt: z.string(),
});
export type MeetingSummary = z.infer<typeof MeetingSummarySchema>;

export const MeetingDetailSchema = MeetingSummarySchema.extend({
  members: z.array(MemberViewSchema),
  place: PlaceInfoSchema.nullable(),
  startedAt: z.string().nullable(),
  speed: z.number(),
  matchedAt: z.string().nullable(),
  myMemberId: z.number().nullable(),
  myScheduleAcked: z.boolean(),
  pendingAcks: z.number(),
});
export type MeetingDetail = z.infer<typeof MeetingDetailSchema>;

export function describeCondition(cond: SideCondition): string {
  const head = [
    cond.dept || "모든 학과",
    cond.gender === "any" ? "" : GENDER_LABEL[cond.gender],
  ]
    .filter(Boolean)
    .join(" ");
  const year =
    cond.yearMin === 0 && cond.yearMax === 99
      ? ""
      : cond.yearMin === cond.yearMax
        ? `${cond.yearMin}학번`
        : `${cond.yearMin}~${cond.yearMax}학번`;
  const age =
    cond.ageMin === 18 && cond.ageMax === 40
      ? ""
      : cond.ageMin === cond.ageMax
        ? `${cond.ageMin}세`
        : `${cond.ageMin}~${cond.ageMax}세`;
  return [head, year, age].filter(Boolean).join(" · ");
}

export function matchesCondition(
  cond: SideCondition,
  profile: Profile,
): boolean {
  if (cond.dept && cond.dept !== profile.dept) return false;
  if (cond.gender !== "any" && cond.gender !== profile.gender) return false;
  if (profile.age < cond.ageMin || profile.age > cond.ageMax) return false;
  if (
    profile.admissionYear < cond.yearMin ||
    profile.admissionYear > cond.yearMax
  )
    return false;
  return true;
}
