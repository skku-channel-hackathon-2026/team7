import { z } from "zod";

// Blind meeting app contract shared by the server Functions and the WAM.

export const MEETING_WAM_NAME = "meeting";

export const MEETING_FUNCTIONS = {
  open: "meeting.open",
  getMe: "meeting.getMe",
  saveProfile: "meeting.saveProfile",
  list: "meeting.list",
  create: "meeting.create",
  get: "meeting.get",
  apply: "meeting.apply",
  decide: "meeting.decide",
  joinTeam: "meeting.joinTeam",
  cancel: "meeting.cancel",
  linkGroup: "meeting.linkGroup",
  room: "meeting.room",
  sendMessage: "meeting.sendMessage",
  updatePlan: "meeting.updatePlan",
  confirmSchedule: "meeting.confirmSchedule",
  remindSchedule: "meeting.remindSchedule",
  proposePlace: "meeting.proposePlace",
  votePlace: "meeting.votePlace",
  decidePoll: "meeting.decidePoll",
  setAvailability: "meeting.setAvailability",
  decideSlot: "meeting.decideSlot",
  catfishVote: "meeting.catfishVote",
  enterCatfish: "meeting.enterCatfish",
  startMc: "meeting.startMc",
  live: "meeting.live",
  eventVote: "meeting.eventVote",
  nextMc: "meeting.nextMc",
  finish: "meeting.finish",
  submitAfter: "meeting.submitAfter",
  submitReview: "meeting.submitReview",
  history: "meeting.history",
  rank: "meeting.rank",
  privateChat: "meeting.privateChat",
  sendPrivate: "meeting.sendPrivate",
  shareContact: "meeting.shareContact",
  /** Channel native function the WAM calls with the current manager's authority. */
  writeAsManager: "writeGroupMessageAsManager",
} as const;

export const GENDERS = ["male", "female"] as const;
export const TARGET_GENDERS = ["male", "female", "any"] as const;
export type Gender = (typeof GENDERS)[number];
export type TargetGender = (typeof TARGET_GENDERS)[number];

export const DEPARTMENTS = [
  "컴퓨터공학과",
  "소프트웨어학과",
  "전자전기공학부",
  "기계공학부",
  "화학공학부",
  "경영학과",
  "경제학과",
  "글로벌경영학과",
  "심리학과",
  "사회학과",
  "국어국문학과",
  "영어영문학과",
  "법학과",
  "의상학과",
  "건축학과",
  "약학과",
  "생명과학과",
  "수학과",
] as const;

/** Campus coordinates (approximate) used to recommend a meeting area between two schools. */
export const SCHOOLS = [
  { name: "성균관대 인사캠", lat: 37.588, lng: 126.9936 },
  { name: "성균관대 자과캠", lat: 37.2939, lng: 126.9744 },
  { name: "서울대", lat: 37.4599, lng: 126.9519 },
  { name: "연세대", lat: 37.5658, lng: 126.9386 },
  { name: "고려대", lat: 37.5894, lng: 127.0322 },
  { name: "이화여대", lat: 37.5619, lng: 126.9468 },
  { name: "서강대", lat: 37.5509, lng: 126.941 },
  { name: "한양대", lat: 37.5575, lng: 127.0456 },
  { name: "중앙대", lat: 37.5048, lng: 126.9571 },
  { name: "경희대", lat: 37.5967, lng: 127.052 },
  { name: "건국대", lat: 37.5408, lng: 127.0793 },
  { name: "홍익대", lat: 37.5509, lng: 126.9253 },
  { name: "숙명여대", lat: 37.5463, lng: 126.9648 },
  { name: "아주대", lat: 37.2826, lng: 127.0439 },
] as const;

/** Popular meeting areas with coordinates (approximate). */
export const REGION_SPOTS = [
  { name: "혜화", lat: 37.5822, lng: 127.0018 },
  { name: "안암", lat: 37.5863, lng: 127.0292 },
  { name: "성수", lat: 37.5446, lng: 127.0557 },
  { name: "건대입구", lat: 37.5404, lng: 127.0692 },
  { name: "왕십리", lat: 37.5613, lng: 127.0371 },
  { name: "종로", lat: 37.5704, lng: 126.9921 },
  { name: "신촌", lat: 37.5551, lng: 126.9368 },
  { name: "홍대", lat: 37.5572, lng: 126.9245 },
  { name: "이태원", lat: 37.5345, lng: 126.9946 },
  { name: "강남", lat: 37.4979, lng: 127.0276 },
  { name: "잠실", lat: 37.5133, lng: 127.1001 },
  { name: "사당", lat: 37.4765, lng: 126.9816 },
  { name: "판교", lat: 37.3947, lng: 127.1112 },
  { name: "수원역", lat: 37.2659, lng: 127.0 },
  { name: "인계동", lat: 37.264, lng: 127.0317 },
  { name: "성균관대역", lat: 37.3003, lng: 126.971 },
] as const;

const trimmed = (max: number) => z.string().trim().max(max);
const id = z.string().min(1).max(64);

export const ProfileInputSchema = z.object({
  school: trimmed(40).min(1),
  department: trimmed(40).min(1),
  gender: z.enum(GENDERS),
  age: z.number().int().min(18).max(40),
  studentYear: z.number().int().min(10).max(30),
  contact: trimmed(80).default(""),
});
export type ProfileInput = z.infer<typeof ProfileInputSchema>;

export const ListInputSchema = z.object({
  department: trimmed(40).optional(),
});
export type ListInput = z.infer<typeof ListInputSchema>;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeString = z.string().regex(/^\d{2}:\d{2}$/);

/** Only the core facts; date and area are decided later in the group chat. */
export const CreateMeetingInputSchema = z
  .object({
    kind: z.enum(["open", "proposal"]).default("open"),
    department: trimmed(40).min(1),
    size: z.number().int().min(1).max(6),
    targetDepartment: trimmed(40).optional(),
    intro: trimmed(200).default(""),
    /** Signed Desk group target from the command; lets the bot announce in that group. */
    targetToken: z.string().optional(),
  })
  .refine((value) => value.kind === "open" || !!value.targetDepartment, {
    message: "A proposal needs a target department",
  });
export type CreateMeetingInput = z.infer<typeof CreateMeetingInputSchema>;

export const MeetingIdInputSchema = z.object({ meetingId: id });
export type MeetingIdInput = z.infer<typeof MeetingIdInputSchema>;

export const ApplyInputSchema = z.object({
  meetingId: id,
  message: trimmed(200).default(""),
});
export const DecideInputSchema = z.object({
  applicationId: id,
  accept: z.boolean(),
});
export const JoinTeamInputSchema = z.object({
  code: z.string().trim().toUpperCase().min(4).max(12),
});
export const LinkGroupInputSchema = z.object({
  meetingId: id,
  targetToken: z.string().min(1),
});
export const RoomInputSchema = z.object({
  meetingId: id,
});
export const SendMessageInputSchema = z.object({
  meetingId: id,
  body: trimmed(500).min(1),
});
export const UpdatePlanInputSchema = z.object({
  meetingId: id,
  meetDate: dateString,
  meetTime: timeString,
  place: trimmed(80).default(""),
});

export const POLLS = ["date", "region", "place"] as const;
export type PollKind = (typeof POLLS)[number];

export const ProposePlaceInputSchema = z.object({
  meetingId: id,
  poll: z.enum(POLLS).default("place"),
  name: trimmed(60).min(1),
  category: trimmed(20).default(""),
});
export const VotePlaceInputSchema = z.object({
  meetingId: id,
  placeId: id,
});
export const DecidePollInputSchema = z.object({
  meetingId: id,
  placeId: id,
});
const slot = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:00$/);
export const SetAvailabilityInputSchema = z.object({
  meetingId: id,
  /** Every one-hour slot I can make; replaces my previous answer. */
  slots: z.array(slot).max(24 * 14),
});
export const DecideSlotInputSchema = z.object({
  meetingId: id,
  slot,
});
export const CatfishVoteInputSchema = z.object({
  meetingId: id,
  agree: z.boolean(),
});
export const StartMcInputSchema = z.object({
  meetingId: id,
  /** Demo mode compresses programme time so a demo fits in a few minutes. */
  demo: z.boolean().default(false),
});
export const NextMcInputSchema = z.object({
  meetingId: id,
  kind: z.enum(["random", "vote"]).default("random"),
});
export const EventVoteInputSchema = z.object({
  meetingId: id,
  eventId: id,
  targetKey: id,
});
export const SubmitAfterInputSchema = z.object({
  meetingId: id,
  /** Empty means "없음". */
  targetKeys: z.array(id).max(6),
});
const score = z.number().int().min(1).max(5);
export const SubmitReviewInputSchema = z.object({
  meetingId: id,
  /** How much I liked the other team; drives the department rank. */
  partner: score,
  mood: score,
  conversation: score,
  place: score,
  content: score,
  wantAgain: z.boolean(),
  afterReview: trimmed(300).default(""),
  comment: trimmed(300).default(""),
});
export type SubmitReviewInput = z.infer<typeof SubmitReviewInputSchema>;
export const PrivateChatInputSchema = z.object({ chatId: id });
export const SendPrivateInputSchema = z.object({
  chatId: id,
  body: trimmed(500).min(1),
});

/** Function outputs are JSON objects; the precise shapes are the TypeScript types below. */
export const JsonObjectSchema = z.record(z.unknown());

export const MeetingWamArgsSchema = z.object({
  chatId: z.string(),
  chatType: z.string(),
  chatTitle: z.string(),
  managerId: z.string(),
  rootMessageId: z.string().optional(),
  broadcast: z.boolean(),
  targetToken: z.string().optional(),
});
export type MeetingWamArgs = z.infer<typeof MeetingWamArgsSchema>;

// ----- Output types -----

export interface Profile {
  school: string;
  department: string;
  gender: Gender;
  age: number;
  studentYear: number;
  contact: string;
}

/** The only personal information visible before a match. */
export interface BlindProfile {
  school: string;
  department: string;
  age: number;
  studentYear: number;
}

export type MeetingStatus =
  "recruiting" | "matched" | "live" | "finished" | "cancelled";

export interface MeetingCard {
  id: string;
  kind: "open" | "proposal";
  school: string;
  department: string;
  gender: Gender;
  size: number;
  targetGender: TargetGender;
  targetDepartment: string | null;
  guestSchool: string | null;
  guestDepartment: string | null;
  meetDate: string;
  meetTime: string;
  region: string;
  place: string;
  intro: string;
  status: MeetingStatus;
  hostCount: number;
  guestCount: number;
  pendingCount: number;
  isMember: boolean;
  isHost: boolean;
  applied: boolean;
}

export interface ListOutput {
  meetings: MeetingCard[];
  /** Direct proposals addressed to the caller's department. */
  proposals: MeetingCard[];
  /** Meetings with an opposite-gender team the caller joined or applied to. */
  mine: MeetingCard[];
  /** The caller's own team posts that are still recruiting. */
  myPosts: MeetingCard[];
}

export interface ApplicationView {
  id: string;
  school: string;
  department: string;
  message: string;
  status: "pending" | "accepted" | "rejected";
  profile: BlindProfile | null;
}

export interface MeetingDetail {
  meeting: MeetingCard;
  mySide: "host" | "guest" | null;
  hostCode: string | null;
  guestCode: string | null;
  applications: ApplicationView[];
  myApplication: ApplicationView | null;
  linkedGroup: boolean;
}

export interface MemberView {
  key: string;
  alias: string;
  side: "host" | "guest";
  role: "member" | "catfish";
  isMe: boolean;
  profile: BlindProfile;
}

export interface RoomMessage {
  id: string;
  kind: "chat" | "system" | "mc";
  senderKey: string | null;
  senderAlias: string | null;
  body: string;
  createdAt: number;
  mine: boolean;
}

export interface PollOptionView {
  id: string;
  label: string;
  meta: string;
  votes: number;
  votedByMe: boolean;
}

export interface Suggestion {
  name: string;
  category: string;
  note: string;
  /** Naver Map page for the place (reviews and Naver booking). */
  link?: string;
}

/** TimePick-style availability grid for the group chat. */
export interface AvailabilityView {
  dates: string[];
  hours: number[];
  /** slot → aliases of everyone available then. */
  available: Record<string, string[]>;
  mine: string[];
  responded: number;
  total: number;
  best: { slot: string; count: number }[];
}

export interface CatfishView {
  decision: "pending" | "yes" | "no";
  yes: number;
  no: number;
  voters: number;
  myVote: boolean | null;
  /** Invite code for my team's catfish, once the room decided to have one. */
  code: string | null;
  joined: number;
  /** Set when I am a catfish who has not entered yet. */
  waiting: { availableAt: number | null; canEnter: boolean } | null;
}

export interface AfterMatch {
  key: string;
  alias: string;
  chatId: string;
  profile: BlindProfile;
}

export interface AfterView {
  open: boolean;
  submitted: boolean;
  submittedCount: number;
  myChoices: string[];
  matches: AfterMatch[];
}

export interface RoomOutput {
  meeting: MeetingCard;
  mySide: "host" | "guest";
  myRole: "member" | "catfish";
  isHost: boolean;
  members: MemberView[];
  messages: RoomMessage[];
  polls: Record<PollKind, PollOptionView[]>;
  availability: AvailabilityView;
  regionSuggestions: Suggestion[];
  placeSuggestions: Suggestion[];
  linkedGroup: boolean;
  hostCode: string | null;
  guestCode: string | null;
  catfish: CatfishView;
  after: AfterView;
  reviewed: boolean;
}

export type LiveEventKind =
  "start" | "topic" | "mission" | "game" | "vote" | "catfish";

export interface LiveEvent {
  id: string;
  seq: number;
  kind: LiveEventKind;
  title: string;
  body: string;
  startsAt: number;
  endsAt: number;
  active: boolean;
}

export interface LiveVote {
  open: boolean;
  myVote: string | null;
  votedCount: number;
  voterCount: number;
  /** Only the count is ever revealed, and only after the vote closes. */
  receivedByMe: number | null;
}

export interface LiveOutput {
  meetingId: string;
  status: MeetingStatus;
  title: string;
  isDemo: boolean;
  serverNow: number;
  startedAt: number | null;
  elapsedMinutes: number;
  people: number;
  event: LiveEvent | null;
  vote: LiveVote | null;
  candidates: { key: string; alias: string; profile: BlindProfile }[];
}

export interface HistoryRecord {
  meetingId: string;
  meetDate: string;
  myDepartment: string;
  otherDepartment: string | null;
  size: number;
  region: string;
  place: string;
  status: MeetingStatus;
  afterPairs: number;
  myAfterMatches: number;
  reviewed: boolean;
}

export interface HistoryOutput {
  records: HistoryRecord[];
  privateChats: {
    chatId: string;
    meetingId: string;
    partnerAlias: string;
    partner: BlindProfile;
    lastMessage: string | null;
  }[];
}

export interface RankEntry {
  department: string;
  schools: string[];
  rating: number;
  reviews: number;
}

export interface RankOutput {
  entries: RankEntry[];
  /** Real reviews from this channel. */
  totalReviews: number;
  /** Labelled test reviews counted into `entries` (0 when none). */
  sampleReviews: number;
}

export interface PrivateChatOutput {
  chatId: string;
  partnerAlias: string;
  partner: BlindProfile;
  meetDate: string;
  messages: { id: string; mine: boolean; body: string; createdAt: number }[];
}

// ----- Live event content (the server picks one at random) -----

export const EVENT_TOPICS = [
  "최근 가장 재미있었던 일은?",
  "여행을 간다면 어디로 가고 싶나요?",
  "요즘 가장 많이 듣는 노래는?",
  "대학생활에서 꼭 해보고 싶은 것은?",
  "인생 맛집 하나만 추천한다면?",
  "MBTI와 그게 가장 잘 드러나는 순간은?",
  "요즘 가장 빠져 있는 취미는?",
  "각자의 '인생 영화'와 그 이유",
  "이번 학기 최악의 과제 썰",
  "무인도에 하나만 가져간다면?",
  "졸업 전에 이루고 싶은 버킷리스트",
] as const;

export const EVENT_MISSIONS = [
  "🍦 아이스크림 미션! 가위바위보에서 진 두 명이 모두의 아이스크림을 사 오세요.",
  "🍦 아이스크림 미션! 지금까지 가장 많이 웃은 사람과 그 옆 사람이 아이스크림 사 오기.",
  "🍦 아이스크림 미션! 생일이 가장 빠른 사람이 상대 팀 한 명을 골라 편의점 다녀오기.",
  "건너편 팀원과 자리를 한 칸씩 바꿔 앉아 보세요.",
  "모두 함께 단체 사진을 한 장 찍어 주세요.",
  "서로의 첫인상을 한 단어로 말해 주세요.",
] as const;

export const EVENT_GAMES = [
  "밸런스 게임: '연락 자주 하기 vs 만나서 많이 놀기' — 한 명씩 고르고 이유 말하기",
  "이미지 게임: '답장이 가장 늦을 것 같은 사람'을 하나 둘 셋에 동시에 가리키기",
  "369 게임! 틀린 사람이 다음 대화 주제를 정해요.",
  "초성 게임: ㅅㄹ — 돌아가며 단어 말하기 (5초 안에 못 하면 벌칙)",
  "공통점 찾기: 상대 팀과 공통점 3개를 먼저 찾는 팀이 승리!",
  "눈치 게임: 1부터 6까지 겹치지 않게 외치기",
] as const;
