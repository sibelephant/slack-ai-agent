import pkg from "@slack/bolt";
const { App } = pkg;
import { WebClient } from "@slack/web-api";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "langchain/prompts";
import express from "express";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const log = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg, ...args) => console.log(`[ERROR] ${msg}`, ...args),
  debug: (msg, ...args) =>
    process.env.NODE_ENV === "dev" && console.log(`[DEBUG] ${msg}`, ...args),
};

class SlackAIAgent {
  constructor() {
    this.app = express();
    this.slack = new App({
      token: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      socketMode: true,
      appToken: process.env.SLACK_APP_TOKEN,
    });
    this.webClient = new webClient(process.env.SLACK_BOT_TOKEN);
    this.openai = new ChatOpenAI({
      model: "gpt-4",
      temperature: 0.3,
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.setupslackEvents();
    this.setupExpress();
  }
}
