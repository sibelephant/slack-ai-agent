import { slackApp, webClient } from "./app.js";
import { getRecentAnalyses, getAnalysisStats } from "../db/members.js";
import log from "../logger.js";
import type { MemberAnalysis } from "../types.js";
import type { KnownBlock } from "@slack/web-api";
import type { AppHomeOpenedEvent } from "@slack/types";

const CTX = "slack/home";

/**
 * Register the App Home tab handler.
 */
export function registerHome(): void {
  slackApp.event(
    "app_home_opened",
    async ({ event }: { event: AppHomeOpenedEvent }) => {
      if (event.tab !== "home") return;

      try {
        log.debug(CTX, `App Home opened by ${event.user}`);
        const blocks = await buildHomeBlocks();

        await webClient.views.publish({
          user_id: event.user,
          view: {
            type: "home",
            blocks,
          },
        });
      } catch (error) {
        const err = error as Error;
        log.error(CTX, `App Home render failed: ${err.message}`);
      }
    },
  );

  log.info(CTX, "App Home handler registered");
}

// ─── Home View Builder ───────────────────────────────────────────────

async function buildHomeBlocks(): Promise<KnownBlock[]> {
  const [stats, recent] = await Promise.all([
    getAnalysisStats(),
    getRecentAnalyses(8),
  ]);

  const blocks: KnownBlock[] = [];

  // ─── Header ────────────────────────────────────────────────────
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: "🤖 Member Intelligence Dashboard",
      emoji: true,
    },
  });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: "_AI-powered analysis of your workspace members_",
    },
  });

  blocks.push({ type: "divider" });

  // ─── Stats ─────────────────────────────────────────────────────
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: "*📊 Statistics*" },
  });

  blocks.push({
    type: "section",
    fields: [
      {
        type: "mrkdwn",
        text: `*Total Analyzed*\n${stats?.total || 0}`,
      },
      {
        type: "mrkdwn",
        text: `*This Week*\n${stats?.this_week || 0}`,
      },
      {
        type: "mrkdwn",
        text: `*Avg Engagement*\n${stats?.avg_engagement || "N/A"}/10`,
      },
      {
        type: "mrkdwn",
        text: `*Welcome DMs Sent*\n${stats?.welcomed || 0}`,
      },
      {
        type: "mrkdwn",
        text: `*Members Departed*\n${stats?.departed || 0}`,
      },
    ],
  });

  blocks.push({ type: "divider" });

  // ─── Recent Analyses ───────────────────────────────────────────
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: "*🆕 Recent Analyses*" },
  });

  if (recent.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "_No analyses yet. Use `/analyze @user` or wait for new members to join._",
      },
    });
  } else {
    for (const row of recent) {
      const analysis: MemberAnalysis =
        typeof row.analysis === "string"
          ? JSON.parse(row.analysis)
          : row.analysis;
      const score = analysis?.engagementScore || "?";
      const scoreEmoji =
        typeof score === "number"
          ? score >= 8
            ? "🟢"
            : score >= 5
              ? "🟡"
              : "🔴"
          : "⚪";
      const title = row.title ? ` — ${row.title}` : "";
      const date = new Date(row.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${scoreEmoji} *<@${row.slack_user_id}>*${title}\n_Score: ${score}/10 · Analyzed: ${date}_`,
        },
      });
    }
  }

  blocks.push({ type: "divider" });

  // ─── Quick Actions ─────────────────────────────────────────────
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: "*⚡ Quick Actions*" },
  });

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "🔍 Analyze User", emoji: true },
        action_id: "home_analyze_user",
        style: "primary",
      },
    ],
  });

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "💡 _Tip: Use `/analyze @user` in any channel, or mention me with `@Agent analyze @user`_",
      },
    ],
  });

  return blocks;
}
