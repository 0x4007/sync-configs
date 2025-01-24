import * as fs from "fs";
import path from "path";
import simpleGit, { SimpleGit } from "simple-git";
import { createPullRequest } from "./create-pull-request";
import { getDefaultBranch } from "./get-default-branch";
import { STORAGE_DIR } from "./sync-configs";
import { Target } from "./targets";

export async function applyChanges({
  target,
  filePath,
  modifiedContent,
  instruction,
  isInteractive,
  forceBranch,
}: {
  target: Target;
  filePath: string;
  modifiedContent: string;
  instruction: string;
  isInteractive: boolean;
  forceBranch?: string;
}) {
  const git: SimpleGit = simpleGit({
    baseDir: path.join(__dirname, STORAGE_DIR, target.localDir),
    binary: "git",
    maxConcurrentProcesses: 6,
    trimmed: false,
    config: ["user.name=UbiquityOS Configurations Agent[bot]", "user.email=ubiquity-os[bot]@users.noreply.github.com"],
  });

  git.outputHandler((command, stdout, stderr) => {
    stdout.pipe(process.stdout);
    stderr.pipe(process.stderr);
  });

  const isGitHubActions = !!process.env.GITHUB_ACTIONS;
  console.log(`Operating in ${isGitHubActions ? "GitHub Actions" : "local"} environment`);
  if (isGitHubActions) {
    console.log(`Using PERSONAL_ACCESS_TOKEN`);
  }

  const defaultBranch = forceBranch || (await getDefaultBranch(target.url));

  // Set up authenticated remote URL if we have a token
  // if (process.env.GITHUB_TOKEN) {
  const authenticatedUrl = target.url.replace("https://", `https://x-access-token:${process.env.PERSONAL_ACCESS_TOKEN}@`);
  await git.removeRemote("origin").catch(() => null); // Ignore error if remote doesn't exist
  await git.addRemote("origin", authenticatedUrl);
  console.log("Configured authenticated remote URL");
  // }

  await git.checkout(defaultBranch);
  await git.pull("origin", defaultBranch);

  fs.writeFileSync(filePath, modifiedContent, "utf8");

  await git.add(target.filePath);

  let commitMessage: string;
  if (isGitHubActions) {
    commitMessage = ["chore: update", instruction, `Requested by @${process.env.GITHUB_ACTOR}`].join("\n\n");
  } else {
    commitMessage = ["chore: update configuration using UbiquityOS Configurations Agent", instruction].join("\n\n");
  }

  await git.commit(commitMessage);

  try {
    const branchName = `sync-configs-${Date.now()}`;

    if (isGitHubActions) {
      await pushToGitHubActions(git, target, branchName, isInteractive);
    } else {
      await pushToLocalDevelopment(git, target, branchName, defaultBranch, isInteractive);
    }

    if (!isInteractive) {
      await createAndLogPullRequest(target, branchName, defaultBranch, instruction);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error applying changes to ${target.url}:`, error.message);
      if (error.stack) {
        console.error("Stack trace:", error.stack);
      }
    } else {
      console.error(`Error applying changes to ${target.url}:`, error);
    }
    throw error; // Re-throw to ensure the error is properly handled upstream
  }
}

async function pushToGitHubActions(git: SimpleGit, target: Target, branchName: string, isInteractive: boolean) {
  if (!process.env.PERSONAL_ACCESS_TOKEN) {
    throw new Error("PERSONAL_ACCESS_TOKEN is not set");
  }

  console.log(`Attempting to push to ${target.url}...`);

  if (!isInteractive) {
    try {
      await git.checkoutLocalBranch(branchName);
      await git.push("origin", branchName, ["-u"]);
      console.log(`Successfully pushed branch ${branchName} to ${target.url}`);
    } catch (error) {
      console.error("Push failed with error:", error);
      console.error(`Note: Ensure @${process.env.GITHUB_ACTOR} has write access to ${target.url}`);
      throw error;
    }
  }
}

async function pushToLocalDevelopment(git: SimpleGit, target: Target, branchName: string, defaultBranch: string, isInteractive: boolean) {
  if (isInteractive) {
    await git.push("origin", defaultBranch);
    console.log(`Changes pushed to ${target.url} in branch ${defaultBranch}`);
  } else {
    await git.checkoutLocalBranch(branchName);
    await git.push("origin", branchName, ["-u"]);
  }
}

async function createAndLogPullRequest(target: Target, branchName: string, defaultBranch: string, instruction: string) {
  console.log({ target, branchName, defaultBranch });
  console.log(`Creating PR for target URL: ${target.url}`);
  try {
    const prUrl = await createPullRequest({ target, branchName, defaultBranch, instruction });
    console.log(`Pull request created: ${prUrl}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to create pull request:", errorMessage);
    console.log(`Branch '${branchName}' has been pushed. You may need to create the pull request manually.`);
  }
}
