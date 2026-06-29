import dotenv from "dotenv";
dotenv.config();

const REQUIRED = [
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "SLACK_APP_TOKEN",
  "GEMINI_API_KEY",
  "DATABASE_URL",
] as const;

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(
    `[FATAL] Missing required environment variables:\n  ${missing.join("\n  ")}`,
  );
  console.error("See .env.example for reference.");
  process.exit(1);
}

export interface AppConfig {
  slack: {
    botToken: string;
    signingSecret: string;
    appToken: string;
    analysisChannelId: string | null;
  };
  gemini: {
    apiKey: string;
    model: string;
  };
  db: {
    url: string;
  };
  github: {
    token: string | null;
  };
  port: number;
  isDev: boolean;
}

const config: AppConfig = Object.freeze({
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN!,
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
    appToken: process.env.SLACK_APP_TOKEN!,
    analysisChannelId: process.env.SLACK_ANALYSIS_CHANNEL_ID || null,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY!,
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  },
  db: {
    url: process.env.DATABASE_URL!,
  },
  github: {
    token: process.env.GITHUB_TOKEN || null,
  },
  port: parseInt(process.env.PORT || "3000", 10),
  isDev: process.env.NODE_ENV === "dev",
});

export default config;
