// ─── Member & Profile Types ──────────────────────────────────────────

export interface MemberProfile {
  firstName: string | null;
  lastName: string | null;
  statusText: string | null;
  image: string | null;
}

export interface MemberInfo {
  id: string;
  username: string;
  name: string;
  title: string | null;
  email: string | null;
  timezone: string | null;
  isBot: boolean;
  profile: MemberProfile;
}

// ─── AI Analysis Types ───────────────────────────────────────────────

export interface MemberAnalysis {
  summary: string;
  expertise: string[];
  potentialContributions: string[];
  conversationStarters: string[];
  engagementScore: number;
  suggestedChannels: string[];
  riskFlags: string[];
}

// ─── Research Types ──────────────────────────────────────────────────

export interface CompanyInfo {
  url: string;
  title: string;
  type: string;
}

export interface GitHubInfo {
  username: string;
  url: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  publicRepos: number;
  followers: number;
  type: string;
}

export interface CompanyResearchResult {
  type: "company_info";
  data: CompanyInfo;
}

export interface GitHubResearchResult {
  type: "github_info";
  data: GitHubInfo;
}

export type ResearchResult = CompanyResearchResult | GitHubResearchResult;

// ─── Pipeline Types ──────────────────────────────────────────────────

export interface PipelineOptions {
  skipDedupe?: boolean;
  forceReanalyze?: boolean;
  skipWelcomeDM?: boolean;
}

export interface PipelineResult {
  memberInfo: MemberInfo;
  analysis: MemberAnalysis;
  researchData: ResearchResult[];
  analysisId: number;
}

// ─── Database Row Types ──────────────────────────────────────────────

export interface MemberAnalysisRow {
  id: number;
  slack_user_id: string;
  username: string | null;
  display_name: string | null;
  email: string | null;
  title: string | null;
  analysis: MemberAnalysis | string;
  research_data: ResearchResult[] | string | null;
  welcome_dm_sent: boolean;
  sent_to_slack: boolean;
  message_ts: string | null;
  channel_id: string | null;
  left_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnalysisStats {
  total: number;
  this_week: number;
  avg_engagement: string | null;
  welcomed: number;
  departed: number;
}
