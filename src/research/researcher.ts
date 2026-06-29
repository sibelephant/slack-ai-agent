import axios from "axios";
import config from "../config.js";
import log from "../logger.js";
import type {
  MemberInfo,
  CompanyInfo,
  GitHubInfo,
  ResearchResult,
} from "../types.js";

const CTX = "research";

const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "yahoo.com", "yahoo.co.uk", "yahoo.fr", "yahoo.de",
  "hotmail.com", "hotmail.co.uk",
  "outlook.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com",
  "protonmail.com", "proton.me",
  "zoho.com",
  "yandex.com", "yandex.ru",
  "mail.com", "email.com",
  "gmx.com", "gmx.net",
  "fastmail.com",
  "tutanota.com", "tuta.io",
  "hey.com",
  "pm.me",
]);

/**
 * Check if an email address is from a personal (non-company) domain.
 */
export function isPersonalEmail(email: string | null): boolean {
  if (!email) return true;
  const domain = email.split("@")[1]?.toLowerCase();
  return !domain || PERSONAL_DOMAINS.has(domain);
}

/**
 * Fetch basic company info by scraping the website title.
 */
export async function getCompanyInfo(domain: string): Promise<CompanyInfo | null> {
  try {
    const response = await axios.get(`https://www.${domain}`, {
      timeout: 5000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SlackAIAgent/1.0; +https://github.com)",
      },
      maxRedirects: 3,
    });
    const titleMatch = (response.data as string).match(/<title>(.*?)<\/title>/i);
    const title = titleMatch
      ? titleMatch[1].trim()
      : `${domain} — Company info not available`;
    return {
      url: `https://www.${domain}`,
      title,
      type: "company",
    };
  } catch (error) {
    const err = error as Error;
    log.debug(CTX, `Company info fetch failed for ${domain}: ${err.message}`);
    return null;
  }
}

interface GitHubSearchResponse {
  items: Array<{ url: string }>;
}

interface GitHubUserResponse {
  login: string;
  html_url: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  public_repos: number;
  followers: number;
}

/**
 * Search the GitHub Users API for a person's name and return their
 * public profile data (bio, repos, followers, URL).
 */
export async function getGitHubInfo(name: string): Promise<GitHubInfo | null> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "SlackAIAgent/1.0",
    };
    if (config.github.token) {
      headers.Authorization = `Bearer ${config.github.token}`;
    }

    const searchRes = await axios.get<GitHubSearchResponse>(
      "https://api.github.com/search/users",
      {
        params: { q: name, per_page: 1 },
        headers,
        timeout: 5000,
      },
    );

    if (!searchRes.data.items?.length) {
      log.debug(CTX, `No GitHub user found for "${name}"`);
      return null;
    }

    const userUrl = searchRes.data.items[0].url;
    const userRes = await axios.get<GitHubUserResponse>(userUrl, {
      headers,
      timeout: 5000,
    });
    const u = userRes.data;

    return {
      username: u.login,
      url: u.html_url,
      bio: u.bio || null,
      company: u.company || null,
      location: u.location || null,
      publicRepos: u.public_repos,
      followers: u.followers,
      type: "github",
    };
  } catch (error) {
    const err = error as Error;
    log.debug(CTX, `GitHub info fetch failed for "${name}": ${err.message}`);
    return null;
  }
}

/**
 * Run all research methods in parallel for a given member.
 * Returns an array of research result objects.
 */
export async function doBasicResearch(
  memberInfo: MemberInfo,
): Promise<ResearchResult[]> {
  log.info(CTX, `Researching: ${memberInfo.name || memberInfo.username}`);
  const tasks: Promise<ResearchResult | null>[] = [];

  // Company research — only if they have a work email
  if (memberInfo.email && !isPersonalEmail(memberInfo.email)) {
    const domain = memberInfo.email.split("@")[1];
    tasks.push(
      getCompanyInfo(domain).then((data) =>
        data ? { type: "company_info" as const, data } : null,
      ),
    );
  }

  // GitHub research — if we have a name to search
  const searchName = memberInfo.name || memberInfo.username;
  if (searchName) {
    tasks.push(
      getGitHubInfo(searchName).then((data) =>
        data ? { type: "github_info" as const, data } : null,
      ),
    );
  }

  const results = await Promise.allSettled(tasks);
  return results
    .filter(
      (r): r is PromiseFulfilledResult<ResearchResult> =>
        r.status === "fulfilled" && r.value !== null,
    )
    .map((r) => r.value);
}
