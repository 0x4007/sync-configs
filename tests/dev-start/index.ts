import { execSync } from "child_process";
import { cleanupBranches } from "./branch-manager";
import { GITHUB_OWNER, GITHUB_REPO, GITHUB_REPO_URL, requiredEnvVars } from "./constants";
import { getRequiredEnvVar, validateEnvVars } from "./env-utils";
import { configureGit } from "./git-config";
import { generateGitHubAppToken } from "./github-token";

// Check for required environment variables
validateEnvVars(requiredEnvVars);

let globalInstallationId: number;

async function main() {
  // Use repository URL from constants
  const repoUrl = GITHUB_REPO_URL;

  try {
    // Configure git first and get the token
    const token = await configureGit();
    if (!process.env.INSTALLATION_ID) {
      throw new Error("INSTALLATION_ID not set after configuring git");
    }
    globalInstallationId = parseInt(process.env.INSTALLATION_ID);

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
        AUTH_TOKEN: token,
        INSTALLATION_ID: globalInstallationId.toString(),
        USE_MOCK_CLAUDE_RESPONSE: "true", // Short circuit Claude response in tests
      },
    });

    console.log("Script completed successfully");
  } catch (error) {
    console.error("Error running script:", error);
    process.exit(1);
  }
}

// Execute main function and handle cleanup
main().then(async () => {
  // Get a fresh token for cleanup
  const token = await generateGitHubAppToken(GITHUB_OWNER, GITHUB_REPO);
  process.env.AUTH_TOKEN = token;
  await cleanupBranches();
}).catch(console.error);

export { main };
