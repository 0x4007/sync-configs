import { cleanupBranches } from "./dev-start/branch-manager";
import { GITHUB_OWNER, GITHUB_REPO } from "./dev-start/constants";
import { devStart } from "./dev-start/index";
import { generateGitHubAppToken } from "./dev-start/github-token";

devStart()
  .then(async () => {
    // Get a fresh token for cleanup
    const token = await generateGitHubAppToken(GITHUB_OWNER, GITHUB_REPO);
    process.env.AUTH_TOKEN = token;
    await cleanupBranches();
  })
  .catch(console.error);
