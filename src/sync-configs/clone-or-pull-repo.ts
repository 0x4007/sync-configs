import * as fs from "fs";
import * as path from "path";
import simpleGit, { SimpleGit } from "simple-git";
import { STORAGE_DIR } from "./sync-configs";
import { Target } from "./targets";

async function configureGit(git: SimpleGit): Promise<void> {
  const token = process.env.AUTH_TOKEN;
  if (!token) {
    throw new Error("AUTH_TOKEN is not set");
  }

  await git.addConfig("http.https://github.com.extraheader", `AUTHORIZATION: bearer ${token}`, false, "global");
}

async function updateExistingRepo(git: SimpleGit, target: Target, defaultBranch: string): Promise<void> {
  console.log(`Fetching updates for ${target.url}...`);
  await configureGit(git);
  await git.fetch("origin");
  await git.checkout(defaultBranch);
  console.log(`Successfully updated ${target.url}`);
}

async function handleCloneError(error: unknown, git: SimpleGit, target: Target, defaultBranch: string): Promise<void> {
  if (error instanceof Error && error.message.includes("Clone succeeded, but checkout failed")) {
    console.log(`Clone succeeded for ${target.url}, preserving existing files`);
    await git.fetch("origin");
    // Try to checkout the branch without forcing
    try {
      await git.checkout(defaultBranch);
    } catch (checkoutError) {
      console.log(`Note: Keeping existing files in ${target.url}`);
    }
    return;
  }
  throw error;
}

async function cloneNewRepo(git: SimpleGit, repoPath: string, target: Target, defaultBranch: string): Promise<void> {
  try {
    await configureGit(git);
    await git.clone(target.url, repoPath);
    const repoGit = git.cwd(repoPath);
    await repoGit.fetch("origin");
    await repoGit.checkout(defaultBranch);
    console.log(`Successfully cloned ${target.url}`);
  } catch (error: unknown) {
    await handleCloneError(error, git.cwd(repoPath), target, defaultBranch);
  }
}

export async function cloneOrPullRepo(target: Target, defaultBranch: string): Promise<void> {
  const repoPath = path.join(__dirname, STORAGE_DIR, target.localDir);

  if (!process.env.AUTH_TOKEN && process.env.GITHUB_ACTIONS) {
    throw new Error("AUTH_TOKEN is not set");
  }

  if (fs.existsSync(repoPath)) {
    const git: SimpleGit = simpleGit(repoPath);
    if (await git.checkIsRepo()) {
      try {
        await updateExistingRepo(git, target, defaultBranch);
      } catch (error) {
        console.error(`Error updating ${target.url}:`, error);
        throw error;
      }
    } else {
      console.error(`Directory ${repoPath} exists but is not a git repository.`);
    }
    return;
  }

  try {
    console.log(`Cloning ${target.url}...`);
    fs.mkdirSync(repoPath, { recursive: true });
    await cloneNewRepo(simpleGit(), repoPath, target, defaultBranch);
  } catch (error) {
    console.error(`Error cloning ${target.url}:`, error);
    throw error;
  }
}
