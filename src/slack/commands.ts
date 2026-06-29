import { slackApp, getUserInfo, listAllUsers } from "./app.js";
import { runAnalysisPipeline } from "./events.js";
import { sendEphemeral } from "./messages.js";
import { getAnalysisStats, getAnalyzedUserIds } from "../db/members.js";
import log from "../logger.js";
import type { SlashCommand, AckFn, RespondFn } from "@slack/bolt";

const CTX = "slack/commands";

/**
 * Register the /analyze slash command.
 */
export function registerCommands(): void {
  slackApp.command(
    "/analyze",
    async ({
      command,
      ack,
      respond,
    }: {
      command: SlashCommand;
      ack: AckFn<string>;
      respond: RespondFn;
    }) => {
      await ack();

      const text = command.text?.trim().toLowerCase() || "";
      const userId = command.user_id;
      const channelId = command.channel_id;

      try {
        // ─── /analyze status ─────────────────────────────────────
        if (text === "status") {
          const stats = await getAnalysisStats();
          await respond({
            response_type: "ephemeral",
            text: [
              "*📊 Analysis Status*",
              `Total analyzed: *${stats.total}*`,
              `This week: *${stats.this_week}*`,
              `Avg engagement: *${stats.avg_engagement || "N/A"}/10*`,
              `Welcome DMs sent: *${stats.welcomed}*`,
              `Members departed: *${stats.departed}*`,
            ].join("\n"),
          });
          return;
        }

        // ─── /analyze all ─────────────────────────────────────────
        if (text === "all") {
          await respond({
            response_type: "ephemeral",
            text: "⏳ Starting bulk analysis of all workspace members... This may take a while.",
          });

          // Run in background — don't block the response
          bulkAnalyze(userId, channelId).catch((err: Error) =>
            log.error(CTX, `Bulk analyze failed: ${err.message}`),
          );
          return;
        }

        // ─── /analyze @user ───────────────────────────────────────
        const mentionMatch = command.text?.match(/<@(U[A-Z0-9]+)\|?[^>]*>/);
        if (mentionMatch) {
          const targetUserId = mentionMatch[1];
          await sendEphemeral(
            channelId,
            userId,
            `⏳ Analyzing <@${targetUserId}>...`,
          );

          const result = await runAnalysisPipeline(targetUserId, {
            skipDedupe: true,
            forceReanalyze: true,
            skipWelcomeDM: true,
          });

          if (result) {
            await respond({
              response_type: "ephemeral",
              text: `✅ Analysis complete for <@${targetUserId}> — engagement score: ${result.analysis.engagementScore}/10. Check the analysis channel for the full report.`,
            });
          } else {
            await respond({
              response_type: "ephemeral",
              text: `⚠️ Could not analyze <@${targetUserId}>. They may be a bot.`,
            });
          }
          return;
        }

        // ─── /analyze (no args) — show help ───────────────────────
        await respond({
          response_type: "ephemeral",
          text: [
            "*🤖 /analyze — Member Intelligence*",
            "",
            "`/analyze @user` — Analyze a specific user",
            "`/analyze all` — Analyze all unanalyzed members",
            "`/analyze status` — View analysis statistics",
          ].join("\n"),
        });
      } catch (error) {
        const err = error as Error;
        log.error(CTX, `/analyze error: ${err.message}`);
        await respond({
          response_type: "ephemeral",
          text: `❌ Error: ${err.message}`,
        });
      }
    },
  );

  log.info(CTX, "Slash commands registered");
}

// ─── Internal ────────────────────────────────────────────────────────

async function bulkAnalyze(
  requestingUserId: string,
  channelId: string,
): Promise<void> {
  const allUserIds = await listAllUsers();
  const analyzedIds = await getAnalyzedUserIds();
  const unanalyzed = allUserIds.filter((id) => !analyzedIds.has(id));

  log.info(CTX, `Bulk analyze: ${unanalyzed.length} unanalyzed of ${allUserIds.length} total`);

  let success = 0;
  let failed = 0;

  for (const uid of unanalyzed) {
    try {
      await runAnalysisPipeline(uid, {
        skipDedupe: true,
        forceReanalyze: false,
        skipWelcomeDM: true, // Don't spam welcome DMs during bulk
      });
      success++;

      // Rate limit: ~5 per minute to avoid API limits
      await sleep(12_000);
    } catch (err) {
      const error = err as Error;
      log.error(CTX, `Bulk analyze failed for ${uid}: ${error.message}`);
      failed++;
    }
  }

  // Notify the requesting user when done
  try {
    await sendEphemeral(
      channelId,
      requestingUserId,
      `✅ Bulk analysis complete: ${success} analyzed, ${failed} failed, ${analyzedIds.size} previously done.`,
    );
  } catch {
    log.warn(CTX, "Could not send bulk analysis completion message");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
