import { execSync } from "child_process";
import { config } from "dotenv";
import * as fs from "fs";
import * as jwt from "jsonwebtoken";
import * as path from "path";
import simpleGit from "simple-git";

// Load environment variables from .env file
config();

const requiredEnvVars = ["ANTHROPIC_API_KEY", "EDITOR_INSTRUCTION", "INTERACTIVE", "ACTOR", "EMAIL", "APP_ID", "APP_PRIVATE_KEY"];

// Function to generate GitHub App JWT token
async function generateGitHubAppToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // Issued 60 seconds ago
    exp: now + 10 * 60, // Expires in 10 minutes
    iss: getRequiredEnvVar("APP_ID"),
  };

  try {
    const privateKey = getRequiredEnvVar("APP_PRIVATE_KEY");
    const token = jwt.sign(payload, privateKey, {
      algorithm: "RS256",
    });

    // Exchange JWT for installation token
    const response = await fetch("https://api.github.com/app/installations", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get installations: ${response.statusText}`);
    }

    const installations = await response.json();
    if (!installations.length) {
      throw new Error("No installations found for this GitHub App");
    }

    const installationId = installations[0].id;
    const accessResponse = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!accessResponse.ok) {
      throw new Error(`Failed to get access token: ${accessResponse.statusText}`);
    }

    const { token: installationToken } = await accessResponse.json();
    return installationToken;
  } catch (error) {
    console.error("Error generating GitHub App token:", error);
    throw error;
  }
}

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

// Configure Git locally for the test repository
async function configureGit() {
  try {
    const token = await generateGitHubAppToken();
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

  try {
    // Configure git first and get the token
    const token = await configureGit();

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
        AUTH_TOKEN: token, // Use the GitHub App token instead of AUTH_TOKEN
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
