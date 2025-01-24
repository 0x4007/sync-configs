import * as fs from "fs";
import * as path from "path";
import simpleGit, { SimpleGit } from "simple-git";
import { STORAGE_DIR } from "./sync-configs";
import { Target } from "./targets";

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

export async function cloneOrPullRepo(target: Target, defaultBranch: string): Promise<void> {
  const repoPath = path.join(__dirname, STORAGE_DIR, target.localDir);
  const token = process.env.AUTH_TOKEN;

  if (!token && process.env.GITHUB_ACTIONS) {
    throw new Error("AUTH_TOKEN is not set");
  }

  // Prepare authenticated URL if we have a token
  const authenticatedUrl = token ? target.url.replace("https://github.com", `https://ubiquity-os[bot]:${token}@github.com`) : target.url;

  if (fs.existsSync(repoPath)) {
    // Clean up any stale locks before git operations
    cleanupGitLocks(repoPath);
    // The repository directory exists; initialize git with this directory
    const git: SimpleGit = simpleGit(repoPath);

    if (await git.checkIsRepo()) {
      try {
        // Configure git locally with bot identity
        await git.addConfig("user.name", "ubiquity-os[bot]", false, "local");
        await git.addConfig("user.email", "ubiquity-os[bot]@users.noreply.github.com", false, "local");

        console.log(`Fetching updates for ${target.url}...`);
        await git.fetch("origin");
        await git.reset(["--hard", `origin/${defaultBranch}`]);
        console.log(`Successfully updated ${target.url}`);
      } catch (error) {
        console.error(`Error updating ${target.url}:`, error);
        throw error;
      }
    } else {
      console.error(`Directory ${repoPath} exists but is not a git repository.`);
    }
  } else {
    // The directory does not exist; create it and perform git clone
    try {
      console.log(`Cloning ${target.url}...`);
      fs.mkdirSync(repoPath, { recursive: true });
      cleanupGitLocks(repoPath);
      const git: SimpleGit = simpleGit();
      await git.clone(authenticatedUrl, repoPath);

      // After clone, configure the repository with bot identity
      const localGit = git.cwd(repoPath);
      await localGit.addConfig("user.name", "ubiquity-os[bot]", false, "local");
      await localGit.addConfig("user.email", "ubiquity-os[bot]@users.noreply.github.com", false, "local");

      console.log(`Successfully cloned ${target.url}`);
    } catch (error) {
      console.error(`Error cloning ${target.url}:`, error);
      throw error;
    }
  }
}
