import * as fs from "fs";
import path from "path";
import simpleGit, { SimpleGit } from "simple-git";
import { createPullRequest } from "./create-pull-request";
import { getDefaultBranch } from "./get-default-branch";
import { STORAGE_DIR } from "./sync-configs";
import { Target } from "./targets";

function initializeGit(localDir: string): SimpleGit {
  const git = simpleGit({
    baseDir: path.join(__dirname, STORAGE_DIR, localDir),
    binary: "git",
    maxConcurrentProcesses: 6,
    trimmed: false,
    config: ["user.name=UbiquityOS Configurations Agent[bot]", "user.email=ubiquity-os[bot]@users.noreply.github.com"],
  });

  git.outputHandler((command, stdout, stderr) => {
    stdout.pipe(process.stdout);
    stderr.pipe(process.stderr);
  });

  return git;
}

async function setupAuthentication(git: SimpleGit, targetUrl: string) {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is not set");
  }
  const authenticatedUrl = targetUrl.replace("https://github.com", `https://${process.env.GITHUB_ACTOR}:${process.env.GITHUB_TOKEN}@github.com`);
  await git.removeRemote("origin").catch(() => null);
  await git.addRemote("origin", authenticatedUrl);
  console.log("Configured authenticated remote URL");
}

function createCommitMessage(instruction: string, isGitHubActions: boolean): string {
  if (isGitHubActions) {
    return ["chore: update", instruction, `Requested by @${process.env.GITHUB_ACTOR}`].join("\n\n");
  }
  return ["chore: update configuration using UbiquityOS Configurations Agent", instruction].join("\n\n");
}

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
  const git = initializeGit(target.localDir);
  const isGitHubActions = !!process.env.GITHUB_ACTIONS;

  console.log(`Operating in ${isGitHubActions ? "GitHub Actions" : "local"} environment`);
  if (isGitHubActions) {
    console.log(`Using workflow token`);
  }

  await setupAuthentication(git, target.url);
  const defaultBranch = forceBranch || (await getDefaultBranch(target.url));

  await git.checkout(defaultBranch);
  await git.pull("origin", defaultBranch);

  fs.writeFileSync(filePath, modifiedContent, "utf8");
  await git.add(target.filePath);
  await git.commit(createCommitMessage(instruction, isGitHubActions));

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
    throw error;
  }
}

async function pushToGitHubActions(git: SimpleGit, target: Target, branchName: string, isInteractive: boolean) {
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
