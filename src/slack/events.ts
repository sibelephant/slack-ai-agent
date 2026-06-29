import { slackApp, getUserInfo } from "./app.js";
import { doBasicResearch } from "../research/researcher.js";
import { analyzeWithAI, generateWelcomeMessage } from "../ai/analyzer.js";
import {
  saveMemberAnalysis,
  markAsSentToSlack,
  markWelcomeDMSent,
  hasBeenAnalyzed,
  getMemberAnalysis,
  markMemberLeft,
} from "../db/members.js";
import {
  postAnalysisToChannel,
  sendWelcomeDM,
  postThreadReply,
} from "./messages.js";
import config from "../config.js";
import log from "../logger.js";
import type { PipelineOptions, PipelineResult } from "../types.js";
import type {
  TeamJoinEvent,
  MemberJoinedChannelEvent,
  MemberLeftChannelEvent,
  AppMentionEvent,
  UserChangeEvent,
} from "@slack/types";
import type { SayFn } from "@slack/bolt";

const CTX = "slack/events";

/** Debounce window: skip analysis if already analyzed within this many ms. */
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/** Recently processed user IDs with timestamps — simple in-memory dedup. */
const recentlyProcessed = new Map<string, number>();

/**
 * The core analysis pipeline used by all entry points.
 */
export async function runAnalysisPipeline(
  userId: string,
  opts: PipelineOptions = {},
): Promise<PipelineResult | null> {
  const { skipDedupe = false, forceReanalyze = false, skipWelcomeDM = false } = opts;

  // In-memory dedup for rapid-fire events (team_join + member_joined_channel)
  if (!skipDedupe && !forceReanalyze) {
    const lastProcessed = recentlyProcessed.get(userId);
    if (lastProcessed && Date.now() - lastProcessed < DEDUP_WINDOW_MS) {
      log.info(CTX, `Skipping ${userId} — recently processed`);
      return null;
    }
  }

  // DB-level dedup (unless force re-analyze)
  if (!forceReanalyze && (await hasBeenAnalyzed(userId))) {
    log.info(CTX, `Skipping ${userId} — already analyzed in DB`);
    return null;
  }

  recentlyProcessed.set(userId, Date.now());

  // 1. Get user info
  const memberInfo = await getUserInfo(userId);
  if (memberInfo.isBot) {
    log.info(CTX, `Skipping ${userId} — is a bot`);
    return null;
  }

  log.info(CTX, `Pipeline started for: ${memberInfo.name}`);

  // 2. Research
  const researchData = await doBasicResearch(memberInfo);

  // 3. AI analysis
  const analysis = await analyzeWithAI(memberInfo, researchData);

  // 4. Save to database
  const analysisId = await saveMemberAnalysis(memberInfo, analysis, researchData);

  // 5. Post to analysis channel
  const messageTs = await postAnalysisToChannel(memberInfo, analysis, researchData);
  if (messageTs) {
    await markAsSentToSlack(analysisId, messageTs, config.slack.analysisChannelId);
  }

  // 6. Send welcome DM
  if (!skipWelcomeDM) {
    try {
      const welcomeMsg = await generateWelcomeMessage(memberInfo, analysis);
      await sendWelcomeDM(userId, welcomeMsg);
      await markWelcomeDMSent(userId);
    } catch (err) {
      const error = err as Error;
      log.error(CTX, `Welcome DM failed for ${userId}: ${error.message}`);
    }
  }

  log.info(CTX, `Pipeline complete for: ${memberInfo.name}`);
  return { memberInfo, analysis, researchData, analysisId };
}

/**
 * Register all Slack event handlers on the Bolt app.
 */
export function registerEvents(): void {
  // ─── team_join: New workspace member ────────────────────────────
  slackApp.event("team_join", async ({ event }: { event: TeamJoinEvent }) => {
    try {
      const userId =
        typeof event.user === "string" ? event.user : event.user?.id;
      if (!userId) return;
      log.info(CTX, `team_join event for user: ${userId}`);
      await runAnalysisPipeline(userId);
    } catch (error) {
      const err = error as Error;
      log.error(CTX, `team_join handler error: ${err.message}`);
    }
  });

  // ─── member_joined_channel: Public channel join ─────────────────
  slackApp.event(
    "member_joined_channel",
    async ({ event }: { event: MemberJoinedChannelEvent }) => {
      try {
        if (event.channel_type === "C") {
          log.info(CTX, `member_joined_channel for ${event.user} in ${event.channel}`);
          await runAnalysisPipeline(event.user);
        }
      } catch (error) {
        const err = error as Error;
        log.error(CTX, `member_joined_channel handler error: ${err.message}`);
      }
    },
  );

  // ─── user_change: Profile updated ──────────────────────────────
  slackApp.event("user_change", async ({ event }: { event: UserChangeEvent }) => {
    try {
      const userId =
        typeof event.user === "string" ? event.user : event.user?.id;
      if (!userId) return;
      log.info(CTX, `user_change event for user: ${userId}`);

      const existing = await getMemberAnalysis(userId);
      if (!existing) {
        log.debug(CTX, `user_change: ${userId} not previously analyzed, skipping`);
        return;
      }

      // Re-analyze with force flag
      const result = await runAnalysisPipeline(userId, {
        skipDedupe: true,
        forceReanalyze: true,
        skipWelcomeDM: true, // Don't re-send welcome DM on profile update
      });

      // Post update as thread reply on the original analysis
      if (result && existing.message_ts && existing.channel_id) {
        await postThreadReply(
          existing.channel_id,
          existing.message_ts,
          `🔄 *Profile updated* — re-analyzed <@${userId}>.\n_${result.analysis.summary}_`,
        );
      }
    } catch (error) {
      const err = error as Error;
      log.error(CTX, `user_change handler error: ${err.message}`);
    }
  });

  // ─── member_left_channel: Departure tracking ──────────────────
  slackApp.event(
    "member_left_channel",
    async ({ event }: { event: MemberLeftChannelEvent }) => {
      try {
        log.info(CTX, `member_left_channel: ${event.user} left ${event.channel}`);
        await markMemberLeft(event.user);

        // Post a departure note as a thread reply if we have the original analysis
        const existing = await getMemberAnalysis(event.user);
        if (existing?.message_ts && existing?.channel_id) {
          await postThreadReply(
            existing.channel_id,
            existing.message_ts,
            `👋 <@${event.user}> left <#${event.channel}>.`,
          );
        }
      } catch (error) {
        const err = error as Error;
        log.error(CTX, `member_left_channel handler error: ${err.message}`);
      }
    },
  );

  // ─── app_mention: @agent commands ─────────────────────────────
  slackApp.event(
    "app_mention",
    async ({ event, say }: { event: AppMentionEvent; say: SayFn }) => {
      try {
        log.info(CTX, `app_mention in ${event.channel}: "${event.text}"`);

        // Parse out mentioned user IDs (excluding the bot mention itself)
        const userMentions = [...event.text.matchAll(/<@(U[A-Z0-9]+)>/g)]
          .map((m) => m[1])
          .filter((id) => id !== event.user); // remove the person who mentioned

        // Check for "analyze" keyword
        const textLower = event.text.toLowerCase();
        if (textLower.includes("analyze") || textLower.includes("analyse")) {
          if (userMentions.length === 0) {
            await say({
              text: "Please mention a user to analyze, e.g. `@Agent analyze @someone`",
              thread_ts: event.ts,
            });
            return;
          }

          for (const targetUserId of userMentions) {
            await say({
              text: `⏳ Analyzing <@${targetUserId}>...`,
              thread_ts: event.ts,
            });

            const result = await runAnalysisPipeline(targetUserId, {
              skipDedupe: true,
              forceReanalyze: true,
              skipWelcomeDM: true,
            });

            if (result) {
              await say({
                text: `✅ Analysis complete for <@${targetUserId}> — engagement score: ${result.analysis.engagementScore}/10`,
                thread_ts: event.ts,
              });
            } else {
              await say({
                text: `⚠️ Could not analyze <@${targetUserId}>`,
                thread_ts: event.ts,
              });
            }
          }
        } else {
          await say({
            text: "👋 I can analyze workspace members! Try: `@Agent analyze @someone`",
            thread_ts: event.ts,
          });
        }
      } catch (error) {
        const err = error as Error;
        log.error(CTX, `app_mention handler error: ${err.message}`);
      }
    },
  );

  // ─── Global error handler ────────────────────────────────────
  slackApp.error(async (error) => {
    log.error(CTX, `Slack app error: ${error.message}`);
  });

  log.info(CTX, "Event handlers registered");
}
