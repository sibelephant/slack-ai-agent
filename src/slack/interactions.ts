import { slackApp, getUserInfo, webClient } from "./app.js";
import { runAnalysisPipeline } from "./events.js";
import { generateWelcomeMessage } from "../ai/analyzer.js";
import { getMemberAnalysis, markWelcomeDMSent } from "../db/members.js";
import {
  sendWelcomeDM,
  buildAnalysisBlocks,
  updateMessage,
  sendEphemeral,
} from "./messages.js";
import log from "../logger.js";
import type { MemberAnalysis } from "../types.js";
import type { View } from "@slack/web-api";
import type {
  BlockAction,
  ButtonAction,
  ViewSubmitAction,
} from "@slack/bolt";

const CTX = "slack/interactions";

/**
 * Register Block Kit interaction handlers (button clicks, modals).
 */
export function registerInteractions(): void {
  // ─── Re-analyze button ───────────────────────────────────────
  slackApp.action<BlockAction<ButtonAction>>(
    { type: "block_actions", action_id: "reanalyze_member" },
    async ({ action, body, ack }) => {
      await ack();
      const targetUserId = action.value;
      if (!targetUserId) return;
      const requestingUserId = body.user.id;
      const channel = body.channel?.id;

      log.info(CTX, `Re-analyze requested for ${targetUserId} by ${requestingUserId}`);

      try {
        if (channel) {
          await sendEphemeral(channel, requestingUserId, `⏳ Re-analyzing <@${targetUserId}>...`);
        }

        const result = await runAnalysisPipeline(targetUserId, {
          skipDedupe: true,
          forceReanalyze: true,
          skipWelcomeDM: true,
        });

        if (result) {
          // Update the original analysis message with fresh data
          const existing = await getMemberAnalysis(targetUserId);
          if (existing?.message_ts && existing?.channel_id) {
            const blocks = buildAnalysisBlocks(
              result.memberInfo,
              result.analysis,
              result.researchData,
            );
            await updateMessage(existing.channel_id, existing.message_ts, blocks);
          }
        }
      } catch (error) {
        const err = error as Error;
        log.error(CTX, `Re-analyze failed: ${err.message}`);
      }
    },
  );

  // ─── Send Welcome DM button ──────────────────────────────────
  slackApp.action<BlockAction<ButtonAction>>(
    { type: "block_actions", action_id: "send_welcome_dm" },
    async ({ action, body, ack }) => {
      await ack();
      const targetUserId = action.value;
      if (!targetUserId) return;
      const requestingUserId = body.user.id;
      const channel = body.channel?.id;

      log.info(CTX, `Welcome DM requested for ${targetUserId} by ${requestingUserId}`);

      try {
        const existing = await getMemberAnalysis(targetUserId);
        if (!existing) {
          if (channel) {
            await sendEphemeral(channel, requestingUserId, "⚠️ This user hasn't been analyzed yet.");
          }
          return;
        }

        const memberInfo = await getUserInfo(targetUserId);
        const analysis = existing.analysis as MemberAnalysis;
        const welcomeMsg = await generateWelcomeMessage(memberInfo, analysis);
        await sendWelcomeDM(targetUserId, welcomeMsg);
        await markWelcomeDMSent(targetUserId);

        if (channel) {
          await sendEphemeral(
            channel,
            requestingUserId,
            `✅ Welcome DM sent to <@${targetUserId}>`,
          );
        }
      } catch (error) {
        const err = error as Error;
        log.error(CTX, `Welcome DM failed: ${err.message}`);
      }
    },
  );

  // ─── Invite to Channels button ───────────────────────────────
  slackApp.action<BlockAction<ButtonAction>>(
    { type: "block_actions", action_id: "invite_to_channels" },
    async ({ action, body, ack }) => {
      await ack();
      const targetUserId = action.value;
      if (!targetUserId) return;

      log.info(CTX, `Channel invite modal requested for ${targetUserId}`);

      try {
        await webClient.views.open({
          trigger_id: body.trigger_id,
          view: buildChannelInviteModal(targetUserId),
        });
      } catch (error) {
        const err = error as Error;
        log.error(CTX, `Modal open failed: ${err.message}`);
      }
    },
  );

  // ─── Modal submission: Channel invite ────────────────────────
  slackApp.view<ViewSubmitAction>(
    "invite_channels_modal",
    async ({ ack, view }) => {
      await ack();

      const targetUserId = view.private_metadata;
      const selectedChannels =
        view.state?.values?.channel_select_block?.channel_select_action
          ?.selected_conversations || [];

      log.info(
        CTX,
        `Inviting ${targetUserId} to ${selectedChannels.length} channels`,
      );

      for (const channelId of selectedChannels) {
        try {
          await webClient.conversations.invite({
            channel: channelId,
            users: targetUserId,
          });
          log.info(CTX, `Invited ${targetUserId} to ${channelId}`);
        } catch (error) {
          const err = error as Error & { data?: { error?: string } };
          // "already_in_channel" is fine, skip it
          if (err.data?.error !== "already_in_channel") {
            log.error(
              CTX,
              `Failed to invite ${targetUserId} to ${channelId}: ${err.message}`,
            );
          }
        }
      }
    },
  );

  // ─── App Home quick action buttons ───────────────────────────
  slackApp.action<BlockAction<ButtonAction>>(
    { type: "block_actions", action_id: "home_analyze_user" },
    async ({ ack, body }) => {
      await ack();
      // Opens a simple modal asking for a user to analyze
      try {
        await webClient.views.open({
          trigger_id: body.trigger_id,
          view: buildAnalyzeUserModal(),
        });
      } catch (error) {
        const err = error as Error;
        log.error(CTX, `Analyze user modal failed: ${err.message}`);
      }
    },
  );

  slackApp.view<ViewSubmitAction>(
    "analyze_user_modal",
    async ({ ack, view }) => {
      await ack();
      const selectedUser =
        view.state?.values?.user_select_block?.user_select_action?.selected_user;

      if (selectedUser) {
        runAnalysisPipeline(selectedUser, {
          skipDedupe: true,
          forceReanalyze: true,
          skipWelcomeDM: true,
        }).catch((err: Error) =>
          log.error(CTX, `Modal analyze failed: ${err.message}`),
        );
      }
    },
  );

  log.info(CTX, "Interaction handlers registered");
}

// ─── Modal Builders ──────────────────────────────────────────────────

function buildChannelInviteModal(targetUserId: string): View {
  return {
    type: "modal",
    callback_id: "invite_channels_modal",
    private_metadata: targetUserId,
    title: { type: "plain_text", text: "Invite to Channels" },
    submit: { type: "plain_text", text: "Invite" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Select channels to invite <@${targetUserId}> to:`,
        },
      },
      {
        type: "input",
        block_id: "channel_select_block",
        label: { type: "plain_text", text: "Channels" },
        element: {
          type: "multi_conversations_select",
          action_id: "channel_select_action",
          filter: { include: ["public", "private"], exclude_bot_users: true },
          placeholder: { type: "plain_text", text: "Select channels..." },
        },
      },
    ],
  };
}

function buildAnalyzeUserModal(): View {
  return {
    type: "modal",
    callback_id: "analyze_user_modal",
    title: { type: "plain_text", text: "Analyze User" },
    submit: { type: "plain_text", text: "Analyze" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "user_select_block",
        label: { type: "plain_text", text: "Select a user" },
        element: {
          type: "users_select",
          action_id: "user_select_action",
          placeholder: { type: "plain_text", text: "Choose a user..." },
        },
      },
    ],
  };
}
