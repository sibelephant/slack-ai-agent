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
