import { config } from "dotenv";

// Load environment variables from .env file
config();

export const requiredEnvVars = [
  "ANTHROPIC_API_KEY",
  "EDITOR_INSTRUCTION",
  "INTERACTIVE",
  "ACTOR",
  "EMAIL",
  "APP_ID",
  "APP_PRIVATE_KEY"
];

// GitHub repository constants
export const GITHUB_OWNER = 'ubiquity';
export const GITHUB_REPO = '.ubiquity-os';
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git`;
export const SYNC_CONFIGS_PREFIX = 'sync-configs-';

// GitHub API constants
export const GITHUB_API_HEADERS = {
  'Accept': 'application/vnd.github.v3+json',
  'X-GitHub-Api-Version': '2022-11-28'
};

export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

export interface Installation {
  id: number;
  account?: {
    login?: string;
    type?: string;
  };
  target_type?: string;
}
