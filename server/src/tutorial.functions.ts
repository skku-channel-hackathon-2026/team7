import { Injectable } from "@nestjs/common";
import { z } from "zod";
import {
  CommandActionInputSchema,
  MEETING_FUNCTIONS,
  SendAsBotInputSchema,
  TUTORIAL_FUNCTIONS,
  TUTORIAL_WAM_NAME,
  type CommandActionInput,
  type SendAsBotInput,
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
  NativeFunctionClient,
  OutputSchema,
  TokenManager,
  type Context,
} from "@channel.io/app-sdk-server";
import { appSecret } from "./config.js";
import { openMeetingWam } from "./meeting.functions.js";
import { readTutorialTargetToken } from "./target-token.js";

const botMessage = "This is a test message sent by a bot.";

@Extension({ name: "command", systemVersion: "v1" })
export class CommandExtension {
  @Func("metadata.getCommands")
  @Description("Return the tutorial and meeting command definitions")
  @InputSchema(z.object({}))
  @OutputSchema(GetCommandsOutputSchema)
  getCommands(): z.infer<typeof GetCommandsOutputSchema> {
    return {
      commands: [
        {
          name: "tutorial",
          scope: "desk",
          description: "Open the Channel App SDK tutorial WAM",
          actionFunctionName: TUTORIAL_FUNCTIONS.open,
          alfMode: "disable",
          enabledByDefault: true,
        },
        {
          name: "meeting",
          scope: "desk",
          description:
            "과메기: 대학생 블라인드 미팅 (모집·채팅방·미팅 진행·애프터)",
          actionFunctionName: MEETING_FUNCTIONS.open,
          alfMode: "disable",
          enabledByDefault: true,
        },
      ],
    };
  }
}

@Injectable()
export class TutorialFunctions {
  constructor(
    private readonly tokenManager: TokenManager,
    private readonly nativeClient: NativeFunctionClient,
  ) {}

  // `/tutorial` is the command already registered in Desk, so it opens the
  // meeting app directly; no extension re-registration is needed.
  @Func(TUTORIAL_FUNCTIONS.open)
  @Description("Open the blind meeting WAM")
  @InputSchema(CommandActionInputSchema)
  @OutputSchema(CommandResultSchema)
  open(
    @Ctx() ctx: Context,
    @Input() params: CommandActionInput,
  ): z.infer<typeof CommandResultSchema> {
    return openMeetingWam(ctx, params, TUTORIAL_WAM_NAME);
  }

  @Func(TUTORIAL_FUNCTIONS.sendAsBot)
  @Description("Send a team chat message with the app bot profile")
  @InputSchema(SendAsBotInputSchema)
  @OutputSchema(z.object({}))
  async sendAsBot(
    @Ctx() ctx: Context,
    @Input() input: SendAsBotInput,
  ): Promise<Record<string, never>> {
    const target = readTutorialTargetToken(input.targetToken, appSecret);
    if (
      !target ||
      target.expiresAt <= Date.now() ||
      target.channelId !== ctx.channel.id ||
      ctx.caller.type !== "manager" ||
      target.managerId !== ctx.caller.id
    ) {
      throw new FunctionCallError(
        "The tutorial target is invalid or expired",
        FunctionCallErrorCode.BadRequest,
        { type: "invalidTarget" },
      );
    }

    const token = await this.tokenManager.getChannelToken({
      channelId: ctx.channel.id,
    });
    const api = this.nativeClient.createProxyApi(token.accessToken);

    try {
      await api.writeGroupMessage({
        channelId: ctx.channel.id,
        groupId: target.groupId,
        rootMessageId: input.rootMessageId,
        broadcast: input.broadcast,
        dto: {
          plainText: botMessage,
          botName: "AppTutorialBot",
        },
      });
    } catch {
      throw new FunctionCallError(
        "The bot message could not be sent",
        FunctionCallErrorCode.Internal,
        { type: "nativeCallFailed" },
      );
    }

    return {};
  }
}
