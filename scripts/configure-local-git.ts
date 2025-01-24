import "dotenv/config";
import * as path from "path";
import simpleGit from "simple-git";

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable must be set`);
  }
  return value;
}

const ACTOR = getRequiredEnvVar("ACTOR");
const EMAIL = getRequiredEnvVar("EMAIL");

async function configureLocalGitCredentials(repoPath: string): Promise<void> {
  try {
    const git = simpleGit(repoPath);
    if (await git.checkIsRepo()) {
      await git.addConfig("credential.helper", "store", false, "local");
      await git.addConfig("user.name", ACTOR, false, "local");
      await git.addConfig("user.email", EMAIL, false, "local");
      console.log(`Successfully configured local git credentials for ${repoPath}`);
    }
  } catch (error) {
    console.error(`Error configuring git credentials for ${repoPath}:`, error);
  }
}

async function main() {
  const fixturesPath = path.join(__dirname, "..", "src", "fixtures");
  const repos = [path.join(fixturesPath, "ubiquity"), path.join(fixturesPath, "ubiquity-os", "ubiquity-os-kernel")];

  // Only configure repositories under src/fixtures
  for (const repoPath of repos) {
    await configureLocalGitCredentials(repoPath);
  }
}

main().catch(console.error);
