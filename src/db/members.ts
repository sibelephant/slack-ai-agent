import { query } from "./pool.js";
import log from "../logger.js";
import type {
  MemberInfo,
  MemberAnalysis,
  ResearchResult,
  MemberAnalysisRow,
  AnalysisStats,
} from "../types.js";

const CTX = "db/members";

/**
 * Insert or update a member analysis.
 * Returns the row id.
 */
export async function saveMemberAnalysis(
  memberInfo: MemberInfo,
  analysis: MemberAnalysis,
  researchData: ResearchResult[],
): Promise<number> {
  const sql = `
    INSERT INTO member_analyses
      (slack_user_id, username, display_name, email, title, analysis, research_data, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (slack_user_id) DO UPDATE SET
      username      = EXCLUDED.username,
      display_name  = EXCLUDED.display_name,
      email         = EXCLUDED.email,
      title         = EXCLUDED.title,
      analysis      = EXCLUDED.analysis,
      research_data = EXCLUDED.research_data,
      updated_at    = NOW()
    RETURNING id;
  `;
  const params = [
    memberInfo.id,
    memberInfo.username,
    memberInfo.name,
    memberInfo.email || null,
    memberInfo.title || null,
    JSON.stringify(analysis),
    JSON.stringify(researchData),
  ];
  const result = await query(sql, params);
  log.info(CTX, `Saved analysis for ${memberInfo.name} (id=${result.rows[0].id})`);
  return result.rows[0].id as number;
}

/**
 * Mark an analysis as posted to Slack and store the message timestamp
 * so we can thread replies and update the message later.
 */
export async function markAsSentToSlack(
  id: number,
  messageTs: string,
  channelId: string | null,
): Promise<void> {
  await query(
    `UPDATE member_analyses
     SET sent_to_slack = TRUE, message_ts = $2, channel_id = $3, updated_at = NOW()
     WHERE id = $1`,
    [id, messageTs, channelId],
  );
}

/** Mark that a welcome DM was sent to this member. */
export async function markWelcomeDMSent(slackUserId: string): Promise<void> {
  await query(
    `UPDATE member_analyses
     SET welcome_dm_sent = TRUE, updated_at = NOW()
     WHERE slack_user_id = $1`,
    [slackUserId],
  );
}

/** Record that a member left a channel. */
export async function markMemberLeft(slackUserId: string): Promise<void> {
  await query(
    `UPDATE member_analyses
     SET left_at = NOW(), updated_at = NOW()
     WHERE slack_user_id = $1`,
    [slackUserId],
  );
}

/** Get a member's analysis by Slack user ID. Returns the row or null. */
export async function getMemberAnalysis(
  slackUserId: string,
): Promise<MemberAnalysisRow | null> {
  const result = await query(
    `SELECT * FROM member_analyses WHERE slack_user_id = $1`,
    [slackUserId],
  );
  return (result.rows[0] as MemberAnalysisRow) || null;
}

/** Check if a member has already been analyzed. */
export async function hasBeenAnalyzed(slackUserId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM member_analyses WHERE slack_user_id = $1 LIMIT 1`,
    [slackUserId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Get recent analyses for the App Home dashboard. */
export async function getRecentAnalyses(
  limit: number = 10,
): Promise<MemberAnalysisRow[]> {
  const result = await query(
    `SELECT slack_user_id, display_name, title, analysis, created_at
     FROM member_analyses
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows as MemberAnalysisRow[];
}

/** Get aggregate stats for the App Home dashboard. */
export async function getAnalysisStats(): Promise<AnalysisStats> {
  const result = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS this_week,
      ROUND(AVG((analysis->>'engagementScore')::numeric), 1) AS avg_engagement,
      COUNT(*) FILTER (WHERE welcome_dm_sent = TRUE)::int AS welcomed,
      COUNT(*) FILTER (WHERE left_at IS NOT NULL)::int AS departed
    FROM member_analyses
  `);
  return result.rows[0] as AnalysisStats;
}

/** Count members who have not been analyzed yet. Requires a total to compare against. */
export async function getAnalyzedUserIds(): Promise<Set<string>> {
  const result = await query(
    `SELECT slack_user_id FROM member_analyses`,
  );
  return new Set(
    result.rows.map((r: { slack_user_id: string }) => r.slack_user_id),
  );
}
