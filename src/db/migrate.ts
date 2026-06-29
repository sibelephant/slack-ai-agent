import { query } from "./pool.js";
import log from "../logger.js";

const CTX = "db/migrate";

interface Migration {
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    name: "create_member_analyses",
    sql: `
      CREATE TABLE IF NOT EXISTS member_analyses (
        id              SERIAL PRIMARY KEY,
        slack_user_id   VARCHAR(32) UNIQUE NOT NULL,
        username        VARCHAR(255),
        display_name    VARCHAR(255),
        email           VARCHAR(255),
        title           VARCHAR(500),
        analysis        JSONB NOT NULL,
        research_data   JSONB,
        welcome_dm_sent BOOLEAN DEFAULT FALSE,
        sent_to_slack   BOOLEAN DEFAULT FALSE,
        message_ts      VARCHAR(64),
        channel_id      VARCHAR(32),
        left_at         TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  },
  {
    name: "create_member_analyses_index",
    sql: `
      CREATE INDEX IF NOT EXISTS idx_member_analyses_slack_user_id
        ON member_analyses(slack_user_id);
    `,
  },
];

export async function runMigrations(): Promise<void> {
  log.info(CTX, `Running ${MIGRATIONS.length} migrations...`);
  for (const m of MIGRATIONS) {
    try {
      await query(m.sql);
      log.info(CTX, `  ✓ ${m.name}`);
    } catch (err) {
      const error = err as Error;
      log.error(CTX, `  ✗ ${m.name}: ${error.message}`);
      throw err;
    }
  }
  log.info(CTX, "Migrations complete");
}
