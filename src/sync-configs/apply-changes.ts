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
  });

  git.outputHandler((command, stdout, stderr) => {
    stdout.pipe(process.stdout);
    stderr.pipe(process.stderr);
  });

  // Always use bot credentials in GitHub Actions
  if (process.env.GITHUB_ACTIONS) {
    const userName = process.env.GIT_AUTHOR_NAME || "UbiquityOS Configurations Agent[bot]";
    const userEmail = process.env.GIT_AUTHOR_EMAIL || "ubiquity-os[bot]@users.noreply.github.com";

    await git.addConfig("user.name", userName, false, "local");
    await git.addConfig("user.email", userEmail, false, "local");
    console.log("Using bot credentials for Git operations.");
  } else {
    // For local development, use global git config
    console.log("Using global Git config for operations.");
  }

  const isGitHubActions = !!process.env.GITHUB_ACTIONS;

  const defaultBranch = forceBranch || (await getDefaultBranch(target.url));

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
    const isGitHubActions = !!process.env.GITHUB_ACTIONS;

    if (isGitHubActions) {
      await pushToGitHubActions(git, target, branchName, isInteractive);
    } else {
      await pushToLocalDevelopment(git, target, branchName, defaultBranch, isInteractive);
    }

    if (!isInteractive) {
      await createAndLogPullRequest(target, branchName, defaultBranch, instruction);
    }
  } catch (error) {
    console.error(`Error applying changes to ${target.url}:`, error);
  }
}

async function pushToGitHubActions(git: SimpleGit, target: Target, branchName: string, isInteractive: boolean) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN is not set");
  }

  const repoUrlWithoutProtocol = target.url.replace(/^https?:\/\//, "");
  const authenticatedRemoteUrl = `https://x-access-token:${token}@${repoUrlWithoutProtocol}`;

  if (!isInteractive) {
    await git.checkoutLocalBranch(branchName);
    await git.push(authenticatedRemoteUrl, branchName, ["-u"]);
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
