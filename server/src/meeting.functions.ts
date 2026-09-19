import { Injectable } from "@nestjs/common";
import {
  ApplyInputSchema,
  CatfishVoteInputSchema,
  CommandActionInputSchema,
  CreateMeetingInputSchema,
  DecideSlotInputSchema,
  DecideInputSchema,
  DecidePollInputSchema,
  EventVoteInputSchema,
  JoinTeamInputSchema,
  JsonObjectSchema,
  LinkGroupInputSchema,
  ListInputSchema,
  MEETING_FUNCTIONS,
  MEETING_WAM_NAME,
  MeetingIdInputSchema,
  NextMcInputSchema,
  POLLS,
  PrivateChatInputSchema,
  ProfileInputSchema,
  ProposePlaceInputSchema,
  RoomInputSchema,
  SendMessageInputSchema,
  SendPrivateInputSchema,
  SetAvailabilityInputSchema,
  StartMcInputSchema,
  SubmitAfterInputSchema,
  SubmitReviewInputSchema,
  UpdatePlanInputSchema,
  VotePlaceInputSchema,
  type AfterView,
  type ApplicationView,
  type AvailabilityView,
  type BlindProfile,
  type CatfishView,
  type CommandActionInput,
  type CreateMeetingInput,
  type HistoryOutput,
  type ListInput,
  type ListOutput,
  type LiveEventKind,
  type LiveOutput,
  type MeetingCard,
  type MeetingDetail,
  type MeetingWamArgs,
  type MemberView,
  type PollKind,
  type PollOptionView,
  type PrivateChatOutput,
  type Profile,
  type ProfileInput,
  type RankOutput,
  type RoomOutput,
  type SubmitReviewInput,
} from "@tutorial/shared";
import {
  CommandResultSchema,
  Ctx,
  Description,
  Func,
  FunctionCallError,
  FunctionCallErrorCode,
  Input,
  InputSchema,
  NativeFunctionClient,
  OutputSchema,
  TokenManager,
  type Context,
} from "@channel.io/app-sdk-server";
import { z } from "zod";
import { appId, appSecret } from "./config.js";
import { getDatabase } from "./database.js";
import {
  AVAILABILITY_HOURS,
  LIVE,
  aliasFor,
  availabilityDates,
  bestSlots,
  slotOf,
  between,
  decideTick,
  inviteCode,
  memberKey,
  mutualPairs,
  newId,
  pickEvent,
  placeSuggestions,
  regionSuggestions,
  toReal,
} from "./meeting.logic.js";
import {
  createTutorialTargetToken,
  readTutorialTargetToken,
} from "./target-token.js";

type Json = Record<string, unknown>;
type Bind = string | number | null;
type Side = "host" | "guest";

interface MeetingRow {
  id: string;
  channel_id: string;
  kind: "open" | "proposal";
  host_id: string;
  school: string;
  department: string;
  gender: "male" | "female";
  size: number;
  target_gender: "male" | "female" | "any";
  target_department: string | null;
  meet_date: string;
  meet_time: string;
  region: string;
  intro: string;
  status: MeetingCard["status"];
  guest_school: string | null;
  guest_department: string | null;
  place: string;
  host_code: string;
  guest_code: string | null;
  notify_group_id: string | null;
  started_at: number | null;
  mc_speed: number;
  event_seq: number;
  next_event_at: number | null;
  next_vote_at: number | null;
  catfish: number | null;
  host_catfish_code: string | null;
  guest_catfish_code: string | null;
  finished_at: number | null;
}

interface CardRow extends MeetingRow {
  host_count: number;
  guest_count: number;
  pending_count: number;
  my_side: Side | null;
  applied: number;
}

interface ProfileRow {
  school: string;
  department: string;
  gender: "male" | "female";
  age: number;
  student_year: number;
  contact: string;
}

interface MemberRow {
  manager_id: string;
  side: Side;
  role: "member" | "catfish";
  entered_at: number | null;
  schedule_confirmed: number;
  school: string | null;
  department: string | null;
  age: number | null;
  student_year: number | null;
}

interface Member {
  managerId: string;
  key: string;
  alias: string;
  side: Side;
  role: "member" | "catfish";
  /** Regular members are always present; a catfish only after entering. */
  present: boolean;
  scheduleConfirmed: boolean;
  profile: BlindProfile;
}

interface EventRow {
  id: string;
  seq: number;
  kind: LiveEventKind;
  title: string;
  body: string;
  starts_at: number;
  ends_at: number;
}

// Emojis are kept for what happens during the meeting itself.
const EVENT_EMOJI: Record<LiveEventKind, string> = {
  start: "🎬",
  topic: "💬",
  mission: "🎯",
  game: "🎲",
  vote: "💘",
  catfish: "🐟",
};

const CARD_SELECT = `
  SELECT m.*,
    (SELECT COUNT(*) FROM meeting_members mm WHERE mm.meeting_id = m.id AND mm.side = 'host' AND mm.role = 'member') AS host_count,
    (SELECT COUNT(*) FROM meeting_members mm WHERE mm.meeting_id = m.id AND mm.side = 'guest' AND mm.role = 'member') AS guest_count,
    (SELECT COUNT(*) FROM meeting_applications a WHERE a.meeting_id = m.id AND a.status = 'pending') AS pending_count,
    (SELECT mm.side FROM meeting_members mm WHERE mm.meeting_id = m.id AND mm.manager_id = ?1) AS my_side,
    EXISTS (SELECT 1 FROM meeting_applications a WHERE a.meeting_id = m.id AND a.applicant_id = ?1 AND a.status = 'pending') AS applied
  FROM meetings m`;

function fail(
  message: string,
  code: FunctionCallErrorCode = FunctionCallErrorCode.BadRequest,
): never {
  throw new FunctionCallError(message, code, { type: "meeting" });
}

async function all<T>(sql: string, ...binds: Bind[]): Promise<T[]> {
  const { results } = await getDatabase()
    .prepare(sql)
    .bind(...binds)
    .all<T>();
  return results ?? [];
}

function first<T>(sql: string, ...binds: Bind[]): Promise<T | null> {
  return getDatabase()
    .prepare(sql)
    .bind(...binds)
    .first<T>();
}

async function run(sql: string, ...binds: Bind[]): Promise<number> {
  const result = (await getDatabase()
    .prepare(sql)
    .bind(...binds)
    .run()) as { meta?: { changes?: number } } | undefined;
  return result?.meta?.changes ?? 0;
}

function opposite(gender: "male" | "female"): "male" | "female" {
  return gender === "male" ? "female" : "male";
}

function toCard(row: CardRow, managerId: string): MeetingCard {
  return {
    id: row.id,
    kind: row.kind,
    school: row.school,
    department: row.department,
    gender: row.gender,
    size: row.size,
    targetGender: row.target_gender,
    targetDepartment: row.target_department,
    guestSchool: row.guest_school,
    guestDepartment: row.guest_department,
    meetDate: row.meet_date,
    meetTime: row.meet_time,
    region: row.region,
    place: row.place,
    intro: row.intro,
    status: row.status,
    hostCount: Number(row.host_count),
    guestCount: Number(row.guest_count),
    pendingCount: Number(row.pending_count),
    isMember: !!row.my_side,
    isHost: row.host_id === managerId,
    applied: !!Number(row.applied),
  };
}

function blind(row: {
  school: string | null;
  department: string | null;
  age: number | null;
  student_year: number | null;
}): BlindProfile {
  return {
    school: row.school ?? "",
    department: row.department ?? "미등록",
    age: Number(row.age ?? 0),
    studentYear: Number(row.student_year ?? 0),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

@Injectable()
export class MeetingFunctions {
  constructor(
    private readonly tokenManager: TokenManager,
    private readonly nativeClient: NativeFunctionClient,
  ) {}

  // ----- Channel plumbing -----

  /** Every meeting action is attributed to the signed Channel caller. */
  private me(ctx: Context): { channelId: string; managerId: string } {
    const managerId = ctx.caller.type === "manager" ? ctx.caller.id : undefined;
    if (!managerId || !ctx.channel?.id)
      fail("채널 매니저로 로그인한 상태에서만 사용할 수 있어요.");
    return { channelId: ctx.channel.id, managerId };
  }

  /** Posts as the app bot into the Channel team chat linked to a meeting. */
  private async notifyGroup(
    channelId: string,
    groupId: string | null,
    text: string,
  ): Promise<boolean> {
    if (!groupId) return false;
    try {
      const token = await withTimeout(
        this.tokenManager.getChannelToken({ channelId }),
        5000,
      );
      const api = this.nativeClient.createProxyApi(token.accessToken);
      await withTimeout(
        api.writeGroupMessage({
          channelId,
          groupId,
          dto: { plainText: text, botName: "과메기 MC" },
        }),
        5000,
      );
      return true;
    } catch {
      // Notifications are best effort; the in-app room keeps the full record.
      return false;
    }
  }

  private groupFromToken(
    ctx: Context,
    managerId: string,
    token: string | undefined,
  ): string | null {
    if (!token) return null;
    const target = readTutorialTargetToken(token, appSecret);
    if (
      !target ||
      target.expiresAt <= Date.now() ||
      target.channelId !== ctx.channel.id ||
      target.managerId !== managerId
    )
      return null;
    return target.groupId;
  }

  // ----- Data helpers -----

  private async profileOf(
    channelId: string,
    managerId: string,
  ): Promise<ProfileRow | null> {
    return first<ProfileRow>(
      "SELECT school, department, gender, age, student_year, contact FROM meeting_profiles WHERE channel_id = ? AND manager_id = ?",
      channelId,
      managerId,
    );
  }

  private async requireProfile(
    channelId: string,
    managerId: string,
  ): Promise<ProfileRow> {
    const profile = await this.profileOf(channelId, managerId);
    if (!profile) fail("먼저 블라인드 프로필을 등록해 주세요.");
    return profile;
  }

  private async card(
    channelId: string,
    managerId: string,
    meetingId: string,
  ): Promise<{ row: CardRow; card: MeetingCard }> {
    const row = await first<CardRow>(
      `${CARD_SELECT} WHERE m.id = ?2 AND m.channel_id = ?3`,
      managerId,
      meetingId,
      channelId,
    );
    if (!row) fail("미팅을 찾을 수 없어요.", FunctionCallErrorCode.NotFound);
    return { row, card: toCard(row, managerId) };
  }

  private async members(meetingId: string): Promise<Member[]> {
    const rows = await all<MemberRow>(
      `SELECT mm.manager_id, mm.side, mm.role, mm.entered_at, mm.schedule_confirmed,
         p.school, p.department, p.age, p.student_year
       FROM meeting_members mm
       JOIN meetings m ON m.id = mm.meeting_id
       LEFT JOIN meeting_profiles p ON p.channel_id = m.channel_id AND p.manager_id = mm.manager_id
       WHERE mm.meeting_id = ?
       ORDER BY mm.side = 'guest', mm.role = 'catfish', mm.joined_at`,
      meetingId,
    );
    const counters = { host: 0, guest: 0 };
    return rows.map((row) => ({
      managerId: row.manager_id,
      key: memberKey(appSecret, meetingId, row.manager_id),
      alias:
        row.role === "catfish"
          ? `${row.side === "host" ? "A" : "B"}메기`
          : aliasFor(row.side, counters[row.side]++),
      side: row.side,
      role: row.role,
      present: row.role === "member" || !!row.entered_at,
      scheduleConfirmed: !!row.schedule_confirmed,
      profile: blind(row),
    }));
  }

  private async requireMember(
    ctx: Context,
    meetingId: string,
  ): Promise<{
    channelId: string;
    managerId: string;
    row: CardRow;
    card: MeetingCard;
    members: Member[];
    me: Member;
  }> {
    const { channelId, managerId } = this.me(ctx);
    const { row, card } = await this.card(channelId, managerId, meetingId);
    const members = await this.members(meetingId);
    const me = members.find((member) => member.managerId === managerId);
    if (!me) fail("이 미팅의 참가자만 볼 수 있어요.");
    return { channelId, managerId, row, card, members, me };
  }

  /** Like requireMember, but a catfish must have entered the meeting first. */
  private async requirePresent(ctx: Context, meetingId: string) {
    const context = await this.requireMember(ctx, meetingId);
    if (!context.me.present)
      fail("메기는 미팅 시작 1시간 후 입장한 뒤에 참여할 수 있어요.");
    return context;
  }

  private systemMessage(
    meetingId: string,
    body: string,
    kind: "system" | "mc" = "system",
    at = Date.now(),
  ) {
    return run(
      "INSERT INTO meeting_messages (id, meeting_id, sender_id, kind, body, created_at) VALUES (?, ?, NULL, ?, ?, ?)",
      newId("msg"),
      meetingId,
      kind,
      body,
      at,
    );
  }

  private meetingTitle(row: MeetingRow): string {
    return `${row.department} × ${row.guest_department ?? row.target_department ?? "상대 학과"}`;
  }

  // ----- Command → WAM -----

  @Func(MEETING_FUNCTIONS.open)
  @Description("Open the blind meeting WAM")
  @InputSchema(CommandActionInputSchema)
  @OutputSchema(CommandResultSchema)
  open(
    @Ctx() ctx: Context,
    @Input() params: CommandActionInput,
  ): z.infer<typeof CommandResultSchema> {
    const chat = params.chat;
    const managerId = ctx.caller.id ?? "";
    const attributes = params.trigger?.attributes ?? {};
    // The same short-lived signed target as the tutorial: it proves which group
    // the command ran in so the bot can later announce meeting events there.
    const targetToken =
      chat?.type === "group" &&
      chat.id &&
      ctx.caller.type === "manager" &&
      managerId
        ? createTutorialTargetToken(
            {
              channelId: ctx.channel.id,
              groupId: chat.id,
              managerId,
              expiresAt: Date.now() + 30 * 60 * 1000,
            },
            appSecret,
          )
        : undefined;

    const wamArgs = {
      chatId: chat?.id ?? "",
      chatType: chat?.type ?? "",
      chatTitle: attributes.chatTitle ?? "",
      managerId,
      rootMessageId: attributes.rootMessageId,
      broadcast: attributes.broadcast === "true",
      targetToken,
    } satisfies MeetingWamArgs;

    return {
      type: "wam",
      attributes: { appId, name: MEETING_WAM_NAME, wamArgs },
    };
  }

  // ----- Blind profile -----

  @Func(MEETING_FUNCTIONS.getMe)
  @Description("Return the caller's profile and the live meeting they are in")
  @InputSchema(z.object({}))
  @OutputSchema(JsonObjectSchema)
  async getMe(@Ctx() ctx: Context): Promise<Json> {
    const { channelId, managerId } = this.me(ctx);
    const row = await this.profileOf(channelId, managerId);
    const profile: Profile | null = row
      ? {
          school: row.school,
          department: row.department,
          gender: row.gender,
          age: row.age,
          studentYear: row.student_year,
          contact: row.contact,
        }
      : null;
    // Lets every participant's WAM switch to the event screen as soon as any
    // one of them starts the meeting, whatever page they are on.
    const live = await first<{ id: string }>(
      `SELECT m.id FROM meetings m JOIN meeting_members mm ON mm.meeting_id = m.id
       WHERE mm.manager_id = ? AND m.channel_id = ? AND m.status = 'live'
         AND (mm.role = 'member' OR mm.entered_at IS NOT NULL)
       ORDER BY m.started_at DESC LIMIT 1`,
      managerId,
      channelId,
    );
    return { profile, liveMeetingId: live?.id ?? null };
  }

  @Func(MEETING_FUNCTIONS.saveProfile)
  @Description("Create or update the caller's blind profile")
  @InputSchema(ProfileInputSchema)
  @OutputSchema(JsonObjectSchema)
  async saveProfile(
    @Ctx() ctx: Context,
    @Input() input: ProfileInput,
  ): Promise<Json> {
    const { channelId, managerId } = this.me(ctx);
    const now = Date.now();
    await run(
      `INSERT INTO meeting_profiles (channel_id, manager_id, school, department, gender, age, student_year, contact, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (channel_id, manager_id) DO UPDATE SET
         school = excluded.school, department = excluded.department, gender = excluded.gender, age = excluded.age,
         student_year = excluded.student_year, contact = excluded.contact, updated_at = excluded.updated_at`,
      channelId,
      managerId,
      input.school,
      input.department,
      input.gender,
      input.age,
      input.studentYear,
      input.contact,
      now,
      now,
    );
    return { profile: input };
  }

  // ----- Explore / create / apply -----

  @Func(MEETING_FUNCTIONS.list)
  @Description(
    "List opposite-gender recruiting meetings, proposals and my meetings",
  )
  @InputSchema(ListInputSchema)
  @OutputSchema(JsonObjectSchema)
  async list(@Ctx() ctx: Context, @Input() input: ListInput): Promise<Json> {
    const { channelId, managerId } = this.me(ctx);
    const profile = await this.requireProfile(channelId, managerId);
    // Men only see women's posts and women only see men's posts.
    const binds: Bind[] = [managerId, channelId, opposite(profile.gender)];
    let departmentFilter = "";
    if (input.department) {
      binds.push(input.department);
      departmentFilter = `AND m.department = ?${binds.length}`;
    }
    const open = await all<CardRow>(
      `${CARD_SELECT} WHERE m.channel_id = ?2 AND m.kind = 'open' AND m.status = 'recruiting'
       AND m.gender = ?3 ${departmentFilter}
       ORDER BY m.created_at DESC LIMIT 50`,
      ...binds,
    );
    const proposals = await all<CardRow>(
      `${CARD_SELECT} WHERE m.channel_id = ?2 AND m.kind = 'proposal' AND m.status = 'recruiting'
       AND m.gender = ?3 AND m.target_department = ?4 AND m.host_id != ?1
       ORDER BY m.created_at DESC LIMIT 20`,
      managerId,
      channelId,
      opposite(profile.gender),
      profile.department,
    );
    const mine = await all<CardRow>(
      `${CARD_SELECT} WHERE m.channel_id = ?2 AND m.status != 'cancelled' AND (
         EXISTS (SELECT 1 FROM meeting_members mm WHERE mm.meeting_id = m.id AND mm.manager_id = ?1)
         OR EXISTS (SELECT 1 FROM meeting_applications a WHERE a.meeting_id = m.id AND a.applicant_id = ?1 AND a.status = 'pending'))
       ORDER BY m.created_at DESC LIMIT 30`,
      managerId,
      channelId,
    );
    const output: ListOutput = {
      meetings: open.map((row) => toCard(row, managerId)),
      proposals: proposals.map((row) => toCard(row, managerId)),
      mine: mine.map((row) => toCard(row, managerId)),
    };
    return { ...output };
  }

  @Func(MEETING_FUNCTIONS.create)
  @Description(
    "Post a recruiting meeting (school, department, gender, size only)",
  )
  @InputSchema(CreateMeetingInputSchema)
  @OutputSchema(JsonObjectSchema)
  async create(
    @Ctx() ctx: Context,
    @Input() input: CreateMeetingInput,
  ): Promise<Json> {
    const { channelId, managerId } = this.me(ctx);
    const profile = await this.requireProfile(channelId, managerId);
    if (
      input.kind === "proposal" &&
      input.targetDepartment === input.department
    )
      fail("다른 학과에만 미팅을 제안할 수 있어요.");
    const id = newId("mt");
    const now = Date.now();
    const groupId = this.groupFromToken(ctx, managerId, input.targetToken);
    // Date and area are chosen later by the matched group, so they start empty.
    await run(
      `INSERT INTO meetings (id, channel_id, kind, host_id, school, department, gender, size, target_gender, target_department,
         age_min, age_max, year_min, year_max, meet_date, meet_time, region, intro, host_code, notify_group_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', ?, ?, ?, ?, ?)`,
      id,
      channelId,
      input.kind,
      managerId,
      profile.school,
      input.department,
      profile.gender,
      input.size,
      opposite(profile.gender),
      input.kind === "proposal" ? (input.targetDepartment ?? null) : null,
      profile.age,
      profile.age,
      profile.student_year,
      profile.student_year,
      input.intro,
      inviteCode(),
      groupId,
      now,
      now,
    );
    await run(
      "INSERT INTO meeting_members (meeting_id, manager_id, side, joined_at) VALUES (?, ?, 'host', ?)",
      id,
      managerId,
      now,
    );
    const who = `${profile.school} ${input.department} ${profile.gender === "male" ? "남자" : "여자"} ${input.size}명`;
    const announced = await this.notifyGroup(
      channelId,
      groupId,
      input.kind === "proposal"
        ? `${who} → ${input.targetDepartment}에 미팅 제안이 도착했어요! /meeting 에서 확인하세요.`
        : `${who} 미팅 모집! /meeting 에서 신청할 수 있어요.`,
    );
    return { meetingId: id, announced };
  }

  @Func(MEETING_FUNCTIONS.get)
  @Description("Meeting detail with blind applicant profiles for the host")
  @InputSchema(MeetingIdInputSchema)
  @OutputSchema(JsonObjectSchema)
  async get(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof MeetingIdInputSchema>,
  ): Promise<Json> {
    const { channelId, managerId } = this.me(ctx);
    const { row, card } = await this.card(
      channelId,
      managerId,
      input.meetingId,
    );
    const applications = card.isHost
      ? await all<ApplicationRow>(APPLICATION_SELECT, row.id, "%")
      : [];
    const mine = await first<ApplicationRow>(
      `${APPLICATION_SELECT} AND a.applicant_id = ?3`,
      row.id,
      "%",
      managerId,
    );
    const detail: MeetingDetail = {
      meeting: card,
      mySide: card.isMember ? (row.my_side ?? null) : null,
      hostCode: row.my_side === "host" ? row.host_code : null,
      guestCode: row.my_side === "guest" ? row.guest_code : null,
      applications: applications.map(toApplication),
      myApplication: mine ? toApplication(mine) : null,
      linkedGroup: !!row.notify_group_id,
    };
    return { ...detail };
  }

  @Func(MEETING_FUNCTIONS.apply)
  @Description("Apply to a recruiting meeting or accept a direct proposal")
  @InputSchema(ApplyInputSchema)
  @OutputSchema(JsonObjectSchema)
  async apply(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof ApplyInputSchema>,
  ): Promise<Json> {
    const { channelId, managerId } = this.me(ctx);
    const profile = await this.requireProfile(channelId, managerId);
    const { row, card } = await this.card(
      channelId,
      managerId,
      input.meetingId,
    );
    if (row.status !== "recruiting") fail("이미 모집이 끝난 미팅이에요.");
    if (card.isMember) fail("이미 참여 중인 미팅이에요.");
    if (row.gender === profile.gender)
      fail("이성 팀의 모집글에만 신청할 수 있어요.");
    if (profile.school === row.school && profile.department === row.department)
      fail("같은 학교·학과 모집글에는 신청할 수 없어요.");
    if (row.kind === "proposal" && row.target_department !== profile.department)
      fail(`${row.target_department} 학생만 이 제안을 수락할 수 있어요.`);

    const inserted = await run(
      `INSERT INTO meeting_applications (id, meeting_id, applicant_id, department, message, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)
       ON CONFLICT (meeting_id, applicant_id) DO UPDATE SET status = 'pending', message = excluded.message
       WHERE meeting_applications.status = 'rejected'`,
      newId("ap"),
      row.id,
      managerId,
      profile.department,
      input.message,
      Date.now(),
    );
    if (!inserted) fail("이미 신청했어요. 상대 팀의 수락을 기다려 주세요.");

    if (row.kind === "proposal") {
      // A direct proposal is matched as soon as the target department accepts.
      const application = await first<{ id: string }>(
        "SELECT id FROM meeting_applications WHERE meeting_id = ? AND applicant_id = ?",
        row.id,
        managerId,
      );
      await this.accept(channelId, row, application!.id, managerId, profile);
      return { matched: true };
    }
    await this.notifyGroup(
      channelId,
      row.notify_group_id,
      `${row.school} ${row.department} 모집글에 ${profile.school} ${profile.department} 팀이 신청했어요.`,
    );
    return { matched: false };
  }

  private async accept(
    channelId: string,
    row: MeetingRow,
    applicationId: string,
    applicantId: string,
    applicant: { school: string; department: string },
  ) {
    const now = Date.now();
    const changed = await run(
      `UPDATE meetings SET status = 'matched', guest_school = ?, guest_department = ?, guest_code = ?, updated_at = ?
       WHERE id = ? AND status = 'recruiting'`,
      applicant.school,
      applicant.department,
      inviteCode(),
      now,
      row.id,
    );
    if (!changed)
      fail("이미 매칭된 미팅이에요.", FunctionCallErrorCode.Conflict);
    await run(
      "UPDATE meeting_applications SET status = CASE WHEN id = ? THEN 'accepted' ELSE 'rejected' END WHERE meeting_id = ? AND status = 'pending'",
      applicationId,
      row.id,
    );
    await run(
      "INSERT OR IGNORE INTO meeting_members (meeting_id, manager_id, side, joined_at) VALUES (?, ?, 'guest', ?)",
      row.id,
      applicantId,
      now,
    );
    await this.systemMessage(
      row.id,
      "채팅방 개설이 완료되었습니다. 서로 인사하세요!",
      "system",
      now,
    );
    await this.systemMessage(
      row.id,
      "날짜 투표 → 지역 투표 → 장소 선택 순서로 약속을 정해 보세요. 메기남/녀를 추가할지도 투표할 수 있어요.",
      "system",
      now + 1,
    );
    await this.notifyGroup(
      channelId,
      row.notify_group_id,
      `매칭 성사! ${row.school} ${row.department} × ${applicant.school} ${applicant.department} ${row.size}:${row.size}\n단체 채팅방에서 날짜와 지역을 정해 주세요.`,
    );
  }

  @Func(MEETING_FUNCTIONS.decide)
  @Description("Host accepts or rejects an application")
  @InputSchema(DecideInputSchema)
  @OutputSchema(JsonObjectSchema)
  async decide(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof DecideInputSchema>,
  ): Promise<Json> {
    const { channelId, managerId } = this.me(ctx);
    const application = await first<{
      id: string;
      meeting_id: string;
      applicant_id: string;
      department: string;
      status: string;
    }>(
      "SELECT id, meeting_id, applicant_id, department, status FROM meeting_applications WHERE id = ?",
      input.applicationId,
    );
    if (!application)
      fail("신청을 찾을 수 없어요.", FunctionCallErrorCode.NotFound);
    const { row } = await this.card(
      channelId,
      managerId,
      application.meeting_id,
    );
    if (row.host_id !== managerId) fail("호스트만 신청을 처리할 수 있어요.");
    if (application.status !== "pending") fail("이미 처리된 신청이에요.");
    if (input.accept) {
      const profile = await this.profileOf(channelId, application.applicant_id);
      await this.accept(
        channelId,
        row,
        application.id,
        application.applicant_id,
        {
          school: profile?.school ?? "",
          department: application.department,
        },
      );
    } else {
      await run(
        "UPDATE meeting_applications SET status = 'rejected' WHERE id = ?",
        application.id,
      );
    }
    return { meetingId: row.id };
  }

  @Func(MEETING_FUNCTIONS.joinTeam)
  @Description("Join a team (or as its catfish) with an invite code")
  @InputSchema(JoinTeamInputSchema)
  @OutputSchema(JsonObjectSchema)
  async joinTeam(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof JoinTeamInputSchema>,
  ): Promise<Json> {
    const { channelId, managerId } = this.me(ctx);
    const profile = await this.requireProfile(channelId, managerId);
    const meeting = await first<MeetingRow>(
      `SELECT * FROM meetings WHERE channel_id = ?1
       AND (host_code = ?2 OR guest_code = ?2 OR host_catfish_code = ?2 OR guest_catfish_code = ?2)`,
      channelId,
      input.code,
    );
    if (!meeting)
      fail("초대 코드를 찾을 수 없어요.", FunctionCallErrorCode.NotFound);
    const catfish =
      meeting.host_catfish_code === input.code ||
      meeting.guest_catfish_code === input.code;
    const side: Side =
      meeting.host_code === input.code ||
      meeting.host_catfish_code === input.code
        ? "host"
        : "guest";
    const sideGender =
      side === "host" ? meeting.gender : opposite(meeting.gender);
    if (profile.gender !== sideGender)
      fail(`${sideGender === "male" ? "남자" : "여자"} 팀 초대 코드예요.`);

    if (catfish) {
      if (
        meeting.catfish !== 1 ||
        !["matched", "live"].includes(meeting.status)
      )
        fail("메기를 받을 수 없는 미팅이에요.");
      const taken = await first<{ n: number }>(
        "SELECT COUNT(*) AS n FROM meeting_members WHERE meeting_id = ? AND side = ? AND role = 'catfish'",
        meeting.id,
        side,
      );
      if (Number(taken?.n ?? 0) >= 1) fail("이 팀의 메기 자리가 이미 찼어요.");
    } else {
      if (!["recruiting", "matched"].includes(meeting.status))
        fail("이미 시작했거나 종료된 미팅이에요.");
      const teamDepartment =
        side === "host" ? meeting.department : meeting.guest_department;
      if (teamDepartment && teamDepartment !== profile.department)
        fail(`${teamDepartment} 팀 초대 코드예요.`);
      const count = await first<{ n: number }>(
        "SELECT COUNT(*) AS n FROM meeting_members WHERE meeting_id = ? AND side = ? AND role = 'member'",
        meeting.id,
        side,
      );
      if (Number(count?.n ?? 0) >= meeting.size)
        fail("팀 인원이 이미 가득 찼어요.");
    }
    const inserted = await run(
      "INSERT OR IGNORE INTO meeting_members (meeting_id, manager_id, side, role, joined_at) VALUES (?, ?, ?, ?, ?)",
      meeting.id,
      managerId,
      side,
      catfish ? "catfish" : "member",
      Date.now(),
    );
    if (!inserted) fail("이미 참여 중인 미팅이에요.");
    // A catfish stays secret until it enters, so only regular members are announced.
    if (!catfish)
      await this.systemMessage(
        meeting.id,
        `${profile.department} ${profile.student_year}학번 팀원이 ${side === "host" ? "A" : "B"}팀에 합류했어요.`,
      );
    return {
      meetingId: meeting.id,
      side,
      role: catfish ? "catfish" : "member",
    };
  }

  @Func(MEETING_FUNCTIONS.cancel)
  @Description("Host cancels a meeting that is still recruiting")
  @InputSchema(MeetingIdInputSchema)
  @OutputSchema(JsonObjectSchema)
  async cancel(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof MeetingIdInputSchema>,
  ): Promise<Json> {
    const { channelId, managerId } = this.me(ctx);
    const changed = await run(
      "UPDATE meetings SET status = 'cancelled', updated_at = ? WHERE id = ? AND channel_id = ? AND host_id = ? AND status = 'recruiting'",
      Date.now(),
      input.meetingId,
      channelId,
      managerId,
    );
    if (!changed) fail("모집 중인 내 미팅만 취소할 수 있어요.");
    return {};
  }

  @Func(MEETING_FUNCTIONS.linkGroup)
  @Description(
    "Link the Desk group chat where /meeting ran to the meeting room",
  )
  @InputSchema(LinkGroupInputSchema)
  @OutputSchema(JsonObjectSchema)
  async linkGroup(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof LinkGroupInputSchema>,
  ): Promise<Json> {
    const { channelId, managerId, row } = await this.requirePresent(
      ctx,
      input.meetingId,
    );
    const groupId = this.groupFromToken(ctx, managerId, input.targetToken);
    if (!groupId)
      fail("채팅방 정보가 만료됐어요. /meeting 을 다시 실행해 주세요.");
    await run(
      "UPDATE meetings SET notify_group_id = ?, updated_at = ? WHERE id = ?",
      groupId,
      Date.now(),
      row.id,
    );
    await this.systemMessage(
      row.id,
      "채널톡 팀챗 그룹이 미팅 알림방으로 연결됐어요.",
    );
    const sent = await this.notifyGroup(
      channelId,
      groupId,
      `이 그룹이 ${this.meetingTitle(row)} 미팅 알림방으로 연결됐어요. 매칭·약속·미팅 이벤트를 여기에 알려 드릴게요.`,
    );
    return { sent };
  }

  // ----- Group chat room -----

  @Func(MEETING_FUNCTIONS.room)
  @Description("Group chat room: members, chat, polls, catfish, after")
  @InputSchema(RoomInputSchema)
  @OutputSchema(JsonObjectSchema)
  async room(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof RoomInputSchema>,
  ): Promise<Json> {
    const { managerId, row, card, members, me } = await this.requireMember(
      ctx,
      input.meetingId,
    );
    if (row.status === "recruiting" || row.status === "cancelled")
      fail("매칭된 미팅만 채팅방을 열 수 있어요.");
    const byManager = new Map(
      members.map((member) => [member.managerId, member]),
    );
    const visible = members.filter((member) => member.present);

    const messages = me.present
      ? await all<{
          id: string;
          sender_id: string | null;
          kind: "chat" | "system" | "mc";
          body: string;
          created_at: number;
        }>(
          `SELECT * FROM (SELECT id, sender_id, kind, body, created_at FROM meeting_messages
             WHERE meeting_id = ? ORDER BY created_at DESC LIMIT 150) ORDER BY created_at`,
          row.id,
        )
      : [];

    const options = await all<{
      id: string;
      poll: PollKind;
      name: string;
      meta: string;
      category: string;
      votes: number;
      mine: number;
    }>(
      `SELECT p.id, p.poll, p.name, p.meta, p.category,
         (SELECT COUNT(*) FROM meeting_place_votes v WHERE v.place_id = p.id) AS votes,
         EXISTS (SELECT 1 FROM meeting_place_votes v WHERE v.place_id = p.id AND v.manager_id = ?) AS mine
       FROM meeting_places p WHERE p.meeting_id = ? ORDER BY votes DESC, p.created_at`,
      managerId,
      row.id,
    );
    const polls = Object.fromEntries(
      POLLS.map((poll) => [poll, [] as PollOptionView[]]),
    ) as Record<PollKind, PollOptionView[]>;
    for (const option of options)
      polls[option.poll]?.push({
        id: option.id,
        label: option.name,
        meta: option.meta || option.category,
        votes: Number(option.votes),
        votedByMe: !!Number(option.mine),
      });

    const after = await this.afterView(
      row.id,
      managerId,
      row.status === "finished",
      byManager,
    );
    const availability = await this.availabilityView(
      row.id,
      managerId,
      byManager,
    );
    const reviewed = !!(await first(
      "SELECT 1 AS ok FROM meeting_reviews WHERE meeting_id = ? AND manager_id = ?",
      row.id,
      managerId,
    ));

    const memberViews: MemberView[] = visible.map((member) => ({
      key: member.key,
      alias: member.alias,
      side: member.side,
      role: member.role,
      isMe: member.managerId === managerId,
      profile: member.profile,
    }));

    const output: RoomOutput = {
      meeting: card,
      mySide: me.side,
      myRole: me.role,
      isHost: row.host_id === managerId,
      members: memberViews,
      messages: messages.map((message) => {
        const sender = message.sender_id
          ? byManager.get(message.sender_id)
          : undefined;
        return {
          id: message.id,
          kind: message.kind,
          senderKey: sender?.key ?? null,
          senderAlias: sender?.alias ?? null,
          body: message.body,
          createdAt: Number(message.created_at),
          mine: message.sender_id === managerId,
        };
      }),
      polls,
      availability,
      regionSuggestions: regionSuggestions(row.school, row.guest_school),
      placeSuggestions: row.region
        ? placeSuggestions(row.region, row.size * 2, row.meet_time)
        : [],
      linkedGroup: !!row.notify_group_id,
      hostCode:
        me.side === "host" && me.role === "member" ? row.host_code : null,
      guestCode:
        me.side === "guest" && me.role === "member" ? row.guest_code : null,
      catfish: await this.catfishView(row, members, me),
      after,
      reviewed,
    };
    return { ...output };
  }

  private async availabilityView(
    meetingId: string,
    managerId: string,
    byManager: Map<string, Member>,
  ): Promise<AvailabilityView> {
    const dates = availabilityDates(Date.now());
    const rows = await all<{ manager_id: string; slot: string }>(
      "SELECT manager_id, slot FROM meeting_availability WHERE meeting_id = ?",
      meetingId,
    );
    const available: Record<string, string[]> = {};
    for (const date of dates)
      for (const hour of AVAILABILITY_HOURS) available[slotOf(date, hour)] = [];
    const responders = new Set<string>();
    for (const row of rows) {
      const member = byManager.get(row.manager_id);
      if (!member?.present || !(row.slot in available)) continue;
      available[row.slot].push(member.alias);
      responders.add(row.manager_id);
    }
    for (const people of Object.values(available)) people.sort();
    return {
      dates,
      hours: AVAILABILITY_HOURS,
      available,
      mine: rows
        .filter((row) => row.manager_id === managerId && row.slot in available)
        .map((row) => row.slot),
      responded: responders.size,
      total: [...byManager.values()].filter((member) => member.present).length,
      best: bestSlots(available),
    };
  }

  @Func(MEETING_FUNCTIONS.setAvailability)
  @Description("TimePick-style: replace the time slots I am available")
  @InputSchema(SetAvailabilityInputSchema)
  @OutputSchema(JsonObjectSchema)
  async setAvailability(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof SetAvailabilityInputSchema>,
  ): Promise<Json> {
    const { managerId, row } = await this.requirePresent(ctx, input.meetingId);
    if (row.status === "finished") fail("종료된 미팅이에요.");
    const valid = new Set(
      availabilityDates(Date.now()).flatMap((date) =>
        AVAILABILITY_HOURS.map((hour) => slotOf(date, hour)),
      ),
    );
    const slots = [...new Set(input.slots)].filter((slot) => valid.has(slot));
    await run(
      "DELETE FROM meeting_availability WHERE meeting_id = ? AND manager_id = ?",
      row.id,
      managerId,
    );
    for (const slot of slots)
      await run(
        "INSERT INTO meeting_availability (meeting_id, manager_id, slot) VALUES (?, ?, ?)",
        row.id,
        managerId,
        slot,
      );
    return { saved: slots.length };
  }

  @Func(MEETING_FUNCTIONS.decideSlot)
  @Description("Fix the meeting date and time from the availability grid")
  @InputSchema(DecideSlotInputSchema)
  @OutputSchema(JsonObjectSchema)
  async decideSlot(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof DecideSlotInputSchema>,
  ): Promise<Json> {
    const { channelId, row } = await this.requirePresent(ctx, input.meetingId);
    if (row.status === "finished") fail("종료된 미팅이에요.");
    const [date, time] = input.slot.split(" ");
    const count = await first<{ n: number }>(
      "SELECT COUNT(*) AS n FROM meeting_availability WHERE meeting_id = ? AND slot = ?",
      row.id,
      input.slot,
    );
    await run(
      "UPDATE meetings SET meet_date = ?, meet_time = ?, updated_at = ? WHERE id = ?",
      date,
      time,
      Date.now(),
      row.id,
    );
    const text = `날짜 확정: ${input.slot} (${Number(count?.n ?? 0)}명 가능). 이제 만날 지역을 투표해 주세요!`;
    await this.systemMessage(row.id, text);
    await this.notifyGroup(
      channelId,
      row.notify_group_id,
      `[${this.meetingTitle(row)}] ${text}`,
    );
    return {};
  }

  private async catfishView(
    row: MeetingRow,
    members: Member[],
    me: Member,
  ): Promise<CatfishView> {
    const votes = await all<{ manager_id: string; agree: number }>(
      "SELECT manager_id, agree FROM meeting_catfish_votes WHERE meeting_id = ?",
      row.id,
    );
    const mine = votes.find((vote) => vote.manager_id === me.managerId);
    const availableAt = row.started_at
      ? row.started_at + toReal(LIVE.catfishAfter, row.mc_speed)
      : null;
    return {
      decision:
        row.catfish === 1 ? "yes" : row.catfish === 0 ? "no" : "pending",
      yes: votes.filter((vote) => vote.agree).length,
      no: votes.filter((vote) => !vote.agree).length,
      voters: members.filter((member) => member.role === "member").length,
      myVote: mine ? !!mine.agree : null,
      code:
        row.catfish === 1 && me.role === "member"
          ? me.side === "host"
            ? row.host_catfish_code
            : row.guest_catfish_code
          : null,
      joined: members.filter((member) => member.role === "catfish").length,
      waiting:
        me.role === "catfish" && !me.present
          ? {
              availableAt,
              canEnter:
                row.status === "live" &&
                availableAt !== null &&
                Date.now() >= availableAt,
            }
          : null,
    };
  }

  private async afterView(
    meetingId: string,
    managerId: string,
    open: boolean,
    byManager: Map<string, Member>,
  ): Promise<AfterView> {
    const submissions = await all<{ manager_id: string }>(
      "SELECT manager_id FROM meeting_after_submissions WHERE meeting_id = ?",
      meetingId,
    );
    const choices = await all<{ chooser_id: string; target_id: string }>(
      "SELECT chooser_id, target_id FROM meeting_after_choices WHERE meeting_id = ?",
      meetingId,
    );
    const chats = await all<{ id: string; member_a: string; member_b: string }>(
      "SELECT id, member_a, member_b FROM meeting_private_chats WHERE meeting_id = ? AND (member_a = ?2 OR member_b = ?2)",
      meetingId,
      managerId,
    );
    const matches = chats.flatMap((chat) => {
      const partnerId =
        chat.member_a === managerId ? chat.member_b : chat.member_a;
      const partner = byManager.get(partnerId);
      return partner
        ? [
            {
              key: partner.key,
              alias: partner.alias,
              chatId: chat.id,
              profile: partner.profile,
            },
          ]
        : [];
    });
    return {
      open,
      submitted: submissions.some((row) => row.manager_id === managerId),
      submittedCount: submissions.length,
      // Only the caller's own choices are ever returned.
      myChoices: choices
        .filter((choice) => choice.chooser_id === managerId)
        .map((choice) => byManager.get(choice.target_id)?.key ?? "")
        .filter(Boolean),
      matches,
    };
  }

  @Func(MEETING_FUNCTIONS.sendMessage)
  @Description("Send a message to the group chat")
  @InputSchema(SendMessageInputSchema)
  @OutputSchema(JsonObjectSchema)
  async sendMessage(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof SendMessageInputSchema>,
  ): Promise<Json> {
    const { managerId, row } = await this.requirePresent(ctx, input.meetingId);
    await run(
      "INSERT INTO meeting_messages (id, meeting_id, sender_id, kind, body, created_at) VALUES (?, ?, ?, 'chat', ?, ?)",
      newId("msg"),
      row.id,
      managerId,
      input.body,
      Date.now(),
    );
    return {};
  }

  @Func(MEETING_FUNCTIONS.updatePlan)
  @Description("Directly set the date, time and place")
  @InputSchema(UpdatePlanInputSchema)
  @OutputSchema(JsonObjectSchema)
  async updatePlan(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof UpdatePlanInputSchema>,
  ): Promise<Json> {
    const { channelId, managerId, row, me } = await this.requirePresent(
      ctx,
      input.meetingId,
    );
    if (row.status === "finished") fail("종료된 미팅이에요.");
    await run(
      "UPDATE meetings SET meet_date = ?, meet_time = ?, place = ?, updated_at = ? WHERE id = ?",
      input.meetDate,
      input.meetTime,
      input.place,
      Date.now(),
      row.id,
    );
    await run(
      "UPDATE meeting_members SET schedule_confirmed = CASE WHEN manager_id = ? THEN 1 ELSE 0 END WHERE meeting_id = ?",
      managerId,
      row.id,
    );
    const text = `${me.alias}님이 일정을 정했어요: ${input.meetDate} ${input.meetTime}${input.place ? ` · ${input.place}` : ""}`;
    await this.systemMessage(row.id, text);
    await this.notifyGroup(
      channelId,
      row.notify_group_id,
      `[${this.meetingTitle(row)}] ${text}`,
    );
    return {};
  }

  @Func(MEETING_FUNCTIONS.confirmSchedule)
  @Description("Confirm that I checked the schedule")
  @InputSchema(MeetingIdInputSchema)
  @OutputSchema(JsonObjectSchema)
  async confirmSchedule(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof MeetingIdInputSchema>,
  ): Promise<Json> {
    const { managerId, row } = await this.requirePresent(ctx, input.meetingId);
    await run(
      "UPDATE meeting_members SET schedule_confirmed = 1 WHERE meeting_id = ? AND manager_id = ?",
      row.id,
      managerId,
    );
    return {};
  }

  @Func(MEETING_FUNCTIONS.remindSchedule)
  @Description(
    "Remind members who have not confirmed the schedule via the Desk group",
  )
  @InputSchema(MeetingIdInputSchema)
  @OutputSchema(JsonObjectSchema)
  async remindSchedule(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof MeetingIdInputSchema>,
  ): Promise<Json> {
    const { channelId, row, members } = await this.requirePresent(
      ctx,
      input.meetingId,
    );
    const pending = members.filter(
      (member) => member.present && !member.scheduleConfirmed,
    );
    if (!pending.length) return { pending: 0, sent: false };
    const text = `아직 미팅 일정을 확인하지 않은 사람이 있어요 (${pending
      .map((member) => member.alias)
      .join(", ")}).`;
    await this.systemMessage(row.id, text);
    const sent = await this.notifyGroup(
      channelId,
      row.notify_group_id,
      `[${this.meetingTitle(row)}] ${text}`,
    );
    return { pending: pending.length, sent };
  }

  @Func(MEETING_FUNCTIONS.proposePlace)
  @Description("Add a date, region or place option to the group chat poll")
  @InputSchema(ProposePlaceInputSchema)
  @OutputSchema(JsonObjectSchema)
  async proposePlace(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof ProposePlaceInputSchema>,
  ): Promise<Json> {
    const { managerId, row, me } = await this.requirePresent(
      ctx,
      input.meetingId,
    );
    if (row.status === "finished") fail("종료된 미팅이에요.");
    if (
      input.poll === "date" &&
      !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(input.name)
    )
      fail("날짜와 시간을 모두 골라 주세요.");
    const existing = await first<{ id: string } & { n: number }>(
      "SELECT (SELECT id FROM meeting_places WHERE meeting_id = ?1 AND poll = ?2 AND name = ?3) AS id, (SELECT COUNT(*) FROM meeting_places WHERE meeting_id = ?1 AND poll = ?2) AS n",
      row.id,
      input.poll,
      input.name,
    );
    if (existing?.id) return { placeId: existing.id };
    if (Number(existing?.n ?? 0) >= 12) fail("후보는 12개까지 올릴 수 있어요.");
    const placeId = newId("pl");
    await run(
      "INSERT INTO meeting_places (id, meeting_id, name, category, proposed_by, created_at, poll, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      placeId,
      row.id,
      input.name,
      input.category || input.poll,
      managerId,
      Date.now(),
      input.poll,
      input.category,
    );
    await run(
      "INSERT OR IGNORE INTO meeting_place_votes (place_id, manager_id) VALUES (?, ?)",
      placeId,
      managerId,
    );
    const label = { date: "날짜", region: "지역", place: "장소" }[input.poll];
    await this.systemMessage(
      row.id,
      `${me.alias}님이 ${label} 후보를 올렸어요: ${input.name}`,
    );
    return { placeId };
  }

  @Func(MEETING_FUNCTIONS.votePlace)
  @Description("Toggle my vote for a poll option")
  @InputSchema(VotePlaceInputSchema)
  @OutputSchema(JsonObjectSchema)
  async votePlace(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof VotePlaceInputSchema>,
  ): Promise<Json> {
    const { managerId, row } = await this.requirePresent(ctx, input.meetingId);
    const option = await first(
      "SELECT 1 AS ok FROM meeting_places WHERE id = ? AND meeting_id = ?",
      input.placeId,
      row.id,
    );
    if (!option) fail("후보를 찾을 수 없어요.", FunctionCallErrorCode.NotFound);
    const removed = await run(
      "DELETE FROM meeting_place_votes WHERE place_id = ? AND manager_id = ?",
      input.placeId,
      managerId,
    );
    if (!removed)
      await run(
        "INSERT INTO meeting_place_votes (place_id, manager_id) VALUES (?, ?)",
        input.placeId,
        managerId,
      );
    return { voted: !removed };
  }

  @Func(MEETING_FUNCTIONS.decidePoll)
  @Description("Fix the date, region or place from a poll option")
  @InputSchema(DecidePollInputSchema)
  @OutputSchema(JsonObjectSchema)
  async decidePoll(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof DecidePollInputSchema>,
  ): Promise<Json> {
    const { channelId, row } = await this.requirePresent(ctx, input.meetingId);
    if (row.status === "finished") fail("종료된 미팅이에요.");
    const option = await first<{ poll: PollKind; name: string }>(
      "SELECT poll, name FROM meeting_places WHERE id = ? AND meeting_id = ?",
      input.placeId,
      row.id,
    );
    if (!option) fail("후보를 찾을 수 없어요.", FunctionCallErrorCode.NotFound);
    const now = Date.now();
    let text: string;
    if (option.poll === "date") {
      const [date, time] = option.name.split(" ");
      await run(
        "UPDATE meetings SET meet_date = ?, meet_time = ?, updated_at = ? WHERE id = ?",
        date,
        time,
        now,
        row.id,
      );
      text = `날짜 확정: ${option.name}. 이제 만날 지역을 투표해 주세요!`;
    } else if (option.poll === "region") {
      // Picking a new area invalidates any place chosen for the previous one.
      await run(
        "UPDATE meetings SET region = ?, place = '', updated_at = ? WHERE id = ?",
        option.name,
        now,
        row.id,
      );
      text = `지역 확정: ${option.name}. 추천 장소에서 골라 예약해 주세요!`;
    } else {
      await run(
        "UPDATE meetings SET place = ?, updated_at = ? WHERE id = ?",
        option.name,
        now,
        row.id,
      );
      text = `장소 확정: ${option.name}. 예약 페이지에서 예약을 마쳐 주세요.`;
    }
    await this.systemMessage(row.id, text);
    await this.notifyGroup(
      channelId,
      row.notify_group_id,
      `[${this.meetingTitle(row)}] ${text}`,
    );
    return { poll: option.poll };
  }

  // ----- Catfish (메기) -----

  @Func(MEETING_FUNCTIONS.catfishVote)
  @Description("Vote whether the room adds one catfish per team")
  @InputSchema(CatfishVoteInputSchema)
  @OutputSchema(JsonObjectSchema)
  async catfishVote(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof CatfishVoteInputSchema>,
  ): Promise<Json> {
    const { managerId, row, members, me } = await this.requireMember(
      ctx,
      input.meetingId,
    );
    if (me.role !== "member") fail("기존 참가자만 투표할 수 있어요.");
    if (row.catfish !== null) fail("메기 투표가 이미 끝났어요.");
    if (row.status !== "matched") fail("미팅 시작 전에만 투표할 수 있어요.");
    await run(
      `INSERT INTO meeting_catfish_votes (meeting_id, manager_id, agree) VALUES (?, ?, ?)
       ON CONFLICT (meeting_id, manager_id) DO UPDATE SET agree = excluded.agree`,
      row.id,
      managerId,
      input.agree ? 1 : 0,
    );
    const votes = await all<{ agree: number }>(
      "SELECT agree FROM meeting_catfish_votes WHERE meeting_id = ?",
      row.id,
    );
    const voters = members.filter((member) => member.role === "member").length;
    const yes = votes.filter((vote) => vote.agree).length;
    const no = votes.length - yes;
    // Decided by a strict majority of all regular members; a tie means no.
    const decision = yes * 2 > voters ? 1 : no * 2 >= voters ? 0 : null;
    if (decision !== null) {
      const changed = await run(
        `UPDATE meetings SET catfish = ?, host_catfish_code = ?, guest_catfish_code = ?, updated_at = ?
         WHERE id = ? AND catfish IS NULL`,
        decision,
        decision ? inviteCode() : null,
        decision ? inviteCode() : null,
        Date.now(),
        row.id,
      );
      if (changed)
        await this.systemMessage(
          row.id,
          decision
            ? "메기남/녀를 추가하기로 했어요! 각 팀에서 한 명씩 메기 초대 코드를 친구에게 공유해 주세요. 메기는 미팅 시작 1시간 후 입장할 수 있어요."
            : "이번 미팅은 메기 없이 진행해요.",
        );
    }
    return { decided: decision };
  }

  @Func(MEETING_FUNCTIONS.enterCatfish)
  @Description("A catfish enters the live meeting one hour after it started")
  @InputSchema(MeetingIdInputSchema)
  @OutputSchema(JsonObjectSchema)
  async enterCatfish(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof MeetingIdInputSchema>,
  ): Promise<Json> {
    const { channelId, managerId, row, me } = await this.requireMember(
      ctx,
      input.meetingId,
    );
    if (me.role !== "catfish") fail("메기로 초대된 사람만 입장할 수 있어요.");
    if (me.present) return {};
    if (row.status !== "live" || !row.started_at)
      fail("미팅이 시작된 뒤에 입장할 수 있어요.");
    if (Date.now() < row.started_at + toReal(LIVE.catfishAfter, row.mc_speed))
      fail("메기는 미팅 시작 1시간 후부터 입장할 수 있어요.");
    const now = Date.now();
    await run(
      "UPDATE meeting_members SET entered_at = ? WHERE meeting_id = ? AND manager_id = ? AND entered_at IS NULL",
      now,
      row.id,
      managerId,
    );
    const team = me.side === "host" ? row.department : row.guest_department;
    const body = `${team} 팀에 새로운 참가자가 들어왔어요! (${me.profile.department} · ${me.profile.age}세 · ${me.profile.studentYear}학번) 반갑게 맞아 주세요.`;
    await this.systemMessage(row.id, `${body}`);
    await this.emitEvent(channelId, row, "catfish", now, {
      title: "새로운 참가자 등장!",
      body,
    });
    return {};
  }

  // ----- Live meeting (server-owned state) -----

  /**
   * Inserts the next live event after atomically claiming the next sequence
   * number, so concurrent pollers can never create two different events.
   */
  private async emitEvent(
    channelId: string,
    row: MeetingRow,
    kind: "random" | "vote" | "catfish",
    now: number,
    content?: { title: string; body: string },
    schedule?: { nextEventAt: number; nextVoteAt: number },
  ): Promise<boolean> {
    const speed = row.mc_speed;
    const claimed = await run(
      `UPDATE meetings SET event_seq = event_seq + 1, next_event_at = ?, next_vote_at = ?
       WHERE id = ? AND event_seq = ?`,
      schedule?.nextEventAt ?? row.next_event_at,
      schedule?.nextVoteAt ?? row.next_vote_at,
      row.id,
      row.event_seq,
    );
    if (!claimed) return false;
    const picked =
      kind === "random"
        ? pickEvent()
        : kind === "vote"
          ? {
              kind: "vote" as const,
              title: "호감 투표",
              body: "지금 가장 호감 가는 사람을 골라 주세요. 누가 누구를 골랐는지는 절대 공개되지 않아요.",
            }
          : { kind: "catfish" as const, ...content! };
    const minutes = kind === "vote" ? LIVE.voteMinutes : LIVE.eventMinutes;
    await run(
      "INSERT INTO meeting_events (id, meeting_id, seq, kind, title, body, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      newId("ev"),
      row.id,
      row.event_seq + 1,
      picked.kind,
      picked.title,
      picked.body,
      now,
      now + toReal(minutes, speed),
    );
    await this.notifyGroup(
      channelId,
      row.notify_group_id,
      `[MC] ${EVENT_EMOJI[picked.kind]} ${picked.title}\n${picked.body}`,
    );
    return true;
  }

  private currentEvent(meetingId: string): Promise<EventRow | null> {
    return first<EventRow>(
      "SELECT id, seq, kind, title, body, starts_at, ends_at FROM meeting_events WHERE meeting_id = ? ORDER BY seq DESC LIMIT 1",
      meetingId,
    );
  }

  @Func(MEETING_FUNCTIONS.startMc)
  @Description(
    "Start the meeting; every participant switches to the event screen",
  )
  @InputSchema(StartMcInputSchema)
  @OutputSchema(JsonObjectSchema)
  async startMc(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof StartMcInputSchema>,
  ): Promise<Json> {
    const { channelId, row } = await this.requirePresent(ctx, input.meetingId);
    const now = Date.now();
    const speed = input.demo ? LIVE.demoSpeed : 1;
    const changed = await run(
      `UPDATE meetings SET status = 'live', started_at = ?, mc_speed = ?, event_seq = 1,
         next_event_at = ?, next_vote_at = ?, updated_at = ?
       WHERE id = ? AND status = 'matched'`,
      now,
      speed,
      now + toReal(LIVE.startMinutes + between([4, 9]), speed),
      now + toReal(between(LIVE.voteGap), speed),
      now,
      row.id,
    );
    if (!changed) fail("매칭된 미팅만 시작할 수 있어요.");
    await run(
      "INSERT INTO meeting_events (id, meeting_id, seq, kind, title, body, starts_at, ends_at) VALUES (?, ?, 1, 'start', ?, ?, ?, ?)",
      newId("ev"),
      row.id,
      "미팅 시작!",
      "가볍게 자기소개부터 해 볼까요? 학과·학번·요즘 빠져 있는 것 하나씩!",
      now,
      now + toReal(LIVE.startMinutes, speed),
    );
    await this.systemMessage(
      row.id,
      "미팅이 시작됐어요! 즐거운 시간 보내세요.",
    );
    await this.notifyGroup(
      channelId,
      row.notify_group_id,
      `[MC] 🎬 ${this.meetingTitle(row)} 미팅 시작! 중간중간 랜덤 이벤트가 찾아가요.`,
    );
    return {};
  }

  @Func(MEETING_FUNCTIONS.live)
  @Description(
    "Server-owned live state: the one current event every participant sees",
  )
  @InputSchema(MeetingIdInputSchema)
  @OutputSchema(JsonObjectSchema)
  async live(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof MeetingIdInputSchema>,
  ): Promise<Json> {
    const context = await this.requirePresent(ctx, input.meetingId);
    const { channelId, managerId, members, me } = context;
    let row: MeetingRow = context.row;
    let now = Date.now();
    let event = await this.currentEvent(row.id);

    // Meetings started before live events existed have no schedule yet.
    if (row.status === "live" && (!row.next_event_at || !row.next_vote_at)) {
      await run(
        "UPDATE meetings SET next_event_at = ?, next_vote_at = ? WHERE id = ? AND next_event_at IS NULL",
        now,
        now + toReal(between(LIVE.voteGap), row.mc_speed),
        row.id,
      );
      row = (await this.card(channelId, managerId, row.id)).row;
    }

    // Whichever participant polls first after a boundary advances the shared
    // state; the others read the same row.
    if (row.status === "live" && row.next_event_at && row.next_vote_at) {
      const decision = decideTick({
        now,
        speed: row.mc_speed,
        nextEventAt: row.next_event_at,
        nextVoteAt: row.next_vote_at,
        current: event
          ? {
              kind: event.kind,
              startsAt: event.starts_at,
              endsAt: event.ends_at,
            }
          : null,
      });
      if (decision) {
        await this.emitEvent(
          channelId,
          row,
          decision.kind,
          now,
          undefined,
          decision,
        );
        row = (await this.card(channelId, managerId, row.id)).row;
        event = await this.currentEvent(row.id);
        now = Date.now();
      }
    }

    const present = members.filter((member) => member.present);
    const byManager = new Map(
      present.map((member) => [member.managerId, member]),
    );
    let vote: LiveOutput["vote"] = null;
    if (event?.kind === "vote") {
      const votes = await all<{ voter_id: string; target_id: string }>(
        "SELECT voter_id, target_id FROM meeting_event_votes WHERE event_id = ?",
        event.id,
      );
      const open = now < event.ends_at;
      const mine = votes.find((v) => v.voter_id === managerId);
      vote = {
        open,
        myVote: mine ? (byManager.get(mine.target_id)?.key ?? null) : null,
        votedCount: votes.length,
        voterCount: present.length,
        receivedByMe: open
          ? null
          : votes.filter((v) => v.target_id === managerId).length,
      };
    }

    const output: LiveOutput = {
      meetingId: row.id,
      status: row.status,
      title: this.meetingTitle(row),
      isDemo: row.mc_speed > 1,
      serverNow: now,
      startedAt: row.started_at,
      elapsedMinutes: row.started_at
        ? ((now - row.started_at) * row.mc_speed) / 60_000
        : 0,
      people: present.length,
      event: event
        ? {
            id: event.id,
            seq: event.seq,
            kind: event.kind,
            title: event.title,
            body: event.body,
            startsAt: event.starts_at,
            endsAt: event.ends_at,
            active: now < event.ends_at,
          }
        : null,
      vote,
      candidates: present
        .filter((member) => member.side !== me.side)
        .map((member) => ({
          key: member.key,
          alias: member.alias,
          profile: member.profile,
        })),
    };
    return { ...output };
  }

  @Func(MEETING_FUNCTIONS.eventVote)
  @Description("Anonymous like vote during the meeting")
  @InputSchema(EventVoteInputSchema)
  @OutputSchema(JsonObjectSchema)
  async eventVote(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof EventVoteInputSchema>,
  ): Promise<Json> {
    const { managerId, row, members, me } = await this.requirePresent(
      ctx,
      input.meetingId,
    );
    const event = await first<EventRow>(
      "SELECT id, seq, kind, title, body, starts_at, ends_at FROM meeting_events WHERE id = ? AND meeting_id = ?",
      input.eventId,
      row.id,
    );
    const now = Date.now();
    if (!event || event.kind !== "vote" || now >= event.ends_at)
      fail("지금은 호감 투표 시간이 아니에요.");
    const target = members.find((member) => member.key === input.targetKey);
    if (!target || !target.present || target.side === me.side)
      fail("상대 팀 참가자만 선택할 수 있어요.");
    await run(
      `INSERT INTO meeting_event_votes (event_id, voter_id, target_id) VALUES (?, ?, ?)
       ON CONFLICT (event_id, voter_id) DO UPDATE SET target_id = excluded.target_id`,
      event.id,
      managerId,
      target.managerId,
    );
    const counted = await first<{ n: number }>(
      "SELECT COUNT(*) AS n FROM meeting_event_votes WHERE event_id = ?",
      event.id,
    );
    // Close early once everyone present has voted so results appear together.
    if (Number(counted?.n ?? 0) >= members.filter((m) => m.present).length)
      await run(
        "UPDATE meeting_events SET ends_at = ? WHERE id = ? AND ends_at > ?",
        now,
        event.id,
        now,
      );
    return {};
  }

  @Func(MEETING_FUNCTIONS.nextMc)
  @Description("Demo mode only: trigger the next random event or like vote now")
  @InputSchema(NextMcInputSchema)
  @OutputSchema(JsonObjectSchema)
  async nextMc(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof NextMcInputSchema>,
  ): Promise<Json> {
    const { channelId, row } = await this.requirePresent(ctx, input.meetingId);
    if (row.status !== "live") fail("진행 중인 미팅이 아니에요.");
    if (row.mc_speed <= 1)
      fail("데모 모드에서만 이벤트를 바로 부를 수 있어요.");
    const now = Date.now();
    await run(
      "UPDATE meeting_events SET ends_at = ? WHERE meeting_id = ? AND ends_at > ?",
      now,
      row.id,
      now,
    );
    const emitted = await this.emitEvent(
      channelId,
      row,
      input.kind,
      now,
      undefined,
      {
        nextEventAt: now + toReal(between(LIVE.eventGap), row.mc_speed),
        nextVoteAt:
          input.kind === "vote"
            ? now + toReal(between(LIVE.voteGap), row.mc_speed)
            : (row.next_vote_at ?? now),
      },
    );
    return { emitted };
  }

  @Func(MEETING_FUNCTIONS.finish)
  @Description("End the meeting; after selection and reviews open")
  @InputSchema(MeetingIdInputSchema)
  @OutputSchema(JsonObjectSchema)
  async finish(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof MeetingIdInputSchema>,
  ): Promise<Json> {
    const { channelId, row } = await this.requirePresent(ctx, input.meetingId);
    const changed = await run(
      "UPDATE meetings SET status = 'finished', finished_at = ?, updated_at = ? WHERE id = ? AND status IN ('matched', 'live')",
      Date.now(),
      Date.now(),
      row.id,
    );
    if (!changed) fail("이미 종료된 미팅이에요.");
    const text =
      "미팅이 끝났어요! 애프터 선택과 후기를 남겨 주세요. 서로 선택한 경우에만 결과가 공개돼요.";
    await this.systemMessage(row.id, text);
    await this.notifyGroup(
      channelId,
      row.notify_group_id,
      `[${this.meetingTitle(row)}] ${text}`,
    );
    return {};
  }

  private opponent(members: Member[], me: Member, key: string): Member {
    const target = members.find((member) => member.key === key);
    if (!target || !target.present || target.side === me.side)
      fail("상대 팀 참가자만 선택할 수 있어요.");
    return target;
  }

  @Func(MEETING_FUNCTIONS.submitAfter)
  @Description(
    "Anonymously choose after partners; only mutual choices open a private chat",
  )
  @InputSchema(SubmitAfterInputSchema)
  @OutputSchema(JsonObjectSchema)
  async submitAfter(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof SubmitAfterInputSchema>,
  ): Promise<Json> {
    const { channelId, managerId, row, members, me } =
      await this.requirePresent(ctx, input.meetingId);
    if (row.status !== "finished")
      fail("애프터 선택은 미팅이 끝난 뒤에 열려요.");
    const targets = [...new Set(input.targetKeys)].map((key) =>
      this.opponent(members, me, key),
    );
    const now = Date.now();
    await run(
      "DELETE FROM meeting_after_choices WHERE meeting_id = ? AND chooser_id = ?",
      row.id,
      managerId,
    );
    for (const target of targets)
      await run(
        "INSERT INTO meeting_after_choices (meeting_id, chooser_id, target_id) VALUES (?, ?, ?)",
        row.id,
        managerId,
        target.managerId,
      );
    await run(
      "INSERT OR REPLACE INTO meeting_after_submissions (meeting_id, manager_id, created_at) VALUES (?, ?, ?)",
      row.id,
      managerId,
      now,
    );

    const choices = await all<{ chooser_id: string; target_id: string }>(
      "SELECT chooser_id, target_id FROM meeting_after_choices WHERE meeting_id = ?",
      row.id,
    );
    let newMatches = 0;
    for (const [a, b] of mutualPairs(
      choices.map((choice) => ({
        chooser: choice.chooser_id,
        target: choice.target_id,
      })),
    )) {
      if (a !== managerId && b !== managerId) continue;
      newMatches += await run(
        "INSERT OR IGNORE INTO meeting_private_chats (id, meeting_id, member_a, member_b, created_at) VALUES (?, ?, ?, ?, ?)",
        newId("dm"),
        row.id,
        a,
        b,
        now,
      );
    }
    if (newMatches)
      await this.notifyGroup(
        channelId,
        row.notify_group_id,
        `[${this.meetingTitle(row)}] 애프터가 성사된 커플이 생겼어요! 당사자에게만 개인 채팅방이 열렸어요.`,
      );
    const byManager = new Map(
      members.map((member) => [member.managerId, member]),
    );
    return { ...(await this.afterView(row.id, managerId, true, byManager)) };
  }

  // ----- Review / history / rank -----

  @Func(MEETING_FUNCTIONS.submitReview)
  @Description("Save the meeting and after review")
  @InputSchema(SubmitReviewInputSchema)
  @OutputSchema(JsonObjectSchema)
  async submitReview(
    @Ctx() ctx: Context,
    @Input() input: SubmitReviewInput,
  ): Promise<Json> {
    const { managerId, row } = await this.requirePresent(ctx, input.meetingId);
    if (row.status !== "finished")
      fail("미팅이 끝난 뒤 후기를 남길 수 있어요.");
    await run(
      `INSERT OR REPLACE INTO meeting_reviews
         (meeting_id, manager_id, mood, conversation, place, content, want_again, after_review, comment, created_at, partner)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      managerId,
      input.mood,
      input.conversation,
      input.place,
      input.content,
      input.wantAgain ? 1 : 0,
      input.afterReview,
      input.comment,
      Date.now(),
      input.partner,
    );
    return {};
  }

  @Func(MEETING_FUNCTIONS.history)
  @Description("My meeting records and after private chats")
  @InputSchema(z.object({}))
  @OutputSchema(JsonObjectSchema)
  async history(@Ctx() ctx: Context): Promise<Json> {
    const { channelId, managerId } = this.me(ctx);
    const mine = await all<MeetingRow & { side: Side; reviewed: number }>(
      `SELECT m.*, mm.side,
         EXISTS (SELECT 1 FROM meeting_reviews r WHERE r.meeting_id = m.id AND r.manager_id = ?1) AS reviewed
       FROM meetings m JOIN meeting_members mm ON mm.meeting_id = m.id AND mm.manager_id = ?1
       WHERE m.channel_id = ?2 AND m.status != 'cancelled'
       ORDER BY m.created_at DESC LIMIT 50`,
      managerId,
      channelId,
    );
    const choices = await all<{
      meeting_id: string;
      chooser_id: string;
      target_id: string;
    }>(
      `SELECT c.meeting_id, c.chooser_id, c.target_id FROM meeting_after_choices c
       JOIN meeting_members mm ON mm.meeting_id = c.meeting_id AND mm.manager_id = ?`,
      managerId,
    );
    const pairsByMeeting = new Map<string, [string, string][]>();
    const grouped = new Map<string, { chooser: string; target: string }[]>();
    for (const choice of choices) {
      const list = grouped.get(choice.meeting_id) ?? [];
      list.push({ chooser: choice.chooser_id, target: choice.target_id });
      grouped.set(choice.meeting_id, list);
    }
    for (const [meetingId, list] of grouped)
      pairsByMeeting.set(meetingId, mutualPairs(list));

    const records = mine.map((row) => {
      const pairs = pairsByMeeting.get(row.id) ?? [];
      return {
        meetingId: row.id,
        meetDate: row.meet_date,
        myDepartment:
          row.side === "host" ? row.department : (row.guest_department ?? ""),
        otherDepartment:
          row.side === "host" ? row.guest_department : row.department,
        size: row.size,
        region: row.region,
        place: row.place,
        status: row.status,
        afterPairs: pairs.length,
        myAfterMatches: pairs.filter(
          ([a, b]) => a === managerId || b === managerId,
        ).length,
        reviewed: !!Number(row.reviewed),
      };
    });

    const chats = await all<{
      id: string;
      meeting_id: string;
      member_a: string;
      member_b: string;
      last: string | null;
    }>(
      `SELECT c.id, c.meeting_id, c.member_a, c.member_b,
         (SELECT body FROM meeting_private_messages pm WHERE pm.chat_id = c.id ORDER BY created_at DESC LIMIT 1) AS last
       FROM meeting_private_chats c JOIN meetings m ON m.id = c.meeting_id
       WHERE m.channel_id = ?1 AND (c.member_a = ?2 OR c.member_b = ?2)
       ORDER BY c.created_at DESC`,
      channelId,
      managerId,
    );
    const privateChats: HistoryOutput["privateChats"] = [];
    for (const chat of chats) {
      const partnerId =
        chat.member_a === managerId ? chat.member_b : chat.member_a;
      const partner = (await this.members(chat.meeting_id)).find(
        (member) => member.managerId === partnerId,
      );
      if (!partner) continue;
      privateChats.push({
        chatId: chat.id,
        meetingId: chat.meeting_id,
        partnerAlias: partner.alias,
        partner: partner.profile,
        lastMessage: chat.last,
      });
    }
    const output: HistoryOutput = { records, privateChats };
    return { ...output };
  }

  @Func(MEETING_FUNCTIONS.rank)
  @Description("Department preference from real reviews of the other team")
  @InputSchema(z.object({}))
  @OutputSchema(JsonObjectSchema)
  async rank(@Ctx() ctx: Context): Promise<Json> {
    const { channelId } = this.me(ctx);
    // Each review rates the reviewer's *opponent* team, so the score belongs to
    // the department on the other side of the meeting.
    const rows = await all<{
      department: string | null;
      school: string | null;
      partner: number;
    }>(
      `SELECT
         CASE WHEN mm.side = 'host' THEN m.guest_department ELSE m.department END AS department,
         CASE WHEN mm.side = 'host' THEN m.guest_school ELSE m.school END AS school,
         r.partner AS partner
       FROM meeting_reviews r
       JOIN meetings m ON m.id = r.meeting_id
       JOIN meeting_members mm ON mm.meeting_id = r.meeting_id AND mm.manager_id = r.manager_id
       WHERE m.channel_id = ? AND r.partner IS NOT NULL`,
      channelId,
    );
    const stats = new Map<
      string,
      { sum: number; count: number; schools: Set<string> }
    >();
    for (const row of rows) {
      if (!row.department) continue;
      const stat = stats.get(row.department) ?? {
        sum: 0,
        count: 0,
        schools: new Set<string>(),
      };
      stat.sum += Number(row.partner);
      stat.count += 1;
      if (row.school) stat.schools.add(row.school);
      stats.set(row.department, stat);
    }
    const output: RankOutput = {
      entries: [...stats.entries()]
        .map(([department, stat]) => ({
          department,
          schools: [...stat.schools],
          rating: stat.sum / stat.count,
          reviews: stat.count,
        }))
        .sort((a, b) => b.rating - a.rating || b.reviews - a.reviews),
      totalReviews: rows.length,
    };
    return { ...output };
  }

  // ----- Private chat after a mutual after -----

  private async requireChat(ctx: Context, chatId: string) {
    const { channelId, managerId } = this.me(ctx);
    const chat = await first<{
      id: string;
      meeting_id: string;
      member_a: string;
      member_b: string;
      meet_date: string;
    }>(
      `SELECT c.id, c.meeting_id, c.member_a, c.member_b, m.meet_date FROM meeting_private_chats c
       JOIN meetings m ON m.id = c.meeting_id
       WHERE c.id = ? AND m.channel_id = ? AND (c.member_a = ?3 OR c.member_b = ?3)`,
      chatId,
      channelId,
      managerId,
    );
    if (!chat)
      fail("개인 채팅방을 찾을 수 없어요.", FunctionCallErrorCode.NotFound);
    return { channelId, managerId, chat };
  }

  @Func(MEETING_FUNCTIONS.privateChat)
  @Description("Private chat opened by a mutual after")
  @InputSchema(PrivateChatInputSchema)
  @OutputSchema(JsonObjectSchema)
  async privateChat(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof PrivateChatInputSchema>,
  ): Promise<Json> {
    const { managerId, chat } = await this.requireChat(ctx, input.chatId);
    const partnerId =
      chat.member_a === managerId ? chat.member_b : chat.member_a;
    const partner = (await this.members(chat.meeting_id)).find(
      (member) => member.managerId === partnerId,
    );
    const messages = await all<{
      id: string;
      sender_id: string;
      body: string;
      created_at: number;
    }>(
      "SELECT id, sender_id, body, created_at FROM meeting_private_messages WHERE chat_id = ? ORDER BY created_at LIMIT 300",
      chat.id,
    );
    const output: PrivateChatOutput = {
      chatId: chat.id,
      partnerAlias: partner?.alias ?? "상대",
      partner: partner?.profile ?? {
        school: "",
        department: "",
        age: 0,
        studentYear: 0,
      },
      meetDate: chat.meet_date,
      messages: messages.map((message) => ({
        id: message.id,
        mine: message.sender_id === managerId,
        body: message.body,
        createdAt: Number(message.created_at),
      })),
    };
    return { ...output };
  }

  @Func(MEETING_FUNCTIONS.sendPrivate)
  @Description("Send a message in a private after chat")
  @InputSchema(SendPrivateInputSchema)
  @OutputSchema(JsonObjectSchema)
  async sendPrivate(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof SendPrivateInputSchema>,
  ): Promise<Json> {
    const { managerId, chat } = await this.requireChat(ctx, input.chatId);
    await run(
      "INSERT INTO meeting_private_messages (id, chat_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
      newId("pm"),
      chat.id,
      managerId,
      input.body,
      Date.now(),
    );
    return {};
  }

  @Func(MEETING_FUNCTIONS.shareContact)
  @Description("Share my private contact in the after chat (explicit consent)")
  @InputSchema(PrivateChatInputSchema)
  @OutputSchema(JsonObjectSchema)
  async shareContact(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof PrivateChatInputSchema>,
  ): Promise<Json> {
    const { channelId, managerId, chat } = await this.requireChat(
      ctx,
      input.chatId,
    );
    const profile = await this.requireProfile(channelId, managerId);
    if (!profile.contact)
      fail("프로필에 연락처(카톡 ID·인스타 등)를 먼저 등록해 주세요.");
    await run(
      "INSERT INTO meeting_private_messages (id, chat_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
      newId("pm"),
      chat.id,
      managerId,
      `제 연락처를 공유할게요: ${profile.contact}`,
      Date.now(),
    );
    return {};
  }
}

interface ApplicationRow {
  id: string;
  department: string;
  message: string;
  status: ApplicationView["status"];
  age: number | null;
  student_year: number | null;
  school: string | null;
  profile_department: string | null;
}

const APPLICATION_SELECT = `
  SELECT a.id, a.department, a.message, a.status, p.age, p.student_year, p.school, p.department AS profile_department
  FROM meeting_applications a
  JOIN meetings m ON m.id = a.meeting_id
  LEFT JOIN meeting_profiles p ON p.channel_id = m.channel_id AND p.manager_id = a.applicant_id
  WHERE a.meeting_id = ?1 AND a.status LIKE ?2`;

function toApplication(row: ApplicationRow): ApplicationView {
  return {
    id: row.id,
    school: row.school ?? "",
    department: row.department,
    message: row.message,
    status: row.status,
    profile: row.age
      ? blind({
          school: row.school,
          department: row.profile_department,
          age: row.age,
          student_year: row.student_year,
        })
      : null,
  };
}
