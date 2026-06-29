import config from "./config.js";

function ts(): string {
  return new Date().toISOString();
}

export interface Logger {
  info(ctx: string, msg: string, ...args: unknown[]): void;
  warn(ctx: string, msg: string, ...args: unknown[]): void;
  error(ctx: string, msg: string, ...args: unknown[]): void;
  debug(ctx: string, msg: string, ...args: unknown[]): void;
}

const log: Logger = {
  info(ctx: string, msg: string, ...args: unknown[]) {
    console.log(`[INFO  ${ts()}] [${ctx}] ${msg}`, ...args);
  },
  warn(ctx: string, msg: string, ...args: unknown[]) {
    console.warn(`[WARN  ${ts()}] [${ctx}] ${msg}`, ...args);
  },
  error(ctx: string, msg: string, ...args: unknown[]) {
    console.error(`[ERROR ${ts()}] [${ctx}] ${msg}`, ...args);
  },
  debug(ctx: string, msg: string, ...args: unknown[]) {
    if (config.isDev) {
      console.log(`[DEBUG ${ts()}] [${ctx}] ${msg}`, ...args);
    }
  },
};

export default log;
