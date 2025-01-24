import * as fs from "fs";
import * as path from "path";
import simpleGit from "simple-git";
import { generateGitHubAppToken } from "./github-token";

// Clean up any stale git lock files
export function cleanupGitLocks(repoPath: string): void {
  const lockFiles = [
    path.join(repoPath, ".git", "index.lock"),
    path.join(repoPath, ".git", "HEAD.lock"),
    path.join(repoPath, ".git", "config.lock")
  ];

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
export async function configureGit(): Promise<string> {
  try {
    const fixturesPath = path.join(__dirname, "..", "..", "src", "fixtures");
    fs.mkdirSync(fixturesPath, { recursive: true });

    // Get list of target repositories
    const { targets } = await import("../../src/sync-configs/targets");

    // Generate GitHub token using first target's credentials
    const token = await generateGitHubAppToken(targets[0].owner, targets[0].repo);

    // Configure each repository directory
    for (const target of targets) {
      const repoPath = path.join(fixturesPath, target.localDir);
      fs.mkdirSync(repoPath, { recursive: true });
      cleanupGitLocks(repoPath);

      const git = simpleGit(repoPath);

      // Configure git locally with bot identity
      await git.addConfig("user.name", "ubiquity-os[bot]", false, "local");
      await git.addConfig("user.email", "ubiquity-os[bot]@users.noreply.github.com", false, "local");
      await git.addConfig("credential.helper", "store", false, "local");

      // Store credentials in the repository
      const credentialsPath = path.join(repoPath, ".git-credentials");
      fs.writeFileSync(credentialsPath, `https://ubiquity-os[bot]:${token}@github.com\n`);

      // Set the credential file path locally
      await git.addConfig("credential.file", credentialsPath, false, "local");
    }

    console.log("Git configuration completed successfully for test repository");
    return token;
  } catch (error) {
    console.error("Error configuring git:", error);
    process.exit(1);
  }
}
