import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { Target } from "./targets";

interface OctokitErrorResponse {
  message: string;
  documentation_url?: string;
  errors?: Array<{
    resource: string;
    code: string;
    field: string;
    message: string;
  }>;
}

interface OctokitError extends Error {
  response?: {
    status: number;
    data: OctokitErrorResponse;
  };
}

export async function createPullRequest({
  target,
  branchName,
  defaultBranch,
  instruction,
}: {
  target: Target;
  branchName: string;
  defaultBranch: string;
  instruction: string;
}) {
  // Check for GitHub App credentials
  const appId = process.env.APP_ID;
  const privateKey = process.env.APP_PRIVATE_KEY;

  if (!appId || !privateKey) {
    throw new Error("GitHub App credentials (APP_ID, APP_PRIVATE_KEY) are not set");
  }

  // Create Octokit instance with GitHub App authentication
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId: process.env.APP_INSTALLATION_ID,
    },
  });

  // Log which installation we're using
  console.log(`Using installation ID: ${process.env.APP_INSTALLATION_ID} for ${target.owner}/${target.repo}`);

  console.log(`Attempting to create PR for owner: ${target.owner}, repo: ${target.repo}`);
  console.log(`Branch: ${branchName}, Base: ${defaultBranch}`);

  const configFileName = target.filePath.split("/").pop();

  try {
    const response = await octokit.pulls.create({
      owner: target.owner,
      repo: target.repo,
      title: `chore: update \`${configFileName}\``,
      head: branchName,
      base: defaultBranch,
      body: `Via @${process.env.ACTOR}:

> ${instruction}`,
    });

    console.log(`Pull request created: ${response.data.html_url}`);
    return response.data.html_url;
  } catch (error) {
    const octokitError = error as OctokitError;
    if (octokitError.response?.status === 403) {
      console.error(`
Error: Failed to create pull request. This may be an installation scope issue.
- Repository: ${target.owner}/${target.repo}
- Branch: ${branchName}
- Error: ${octokitError.response.data.message}

The app can push code but not create PRs, suggesting it might be using different installation tokens.
Try reinstalling the app directly on the repository: https://github.com/apps/ubiquity-os/installations/new

Branch '${branchName}' has been pushed. You may need to create the pull request manually for now.
`);
    } else {
      console.error("Error creating pull request:", error instanceof Error ? error.message : String(error));
      console.error("Request details:", {
        owner: target.owner,
        repo: target.repo,
        head: branchName,
        base: defaultBranch,
      });
      if (octokitError.response) {
        console.error("Response status:", octokitError.response.status);
        console.error("Response data:", octokitError.response.data);
      }
    }
    throw error; // Re-throw to ensure proper error handling upstream
  }
}
