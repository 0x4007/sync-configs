import simpleGit, { SimpleGit } from "simple-git";

export async function getDefaultBranch(repoUrl: string): Promise<string> {
  const token = process.env.AUTH_TOKEN;
  const authenticatedUrl = token ? repoUrl.replace("https://", `https://x-access-token:${token}@`) : repoUrl;

  try {
    const git: SimpleGit = simpleGit();
    const remoteInfo = await git.listRemote(["--symref", authenticatedUrl, "HEAD"]);
    const match = remoteInfo.match(/ref: refs\/heads\/(\S+)\s+HEAD/);
    return match ? match[1] : "main";
  } catch (error) {
    console.error(`Error getting default branch for ${repoUrl}:`, error);
    return "main";
  }
}
