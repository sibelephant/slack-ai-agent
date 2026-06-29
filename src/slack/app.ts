import { App } from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import config from "../config.js";
import log from "../logger.js";
import type { MemberInfo } from "../types.js";

const CTX = "slack/app";

/** Slack Bolt application (Socket Mode). */
export const slackApp = new App({
  token: config.slack.botToken,
  signingSecret: config.slack.signingSecret,
  socketMode: true,
  appToken: config.slack.appToken,
});

/** Authenticated WebClient instance for direct API calls. */
export const webClient = new WebClient(config.slack.botToken);

/**
 * Fetch and normalize a Slack user's profile information.
 */
export async function getUserInfo(userId: string): Promise<MemberInfo> {
  const result = await webClient.users.info({ user: userId });
  if (!result.ok) {
    throw new Error(`Failed to fetch user info: ${result.error}`);
  }

  const user = result.user!;
  return {
    id: user.id!,
    username: user.name!,
    name: user.real_name || user.name || "Unknown",
    title: user.profile?.title || null,
    email: user.profile?.email || null,
    timezone: user.tz || null,
    isBot: user.is_bot || false,
    profile: {
      firstName: user.profile?.first_name || null,
      lastName: user.profile?.last_name || null,
      statusText: user.profile?.status_text || null,
      image: user.profile?.image_192 || null,
    },
  };
}

/**
 * List all non-bot, non-deleted human users in the workspace.
 * Handles pagination automatically.
 */
export async function listAllUsers(): Promise<string[]> {
  const userIds: string[] = [];
  let cursor: string | undefined;

  do {
    const result = await webClient.users.list({
      limit: 200,
      cursor,
    });
    for (const user of result.members || []) {
      if (!user.is_bot && !user.deleted && user.id !== "USLACKBOT") {
        userIds.push(user.id!);
      }
    }
    cursor = result.response_metadata?.next_cursor;
  } while (cursor);

  log.info(CTX, `Found ${userIds.length} human users in workspace`);
  return userIds;
}
