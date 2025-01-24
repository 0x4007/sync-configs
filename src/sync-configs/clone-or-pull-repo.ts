import * as fs from "fs";
import * as path from "path";
import simpleGit, { SimpleGit } from "simple-git";
import { STORAGE_DIR } from "./sync-configs";
import { Target } from "./targets";

export async function cloneOrPullRepo(target: Target, defaultBranch: string): Promise<void> {
  const repoPath = path.join(__dirname, STORAGE_DIR, target.localDir);
  const token = process.env.AUTH_TOKEN;

  if (!token && process.env.GITHUB_ACTIONS) {
    throw new Error("AUTH_TOKEN is not set");
  }

  // Prepare authenticated URL if we have a token
  const authenticatedUrl = token ? target.url.replace("https://github.com", `https://x-access-token:${token}@github.com`) : target.url;

  if (fs.existsSync(repoPath)) {
    // The repository directory exists; initialize git with this directory
    const git: SimpleGit = simpleGit(repoPath);

    if (await git.checkIsRepo()) {
      try {
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
      const git: SimpleGit = simpleGit();
      await git.clone(authenticatedUrl, repoPath);
      // After clone, fetch to ensure we have all refs
      await git.cwd(repoPath).fetch("origin");
      await git.reset(["--hard", `origin/${defaultBranch}`]);
      console.log(`Successfully cloned ${target.url}`);
    } catch (error) {
      console.error(`Error cloning ${target.url}:`, error);
      throw error;
    }
  }
}
