import { execSync } from "child_process";
import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import simpleGit from "simple-git";
import { generateGitHubAppToken } from "./dev-start/github-token";

// Load environment variables from .env file
config();

const requiredEnvVars = ["ANTHROPIC_API_KEY", "EDITOR_INSTRUCTION", "INTERACTIVE", "ACTOR", "EMAIL", "APP_ID", "APP_PRIVATE_KEY"];

// Check for required environment variables
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable must be set`);
  }
  return value;
}

// Clean up any stale git lock files
function cleanupGitLocks(repoPath: string) {
  const lockFiles = [path.join(repoPath, ".git", "index.lock"), path.join(repoPath, ".git", "HEAD.lock")];

  for (const lockFile of lockFiles) {
    if (fs.existsSync(lockFile)) {
      try {
        fs.unlinkSync(lockFile);
        console.log(`Removed stale lock file: ${lockFile}`);
      } catch (error) {
        console.warn(`Failed to remove lock file ${lockFile}:`, error);
      }
    }
  }
}

// Parse GitHub repository URL to get owner and repo
function parseGitHubUrl(url: string): { owner: string; repo: string } {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)(\.git)?$/);
  if (!match) {
    throw new Error(`Invalid GitHub URL: ${url}`);
  }
  return {
    owner: match[1],
    repo: match[2].replace(".git", ""),
  };
}

// Configure Git locally for the test repository
async function configureGit(owner: string, repo: string) {
  try {
    const token = await generateGitHubAppToken(owner, repo);
    const testRepoPath = path.join(__dirname, "..", "src", "fixtures");

    // Ensure the fixtures directory exists and clean up any stale locks
    fs.mkdirSync(testRepoPath, { recursive: true });
    cleanupGitLocks(testRepoPath);

    const git = simpleGit(testRepoPath);

    // Configure git locally
    const actor = getRequiredEnvVar("ACTOR");
    const email = getRequiredEnvVar("EMAIL");

    await git.addConfig("user.name", actor, false, "local");
    await git.addConfig("user.email", email, false, "local");
    await git.addConfig("credential.helper", "store", false, "local");

    // Store credentials in the local repository
    const credentialsPath = path.join(testRepoPath, ".git-credentials");
    fs.writeFileSync(credentialsPath, `https://${actor}:${token}@github.com\n`);

    // Set the credential file path locally
    await git.addConfig("credential.file", credentialsPath, false, "local");

    console.log("Git configuration completed successfully for test repository");
    return token;
  } catch (error) {
    console.error("Error configuring git:", error);
    process.exit(1);
  }
}

async function main() {
  // Default repository URL from the workflow
  const repoUrl = "https://github.com/ubiquity/.ubiquity-os.git";
  const { owner, repo } = parseGitHubUrl(repoUrl);

  try {
    // Configure git with repository-specific token
    await configureGit(owner, repo);

    // Run the start script with the repository URL
    console.log("Running start script...");
    execSync(`bun run start "${repoUrl}"`, {
      stdio: "inherit",
      env: {
        ...process.env,
        // Ensure these specific environment variables are set with proper validation
        ANTHROPIC_API_KEY: getRequiredEnvVar("ANTHROPIC_API_KEY"),
        EDITOR_INSTRUCTION: getRequiredEnvVar("EDITOR_INSTRUCTION"),
        INTERACTIVE: getRequiredEnvVar("INTERACTIVE"),
        ACTOR: getRequiredEnvVar("ACTOR"),
        EMAIL: getRequiredEnvVar("EMAIL"),
        APP_ID: getRequiredEnvVar("APP_ID"),
        APP_PRIVATE_KEY: getRequiredEnvVar("APP_PRIVATE_KEY"),
        USE_MOCK_CLAUDE_RESPONSE: "true", // Short circuit Claude response in tests
      },
    });

    console.log("Script completed successfully");
  } catch (error) {
    console.error("Error running script:", error);
    process.exit(1);
  }
}

main().catch(console.error);
