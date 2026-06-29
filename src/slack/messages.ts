import { webClient } from "./app.js";
import config from "../config.js";
import log from "../logger.js";
import type {
  MemberInfo,
  MemberAnalysis,
  ResearchResult,
} from "../types.js";
import type { Block, KnownBlock } from "@slack/web-api";

const CTX = "slack/messages";

// ─── Block Kit Builders ──────────────────────────────────────────────

/**
 * Build rich Block Kit blocks for a member analysis card.
 */
export function buildAnalysisBlocks(
  memberInfo: MemberInfo,
  analysis: MemberAnalysis,
  researchData: ResearchResult[] = [],
): (Block | KnownBlock)[] {
  const blocks: (Block | KnownBlock)[] = [];

  // Header
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: `👤 ${memberInfo.name || memberInfo.username}`, emoji: true },
  });

  // Profile section
  const profileFields: { type: "mrkdwn"; text: string }[] = [];
  if (memberInfo.title) {
    profileFields.push({ type: "mrkdwn", text: `*Title:* ${memberInfo.title}` });
  }
  if (memberInfo.email) {
    profileFields.push({ type: "mrkdwn", text: `*Email:* ${memberInfo.email}` });
  }
  if (memberInfo.timezone) {
    profileFields.push({ type: "mrkdwn", text: `*Timezone:* ${memberInfo.timezone}` });
  }
  profileFields.push({ type: "mrkdwn", text: `*Username:* @${memberInfo.username}` });

  if (profileFields.length) {
    blocks.push({ type: "section", fields: profileFields });
  }

  blocks.push({ type: "divider" });

  // AI Analysis
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*🧠 AI Analysis*\n${analysis.summary}` },
  });

  // Expertise
  if (analysis.expertise?.length) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*🎯 Expertise:* ${analysis.expertise.join(", ")}`,
      },
    });
  }

  // Conversation starters
  if (analysis.conversationStarters?.length) {
    const starters = analysis.conversationStarters
      .map((s) => `• ${s}`)
      .join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*💡 Conversation Starters*\n${starters}`,
      },
    });
  }

  // Engagement score
  const scoreEmoji = analysis.engagementScore >= 8 ? "🟢" : analysis.engagementScore >= 5 ? "🟡" : "🔴";
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*📈 Engagement Score:* ${scoreEmoji} ${analysis.engagementScore}/10`,
    },
  });

  // Suggested channels
  if (analysis.suggestedChannels?.length) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*📢 Suggested Channels:* ${analysis.suggestedChannels.join(", ")}`,
      },
    });
  }

  // Research data
  if (researchData.length) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*🔍 Research*" },
    });

    for (const r of researchData) {
      if (r.type === "company_info") {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🏢 *Company:* <${r.data.url}|${r.data.title}>`,
          },
        });
      }
      if (r.type === "github_info") {
        const parts = [`🐙 *GitHub:* <${r.data.url}|@${r.data.username}>`];
        if (r.data.bio) parts.push(`_${r.data.bio}_`);
        parts.push(`${r.data.publicRepos} repos · ${r.data.followers} followers`);
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: parts.join("\n") },
        });
      }
    }
  }

  // Risk flags
  if (analysis.riskFlags?.length) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*⚠️ Risk Flags:* ${analysis.riskFlags.join(", ")}`,
      },
    });
  }

  blocks.push({ type: "divider" });

  // Action buttons
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "🔄 Re-analyze", emoji: true },
        action_id: "reanalyze_member",
        value: memberInfo.id,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "📨 Send Welcome DM", emoji: true },
        action_id: "send_welcome_dm",
        value: memberInfo.id,
        style: "primary",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "📢 Invite to Channels", emoji: true },
        action_id: "invite_to_channels",
        value: memberInfo.id,
      },
    ],
  });

  return blocks;
}

/**
 * Build a short welcome DM using Block Kit.
 */
export function buildWelcomeBlocks(
  _memberInfo: MemberInfo | null,
  welcomeText: string,
): (Block | KnownBlock)[] {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: welcomeText },
    },
  ];
}

// ─── Message Senders ─────────────────────────────────────────────────

/**
 * Post a full analysis card to the designated analysis channel.
 * Returns the message timestamp (for threading).
 */
export async function postAnalysisToChannel(
  memberInfo: MemberInfo,
  analysis: MemberAnalysis,
  researchData: ResearchResult[],
): Promise<string | null> {
  const channelId = config.slack.analysisChannelId;
  if (!channelId) {
    log.warn(CTX, "SLACK_ANALYSIS_CHANNEL_ID not set — skipping channel post");
    return null;
  }

  const blocks = buildAnalysisBlocks(memberInfo, analysis, researchData);
  const fallback = `New member analysis: ${memberInfo.name || memberInfo.username}`;

  const result = await webClient.chat.postMessage({
    channel: channelId,
    text: fallback,
    blocks,
    unfurl_links: false,
  });

  log.info(CTX, `Analysis posted to ${channelId} (ts=${result.ts})`);
  return result.ts || null;
}

/**
 * Send a personalized welcome DM to a user.
 */
export async function sendWelcomeDM(
  userId: string,
  welcomeText: string,
): Promise<string | undefined> {
  const blocks = buildWelcomeBlocks(null, welcomeText);

  const result = await webClient.chat.postMessage({
    channel: userId, // DMs use the user ID directly
    text: welcomeText,
    blocks,
  });

  log.info(CTX, `Welcome DM sent to ${userId} (ts=${result.ts})`);
  return result.ts;
}

/**
 * Send an ephemeral message (visible only to one user).
 */
export async function sendEphemeral(
  channel: string,
  userId: string,
  text: string,
): Promise<void> {
  await webClient.chat.postEphemeral({
    channel,
    user: userId,
    text,
  });
}

/**
 * Post a threaded reply under an existing message.
 */
export async function postThreadReply(
  channel: string,
  threadTs: string,
  text: string,
  blocks?: (Block | KnownBlock)[],
): Promise<string | undefined> {
  const result = await webClient.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text,
    blocks: blocks || undefined,
    unfurl_links: false,
  });
  return result.ts;
}

/**
 * Update an existing message (e.g. after re-analysis).
 */
export async function updateMessage(
  channel: string,
  ts: string,
  blocks: (Block | KnownBlock)[],
  text?: string,
): Promise<void> {
  await webClient.chat.update({
    channel,
    ts,
    text: text || "Member analysis updated",
    blocks,
  });
  log.info(CTX, `Message updated in ${channel} (ts=${ts})`);
}
