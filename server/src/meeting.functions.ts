import { Injectable } from "@nestjs/common";
import { z, ZodError } from "zod";
import {
  AfterGetInputSchema,
  AfterGetOutputSchema,
  AfterReviewInputSchema,
  AfterSubmitInputSchema,
  ChatListInputSchema,
  ChatListOutputSchema,
  ChatSendInputSchema,
  CommandActionInputSchema,
  DemoFillOutputSchema,
  DmConsentInputSchema,
  DmGetInputSchema,
  DmGetOutputSchema,
  DmListOutputSchema,
  EmptyInputSchema,
  MEETING_FUNCTIONS as FN,
  MEETING_WAM_NAME,
  MeetingApplyInputSchema,
  MeetingCreateInputSchema,
  MeetingCreateOutputSchema,
  MeetingGetOutputSchema,
  MeetingIdInputSchema,
  MeetingListInputSchema,
  MeetingListOutputSchema,
  NudgeOutputSchema,
  OkOutputSchema,
  PlaceRecommendInputSchema,
  PlaceRecommendOutputSchema,
  PlaceReserveInputSchema,
  PlaceSelectInputSchema,
  PlaceSelectOutputSchema,
  ProfileGetOutputSchema,
  ProfileSaveInputSchema,
  RecordListOutputSchema,
  ReviewGetOutputSchema,
  ReviewInputSchema,
  SessionGetInputSchema,
  SessionGetOutputSchema,
  SessionPickInputSchema,
  SessionStartInputSchema,
  SessionVoteInputSchema,
  StatsOutputSchema,
  type AfterGetOutput,
  type ChatListOutput,
  type DemoFillOutput,
  type DmGetOutput,
  type DmListOutput,
  type MeetingCreateOutput,
  type MeetingGetOutput,
  type MeetingListOutput,
  type NudgeOutput,
  type OkOutput,
  type PlaceRecommendOutput,
  type PlaceSelectOutput,
  type ProfileGetOutput,
  type RecordListOutput,
  type ReviewGetOutput,
  type SessionGetOutput,
  type StatsOutput,
} from "@tutorial/shared";
import {
  CommandResultSchema,
  Ctx,
  Description,
  Extension,
  Func,
  FunctionCallError,
  FunctionCallErrorCode,
  GetCommandsOutputSchema,
  Input,
  InputSchema,
  OutputSchema,
  type Context,
} from "@channel.io/app-sdk-server";
import { appId } from "./config.js";
import { getDatabase } from "./database.js";
import {
  ServiceError,
  type ErrorKind,
  type ServiceContext,
} from "./services/core.js";
import { getProfile, saveProfile } from "./services/profile.js";
import {
  ackSchedule,
  applyToMeeting,
  cancelMeeting,
  createMeeting,
  declineProposal,
  fillWithDemoMembers,
  getMeetingDetail,
  leaveMeeting,
  listMeetings,
  myMeetings,
  proposalInbox,
} from "./services/meeting.js";
import { listMessages, manualNudge, sendMessage } from "./services/chat.js";
import { requireMember } from "./services/store.js";
import {
  finishSession,
  getSession,
  pickMember,
  startSession,
  voteMember,
} from "./services/session.js";
import {
  getAfterState,
  getDmRoom,
  listDmRooms,
  setContactConsent,
  submitAfter,
} from "./services/after.js";
import {
  recommendPlaces,
  selectPlace,
  shareReservation,
} from "./services/place.js";
import {
  MIN_STAT_SAMPLE,
  departmentStats,
  getReview,
  listRecords,
  submitAfterReview,
  submitReview,
} from "./services/review.js";

const ERROR_CODES: Record<ErrorKind, number> = {
  bad: FunctionCallErrorCode.BadRequest,
  notFound: FunctionCallErrorCode.NotFound,
  conflict: FunctionCallErrorCode.Conflict,
  unprocessable: FunctionCallErrorCode.UnprocessableEntity,
};

@Extension({ name: "command", systemVersion: "v1" })
export class CommandExtension {
  @Func("metadata.getCommands")
  @Description("Return the blind meeting command definition")
  @InputSchema(z.object({}))
  @OutputSchema(GetCommandsOutputSchema)
  getCommands(): z.infer<typeof GetCommandsOutputSchema> {
    return {
      commands: [
        {
          name: "meeting",
          scope: "desk",
          description: "학과 간 블라인드 미팅 열기",
          actionFunctionName: FN.open,
          alfMode: "disable",
          enabledByDefault: true,
        },
      ],
    };
  }
}

/** Every function runs as a channel manager; identity always comes from the signed context. */
async function run<T>(
  ctx: Context,
  work: (sc: ServiceContext) => Promise<T>,
): Promise<T> {
  if (ctx.caller.type !== "manager" || !ctx.caller.id) {
    throw new FunctionCallError(
      "채널 매니저 계정으로만 사용할 수 있어요.",
      FunctionCallErrorCode.BadRequest,
      { type: "forbidden" },
    );
  }
  try {
    return await work({
      db: getDatabase(),
      userId: ctx.caller.id,
      now: new Date(),
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      throw new FunctionCallError(error.message, ERROR_CODES[error.kind], {
        type: error.type,
      });
    }
    if (error instanceof ZodError) {
      throw new FunctionCallError(
        "입력값이 올바르지 않아요.",
        FunctionCallErrorCode.BadRequest,
        { type: "invalidInput" },
      );
    }
    throw error;
  }
}

const OK: OkOutput = { ok: true };

@Injectable()
export class MeetingFunctions {
  // ---- entry ---------------------------------------------------------------
  @Func(FN.open)
  @Description("Open the blind meeting WAM")
  @InputSchema(CommandActionInputSchema)
  @OutputSchema(CommandResultSchema)
  open(
    @Ctx() ctx: Context,
    @Input() params: z.infer<typeof CommandActionInputSchema>,
  ): z.infer<typeof CommandResultSchema> {
    return {
      type: "wam",
      attributes: {
        appId,
        name: MEETING_WAM_NAME,
        wamArgs: {
          chatId: params.chat?.id ?? "",
          chatType: params.chat?.type ?? "",
          managerId: ctx.caller.id ?? "",
        },
      },
    };
  }

  // ---- profile -------------------------------------------------------------
  @Func(FN.profileGet)
  @Description("Get my blind profile")
  @InputSchema(EmptyInputSchema)
  @OutputSchema(ProfileGetOutputSchema)
  profileGet(@Ctx() ctx: Context): Promise<ProfileGetOutput> {
    return run(ctx, async (sc) => ({ profile: await getProfile(sc) }));
  }

  @Func(FN.profileSave)
  @Description("Save my blind profile")
  @InputSchema(ProfileSaveInputSchema)
  @OutputSchema(ProfileGetOutputSchema)
  profileSave(
    @Ctx() ctx: Context,
    @Input() input: unknown,
  ): Promise<ProfileGetOutput> {
    return run(ctx, async (sc) => ({
      profile: await saveProfile(sc, ProfileSaveInputSchema.parse(input)),
    }));
  }

  // ---- meetings ------------------------------------------------------------
  @Func(FN.list)
  @Description("List meetings that are recruiting")
  @InputSchema(MeetingListInputSchema)
  @OutputSchema(MeetingListOutputSchema)
  list(
    @Ctx() ctx: Context,
    @Input() input: unknown,
  ): Promise<MeetingListOutput> {
    return run(ctx, async (sc) => ({
      meetings: await listMeetings(
        sc,
        MeetingListInputSchema.parse(input ?? {}),
      ),
    }));
  }

  @Func(FN.mine)
  @Description("List meetings I joined or hosted")
  @InputSchema(EmptyInputSchema)
  @OutputSchema(MeetingListOutputSchema)
  mine(@Ctx() ctx: Context): Promise<MeetingListOutput> {
    return run(ctx, async (sc) => ({ meetings: await myMeetings(sc) }));
  }

  @Func(FN.inbox)
  @Description("Proposals sent to my department")
  @InputSchema(EmptyInputSchema)
  @OutputSchema(MeetingListOutputSchema)
  inbox(@Ctx() ctx: Context): Promise<MeetingListOutput> {
    return run(ctx, async (sc) => ({ meetings: await proposalInbox(sc) }));
  }

  @Func(FN.get)
  @Description("Get meeting detail")
  @InputSchema(MeetingIdInputSchema)
  @OutputSchema(MeetingGetOutputSchema)
  get(@Ctx() ctx: Context, @Input() input: unknown): Promise<MeetingGetOutput> {
    return run(ctx, async (sc) => ({
      meeting: await getMeetingDetail(
        sc,
        MeetingIdInputSchema.parse(input).meetingId,
      ),
    }));
  }

  @Func(FN.create)
  @Description("Create a recruiting post or a proposal to another department")
  @InputSchema(MeetingCreateInputSchema)
  @OutputSchema(MeetingCreateOutputSchema)
  create(
    @Ctx() ctx: Context,
    @Input() input: unknown,
  ): Promise<MeetingCreateOutput> {
    return run(ctx, async (sc) => ({
      meetingId: await createMeeting(sc, MeetingCreateInputSchema.parse(input)),
    }));
  }

  @Func(FN.apply)
  @Description("Apply to a meeting (or accept a proposal)")
  @InputSchema(MeetingApplyInputSchema)
  @OutputSchema(OkOutputSchema)
  apply(@Ctx() ctx: Context, @Input() input: unknown): Promise<OkOutput> {
    return run(ctx, async (sc) => {
      const { meetingId, side } = MeetingApplyInputSchema.parse(input);
      await applyToMeeting(sc, meetingId, side);
      return OK;
    });
  }

  @Func(FN.leave)
  @Description("Leave a meeting that is still recruiting")
  @InputSchema(MeetingIdInputSchema)
  @OutputSchema(OkOutputSchema)
  leave(@Ctx() ctx: Context, @Input() input: unknown): Promise<OkOutput> {
    return run(ctx, async (sc) => {
      await leaveMeeting(sc, MeetingIdInputSchema.parse(input).meetingId);
      return OK;
    });
  }

  @Func(FN.cancel)
  @Description("Cancel a meeting I host")
  @InputSchema(MeetingIdInputSchema)
  @OutputSchema(OkOutputSchema)
  cancel(@Ctx() ctx: Context, @Input() input: unknown): Promise<OkOutput> {
    return run(ctx, async (sc) => {
      await cancelMeeting(sc, MeetingIdInputSchema.parse(input).meetingId);
      return OK;
    });
  }

  @Func(FN.decline)
  @Description("Decline a proposal")
  @InputSchema(MeetingIdInputSchema)
  @OutputSchema(OkOutputSchema)
  decline(@Ctx() ctx: Context, @Input() input: unknown): Promise<OkOutput> {
    return run(ctx, async (sc) => {
      await declineProposal(sc, MeetingIdInputSchema.parse(input).meetingId);
      return OK;
    });
  }

  @Func(FN.ack)
  @Description("Confirm the meeting schedule")
  @InputSchema(MeetingIdInputSchema)
  @OutputSchema(OkOutputSchema)
  ack(@Ctx() ctx: Context, @Input() input: unknown): Promise<OkOutput> {
    return run(ctx, async (sc) => {
      await ackSchedule(sc, MeetingIdInputSchema.parse(input).meetingId);
      return OK;
    });
  }

  @Func(FN.nudge)
  @Description("Remind people who haven't confirmed the schedule")
  @InputSchema(MeetingIdInputSchema)
  @OutputSchema(NudgeOutputSchema)
  nudge(@Ctx() ctx: Context, @Input() input: unknown): Promise<NudgeOutput> {
    return run(ctx, async (sc) => {
      const { meetingId } = MeetingIdInputSchema.parse(input);
      await requireMember(sc, meetingId);
      return manualNudge(sc, meetingId);
    });
  }

  @Func(FN.demoFill)
  @Description("Fill remaining seats with demo participants (host only)")
  @InputSchema(MeetingIdInputSchema)
  @OutputSchema(DemoFillOutputSchema)
  demoFill(
    @Ctx() ctx: Context,
    @Input() input: unknown,
  ): Promise<DemoFillOutput> {
    return run(ctx, async (sc) => ({
      added: await fillWithDemoMembers(
        sc,
        MeetingIdInputSchema.parse(input).meetingId,
      ),
    }));
  }

  // ---- chat ----------------------------------------------------------------
  @Func(FN.chatList)
  @Description("List chat messages")
  @InputSchema(ChatListInputSchema)
  @OutputSchema(ChatListOutputSchema)
  chatList(
    @Ctx() ctx: Context,
    @Input() input: unknown,
  ): Promise<ChatListOutput> {
    return run(ctx, async (sc) => ({
      messages: await listMessages(sc, ChatListInputSchema.parse(input)),
    }));
  }

  @Func(FN.chatSend)
  @Description("Send a chat message")
  @InputSchema(ChatSendInputSchema)
  @OutputSchema(OkOutputSchema)
  chatSend(@Ctx() ctx: Context, @Input() input: unknown): Promise<OkOutput> {
    return run(ctx, async (sc) => {
      await sendMessage(sc, ChatSendInputSchema.parse(input));
      return OK;
    });
  }

  // ---- session -------------------------------------------------------------
  @Func(FN.sessionGet)
  @Description("Get the meeting progress state")
  @InputSchema(SessionGetInputSchema)
  @OutputSchema(SessionGetOutputSchema)
  sessionGet(
    @Ctx() ctx: Context,
    @Input() input: unknown,
  ): Promise<SessionGetOutput> {
    return run(ctx, async (sc) => ({
      session: await getSession(
        sc,
        SessionGetInputSchema.parse(input).meetingId,
      ),
    }));
  }

  @Func(FN.sessionStart)
  @Description("Start the meeting timer (host only)")
  @InputSchema(SessionStartInputSchema)
  @OutputSchema(OkOutputSchema)
  sessionStart(
    @Ctx() ctx: Context,
    @Input() input: unknown,
  ): Promise<OkOutput> {
    return run(ctx, async (sc) => {
      const { meetingId, speed } = SessionStartInputSchema.parse(input);
      await startSession(sc, meetingId, speed);
      return OK;
    });
  }

  @Func(FN.sessionFinish)
  @Description("Finish the meeting (host only)")
  @InputSchema(MeetingIdInputSchema)
  @OutputSchema(OkOutputSchema)
  sessionFinish(
    @Ctx() ctx: Context,
    @Input() input: unknown,
  ): Promise<OkOutput> {
    return run(ctx, async (sc) => {
      await finishSession(sc, MeetingIdInputSchema.parse(input).meetingId);
      return OK;
    });
  }

  @Func(FN.sessionPick)
  @Description("Pick the person I most want to talk to")
  @InputSchema(SessionPickInputSchema)
  @OutputSchema(OkOutputSchema)
  sessionPick(@Ctx() ctx: Context, @Input() input: unknown): Promise<OkOutput> {
    return run(ctx, async (sc) => {
      await pickMember(sc, SessionPickInputSchema.parse(input));
      return OK;
    });
  }

  @Func(FN.sessionVote)
  @Description("Vote on a mission prompt")
  @InputSchema(SessionVoteInputSchema)
  @OutputSchema(OkOutputSchema)
  sessionVote(@Ctx() ctx: Context, @Input() input: unknown): Promise<OkOutput> {
    return run(ctx, async (sc) => {
      await voteMember(sc, SessionVoteInputSchema.parse(input));
      return OK;
    });
  }

  // ---- after ---------------------------------------------------------------
  @Func(FN.afterGet)
  @Description("Get my after-meeting state")
  @InputSchema(AfterGetInputSchema)
  @OutputSchema(AfterGetOutputSchema)
  afterGet(
    @Ctx() ctx: Context,
    @Input() input: unknown,
  ): Promise<AfterGetOutput> {
    return run(ctx, async (sc) => ({
      after: await getAfterState(
        sc,
        AfterGetInputSchema.parse(input).meetingId,
      ),
    }));
  }

  @Func(FN.afterSubmit)
  @Description("Submit my anonymous after choices")
  @InputSchema(AfterSubmitInputSchema)
  @OutputSchema(OkOutputSchema)
  afterSubmit(@Ctx() ctx: Context, @Input() input: unknown): Promise<OkOutput> {
    return run(ctx, async (sc) => {
      await submitAfter(sc, AfterSubmitInputSchema.parse(input));
      return OK;
    });
  }

  @Func(FN.dmList)
  @Description("List my direct chat rooms")
  @InputSchema(EmptyInputSchema)
  @OutputSchema(DmListOutputSchema)
  dmList(@Ctx() ctx: Context): Promise<DmListOutput> {
    return run(ctx, async (sc) => ({ rooms: await listDmRooms(sc) }));
  }

  @Func(FN.dmGet)
  @Description("Get a direct chat room")
  @InputSchema(DmGetInputSchema)
  @OutputSchema(DmGetOutputSchema)
  dmGet(@Ctx() ctx: Context, @Input() input: unknown): Promise<DmGetOutput> {
    return run(ctx, async (sc) => ({
      room: await getDmRoom(sc, DmGetInputSchema.parse(input).roomId),
    }));
  }

  @Func(FN.dmConsent)
  @Description("Agree (or withdraw) to exchange contact info")
  @InputSchema(DmConsentInputSchema)
  @OutputSchema(DmGetOutputSchema)
  dmConsent(
    @Ctx() ctx: Context,
    @Input() input: unknown,
  ): Promise<DmGetOutput> {
    return run(ctx, async (sc) => ({
      room: await setContactConsent(sc, DmConsentInputSchema.parse(input)),
    }));
  }

  // ---- places --------------------------------------------------------------
  @Func(FN.placeRecommend)
  @Description("Recommend places")
  @InputSchema(PlaceRecommendInputSchema)
  @OutputSchema(PlaceRecommendOutputSchema)
  placeRecommend(
    @Ctx() ctx: Context,
    @Input() input: unknown,
  ): Promise<PlaceRecommendOutput> {
    return run(ctx, async (sc) => ({
      places: await recommendPlaces(
        sc,
        PlaceRecommendInputSchema.parse(input ?? {}),
      ),
    }));
  }

  @Func(FN.placeSelect)
  @Description("Confirm the meeting place (host only)")
  @InputSchema(PlaceSelectInputSchema)
  @OutputSchema(PlaceSelectOutputSchema)
  placeSelect(
    @Ctx() ctx: Context,
    @Input() input: unknown,
  ): Promise<PlaceSelectOutput> {
    return run(ctx, async (sc) => ({
      place: await selectPlace(sc, PlaceSelectInputSchema.parse(input)),
    }));
  }

  @Func(FN.placeReserve)
  @Description("Share the reservation schedule (host only)")
  @InputSchema(PlaceReserveInputSchema)
  @OutputSchema(PlaceSelectOutputSchema)
  placeReserve(
    @Ctx() ctx: Context,
    @Input() input: unknown,
  ): Promise<PlaceSelectOutput> {
    return run(ctx, async (sc) => ({
      place: await shareReservation(sc, PlaceReserveInputSchema.parse(input)),
    }));
  }

  // ---- reviews, records, stats ---------------------------------------------
  @Func(FN.reviewGet)
  @Description("Get my review state for a meeting")
  @InputSchema(MeetingIdInputSchema)
  @OutputSchema(ReviewGetOutputSchema)
  reviewGet(
    @Ctx() ctx: Context,
    @Input() input: unknown,
  ): Promise<ReviewGetOutput> {
    return run(ctx, (sc) =>
      getReview(sc, MeetingIdInputSchema.parse(input).meetingId),
    );
  }

  @Func(FN.reviewSubmit)
  @Description("Submit my meeting review")
  @InputSchema(ReviewInputSchema)
  @OutputSchema(OkOutputSchema)
  reviewSubmit(
    @Ctx() ctx: Context,
    @Input() input: unknown,
  ): Promise<OkOutput> {
    return run(ctx, async (sc) => {
      await submitReview(sc, ReviewInputSchema.parse(input));
      return OK;
    });
  }

  @Func(FN.afterReviewSubmit)
  @Description("Submit my after-date review")
  @InputSchema(AfterReviewInputSchema)
  @OutputSchema(OkOutputSchema)
  afterReviewSubmit(
    @Ctx() ctx: Context,
    @Input() input: unknown,
  ): Promise<OkOutput> {
    return run(ctx, async (sc) => {
      await submitAfterReview(sc, AfterReviewInputSchema.parse(input));
      return OK;
    });
  }

  @Func(FN.recordList)
  @Description("List my meeting records")
  @InputSchema(EmptyInputSchema)
  @OutputSchema(RecordListOutputSchema)
  recordList(@Ctx() ctx: Context): Promise<RecordListOutput> {
    return run(ctx, async (sc) => ({ records: await listRecords(sc) }));
  }

  @Func(FN.statsDepartments)
  @Description("Aggregated meeting statistics per department")
  @InputSchema(EmptyInputSchema)
  @OutputSchema(StatsOutputSchema)
  statsDepartments(@Ctx() ctx: Context): Promise<StatsOutput> {
    return run(ctx, async (sc) => ({
      stats: await departmentStats(sc),
      minSample: MIN_STAT_SAMPLE,
    }));
  }
}
