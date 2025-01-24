import * as fs from "fs";
import * as path from "path";
import simpleGit, { SimpleGit } from "simple-git";
import { GITHUB_API_HEADERS, GITHUB_OWNER, GITHUB_REPO, GitHubBranch, SYNC_CONFIGS_PREFIX } from "./constants";

async function checkRepoAccess(token: string): Promise<void> {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`, {
    headers: {
      ...GITHUB_API_HEADERS,
      Authorization: `token ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`No access to repository: ${response.statusText}`);
  }
}

async function getRemoteBranches(): Promise<GitHubBranch[]> {
  const token = process.env.AUTH_TOKEN;
  if (!token) {
    throw new Error("AUTH_TOKEN not found in environment");
  }

  // Verify we have access to the repository
  await checkRepoAccess(token);

  const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/branches?per_page=100`, {
    headers: {
      ...GITHUB_API_HEADERS,
      Authorization: `token ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch branches: ${response.statusText}`);
  }

  return response.json();
}

async function deleteRemoteBranch(branch: string): Promise<void> {
  try {
    console.log(`Attempting to delete remote branch: ${branch}`);

    const token = process.env.AUTH_TOKEN;
    if (!token) {
      throw new Error("AUTH_TOKEN not found in environment");
    }

    const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/${branch}`, {
      method: "DELETE",
      headers: {
        ...GITHUB_API_HEADERS,
        Authorization: `token ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`GitHub API error: ${errorData.message}`);
    }

    console.log(`Successfully deleted remote branch: ${branch}`);
  } catch (error) {
    console.error(`Failed to delete remote branch ${branch}:`, error);
    throw error;
  }
}

async function deleteLocalBranch(branch: string, git: SimpleGit): Promise<void> {
  try {
    console.log(`Deleting local branch: ${branch}`);
    await git.deleteLocalBranch(branch, true);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.warn(`Warning: Could not delete local branch ${branch}:`, error.message);
    } else {
      console.warn(`Warning: Could not delete local branch ${branch}:`, error);
    }
  }
}

async function cleanupLocalBranches(branches: string[], git: SimpleGit): Promise<void> {
  // Switch to development branch first
  console.log("Switching to development branch...");
  await git.checkout("development");

  // Delete local branches
  for (const branch of branches) {
    await deleteLocalBranch(branch, git);
  }
}

async function cleanupRemoteBranches(branches: string[]): Promise<void> {
  if (branches.length === 0) return;

  console.log(`Found ${branches.length} remote branches to delete`);
  console.log(`Deleting remote branches: ${branches.join(", ")}`);

  for (const branch of branches) {
    try {
      await deleteRemoteBranch(branch);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(`Error deleting remote branch ${branch}:`, error.message);
      } else {
        console.error(`Error deleting remote branch ${branch}:`, error);
      }
    }
  }
}

export async function cleanupBranches(): Promise<void> {
  const testRepoPath = path.join(__dirname, "..", "src", "fixtures", "ubiquity", ".ubiquity-os");

  // Check if repository exists before proceeding
  if (!fs.existsSync(path.join(testRepoPath, ".git"))) {
    console.log("Test repository not found, skipping branch cleanup");
    return;
  }

  const git = simpleGit(testRepoPath);
  try {
    // Get all branches using GitHub API
    const branches = await getRemoteBranches();
    console.log(
      "Found branches via API:",
      branches.map((b: GitHubBranch) => b.name)
    );

    // Get default branch name
    const defaultBranch = "development";

    // Filter for sync-configs branches that aren't protected or default
    const remoteBranchesToDelete = branches
      .filter((b) => !b.protected && b.name !== defaultBranch && b.name.startsWith(SYNC_CONFIGS_PREFIX))
      .map((b) => b.name);

    const skippedBranches = branches.filter((b) => (b.protected || b.name === defaultBranch) && b.name.startsWith(SYNC_CONFIGS_PREFIX)).map((b) => b.name);

    if (skippedBranches.length > 0) {
      console.warn(`Skipping protected/default branches: ${skippedBranches.join(", ")}`);
    }

    // Get local branches to delete
    const branchList = await git.branch(["-a"]);
    const localBranchesToDelete = branchList.all.filter((branch) => branch.startsWith(SYNC_CONFIGS_PREFIX));

    // Clean up branches
    await cleanupLocalBranches(localBranchesToDelete, git);
    await cleanupRemoteBranches(remoteBranchesToDelete);

    console.log("Branch cleanup completed successfully");
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Error during branch cleanup:", error.message);
    } else {
      console.error("Error during branch cleanup:", error);
    }
    throw error;
  }
}
