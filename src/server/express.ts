import express from "express";
import type { Request, Response, NextFunction } from "express";
import type { Server } from "http";
import config from "../config.js";
import log from "../logger.js";
import { query } from "../db/pool.js";
import { runAnalysisPipeline } from "../slack/events.js";

const CTX = "server";

/**
 * Create and configure the Express app.
 */
export function createServer(): express.Application {
  const app = express();
  app.use(express.json());

  // ─── Health check ────────────────────────────────────────────
  app.get("/health", async (_req: Request, res: Response) => {
    let dbOk = false;
    try {
      await query("SELECT 1");
      dbOk = true;
    } catch { /* ignore */ }

    res.json({
      status: dbOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      db: dbOk ? "connected" : "disconnected",
    });
  });

  // ─── Dev-only test routes ────────────────────────────────────
  if (config.isDev) {
    app.post("/test/analyze-member", async (req: Request, res: Response) => {
      try {
        const { userId } = req.body as { userId?: string };
        if (!userId) {
          res.status(400).json({ error: "Missing userId in request body" });
          return;
        }
        const result = await runAnalysisPipeline(userId, {
          skipDedupe: true,
          forceReanalyze: true,
          skipWelcomeDM: true,
        });
        res.json({
          success: true,
          result: result
            ? {
                name: result.memberInfo.name,
                engagementScore: result.analysis.engagementScore,
                analysisId: result.analysisId,
              }
            : null,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const err = error as Error;
        log.error(CTX, `Test analysis error: ${err.message}`);
        res.status(500).json({ error: "Analysis failed", message: err.message });
      }
    });

    log.info(CTX, "Dev test routes enabled");
  }

  // ─── Error handler ───────────────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error(CTX, `Express error: ${err.message}`);
    res.status(500).json({ error: "Internal Server Error" });
  });

  return app;
}

/**
 * Start the Express server.
 */
export function startServer(app: express.Application): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(config.port, () => {
      log.info(CTX, `Express server listening on port ${config.port}`);
      resolve(server);
    });
  });
}
