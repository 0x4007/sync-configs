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
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN is not set");
  }

  const octokit = new Octokit({ auth: token });

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
      body: `Via @${process.env.GITHUB_ACTOR}:

> ${instruction}`,
    });

    console.log(`Pull request created: ${response.data.html_url}`);
    return response.data.html_url;
  } catch (error) {
    console.error("Error creating pull request:", error instanceof Error ? error.message : String(error));
    console.error("Request details:", {
      owner: target.owner,
      repo: target.repo,
      head: branchName,
      base: defaultBranch,
    });

    const octokitError = error as OctokitError;
    if (octokitError.response) {
      console.error("Response status:", octokitError.response.status);
      console.error("Response data:", octokitError.response.data);
    }
    throw error; // Re-throw to ensure proper error handling upstream
  }
}
