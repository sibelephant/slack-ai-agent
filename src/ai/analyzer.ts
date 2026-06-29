import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import config from "../config.js";
import log from "../logger.js";
import type { MemberInfo, MemberAnalysis, ResearchResult } from "../types.js";

const CTX = "ai/analyzer";

const llm = new ChatGoogleGenerativeAI({
  model: config.gemini.model,
  apiKey: config.gemini.apiKey,
  temperature: 0.3,
  maxOutputTokens: 2048,
});

const ANALYSIS_SYSTEM_PROMPT = `You are an AI assistant that analyzes new Slack workspace members to help community managers understand who they are and how to engage them.

Given the member's profile information and any research data, produce a JSON object with this exact structure:

{
  "summary": "2-3 sentence professional summary of who this person is",
  "expertise": ["area1", "area2", "area3"],
  "potentialContributions": ["contribution1", "contribution2"],
  "conversationStarters": ["starter1", "starter2", "starter3"],
  "engagementScore": <1-10 integer>,
  "suggestedChannels": ["#channel1", "#channel2"],
  "riskFlags": []
}

Rules:
- Be constructive and professional.
- The engagementScore reflects how likely this person is to be a valuable, active community member (10 = very likely).
- suggestedChannels should be general category names prefixed with # (e.g. #engineering, #design, #product).
- riskFlags: only include if there's a genuine concern (e.g. competitor, spam patterns). Usually empty.
- If information is sparse, make reasonable inferences from what's available but keep the summary honest about limited data.
- Return ONLY valid JSON, no markdown fences, no extra text.`;

const WELCOME_SYSTEM_PROMPT = `You are a friendly community welcome bot. Write a warm, personalized welcome message for a new Slack workspace member.

Rules:
- Keep it under 200 words.
- Reference specific details from their profile (name, title, company) when available.
- Mention 1-2 suggested channels they might find interesting.
- Include a clear, low-pressure call to action (e.g. introduce yourself in #introductions).
- Use a friendly, professional tone. Avoid being overly enthusiastic or using too many exclamation marks.
- Use Slack-compatible markdown (bold with *text*, italic with _text_, links with <#channel>).
- Return ONLY the message text, no JSON wrapping.`;

/**
 * Analyze a member using Gemini and return structured analysis.
 */
export async function analyzeWithAI(
  memberInfo: MemberInfo,
  researchData: ResearchResult[] = [],
): Promise<MemberAnalysis> {
  log.info(CTX, `Analyzing member: ${memberInfo.name || memberInfo.username}`);

  const userPrompt = buildAnalysisPrompt(memberInfo, researchData);

  try {
    const response = await llm.invoke([
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
      { role: "human", content: userPrompt },
    ]);

    const text = (response.content as string).trim();
    // Strip markdown code fences if the model wraps them anyway
    const cleaned = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
    const analysis = JSON.parse(cleaned) as MemberAnalysis;

    log.info(
      CTX,
      `Analysis complete — engagement score: ${analysis.engagementScore}/10`,
    );
    return analysis;
  } catch (error) {
    const err = error as Error;
    log.error(CTX, `Analysis failed: ${err.message}`);
    // Return a safe fallback so the pipeline doesn't break
    return {
      summary: `New member: ${memberInfo.name || memberInfo.username}. Analysis could not be completed.`,
      expertise: [],
      potentialContributions: [],
      conversationStarters: ["Welcome them and ask about their interests"],
      engagementScore: 5,
      suggestedChannels: ["#general", "#introductions"],
      riskFlags: [],
    };
  }
}

/**
 * Generate a personalized welcome DM message for a new member.
 */
export async function generateWelcomeMessage(
  memberInfo: MemberInfo,
  analysis: MemberAnalysis,
): Promise<string> {
  log.info(CTX, `Generating welcome message for: ${memberInfo.name}`);

  const prompt = `Member profile:
Name: ${memberInfo.name || "Unknown"}
Title: ${memberInfo.title || "Not specified"}
Username: @${memberInfo.username}

AI Analysis Summary: ${analysis.summary}
Suggested Channels: ${analysis.suggestedChannels?.join(", ") || "None"}
Expertise: ${analysis.expertise?.join(", ") || "Unknown"}

Write a welcome message for this person.`;

  try {
    const response = await llm.invoke([
      { role: "system", content: WELCOME_SYSTEM_PROMPT },
      { role: "human", content: prompt },
    ]);
    return (response.content as string).trim();
  } catch (error) {
    const err = error as Error;
    log.error(CTX, `Welcome message generation failed: ${err.message}`);
    return `Hey ${memberInfo.name || "there"}! 👋 Welcome to the workspace! Feel free to introduce yourself in #general and let us know what you're working on.`;
  }
}

// ─── Internal ────────────────────────────────────────────────────────

function buildAnalysisPrompt(
  memberInfo: MemberInfo,
  researchData: ResearchResult[],
): string {
  let prompt = `Analyze this new Slack workspace member:\n\n`;
  prompt += `Name: ${memberInfo.name || "Unknown"}\n`;
  prompt += `Username: ${memberInfo.username || "Unknown"}\n`;
  prompt += `Title: ${memberInfo.title || "Not specified"}\n`;
  prompt += `Email: ${memberInfo.email || "Not available"}\n`;
  prompt += `Timezone: ${memberInfo.timezone || "Unknown"}\n`;

  if (memberInfo.profile?.statusText) {
    prompt += `Status: ${memberInfo.profile.statusText}\n`;
  }

  if (researchData.length > 0) {
    prompt += `\nResearch findings:\n`;
    for (const r of researchData) {
      if (r.type === "company_info") {
        prompt += `\nCompany Website: ${r.data.url}\n`;
        prompt += `Company Title: ${r.data.title}\n`;
      }
      if (r.type === "github_info") {
        prompt += `\nGitHub: ${r.data.url}\n`;
        prompt += `Bio: ${r.data.bio || "None"}\n`;
        prompt += `Public Repos: ${r.data.publicRepos}\n`;
        prompt += `Followers: ${r.data.followers}\n`;
        if (r.data.company) prompt += `GitHub Company: ${r.data.company}\n`;
      }
    }
  }

  return prompt;
}
