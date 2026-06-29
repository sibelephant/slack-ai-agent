import config from "./config.js";
import log from "./logger.js";
import { testConnection, closePool } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";
import { slackApp } from "./slack/app.js";
import { registerEvents } from "./slack/events.js";
import { registerCommands } from "./slack/commands.js";
import { registerInteractions } from "./slack/interactions.js";
import { registerHome } from "./slack/home.js";
import { createServer, startServer } from "./server/express.js";

const CTX = "main";

async function main(): Promise<void> {
  log.info(CTX, "Starting Slack AI Agent...");
  log.info(CTX, `Environment: ${config.isDev ? "development" : "production"}`);

  // 1. Database
  log.info(CTX, "Connecting to database...");
  await testConnection();
  await runMigrations();

  // 2. Register all Slack handlers
  registerEvents();
  registerCommands();
  registerInteractions();
  registerHome();

  // 3. Start Slack app (Socket Mode)
  await slackApp.start();
  log.info(CTX, "Slack app started (Socket Mode)");

  // 4. Start Express server
  const expressApp = createServer();
  const server = await startServer(expressApp);

  // 5. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    log.info(CTX, `Received ${signal}, shutting down...`);
    server.close();
    await closePool();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  log.info(CTX, "✅ Slack AI Agent is ready!");
}

main().catch((err: Error) => {
  log.error(CTX, `Fatal startup error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
