import { Octokit } from "@octokit/rest";
import { Repo } from "./sync-configs";

export async function createPullRequest(repo: Repo, branchName: string, defaultBranch: string, instruction: string) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const [owner, repoName] = repo.url.split("/").slice(-2);

  try {
    const { data: pullRequest } = await octokit.pulls.create({
      owner,
      repo: repoName,
      title: `Sync configs: ${instruction}`,
      head: branchName,
      base: defaultBranch,
      body: `This pull request was automatically created by the sync-configs tool.\n\nInstruction: ${instruction}`,
    });

    console.log(`Pull request created: ${pullRequest.html_url}`);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Failed to create pull request: ${error.message}`);
    } else {
      console.error("Failed to create pull request: Unknown error");
    }
  }
}
