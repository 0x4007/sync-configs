import * as path from "path";

export const CONFIG_FULL_PATH = ".github/.ubiquity-os.config.yml";
const DEV_CONFIG_FULL_PATH = ".github/.ubiquity-os.config.dev.yml";

const parserTarget = {
  type: "parser",
  url: "https://github.com/ubiquity-os/ubiquity-os-kernel.git",
};

let targetUrls;
const argv = process.argv.slice(2);
if (argv.length > 0) {
  // User has provided URLs via CLI arguments
  targetUrls = argv.map((url) => ({ type: "config", url }));
} else {
  // Use default configs
  targetUrls = [
    { type: "config", url: "https://github.com/ubiquity/.ubiquity-os.git" },
    { type: "config", url: "https://github.com/ubiquity-os/.ubiquity-os.git" },
    { type: "config", url: "https://github.com/ubiquity-os-marketplace/.ubiquity-os.git" },
  ];
}

// Always include the parser target
targetUrls.unshift(parserTarget);

export const targets: Target[] = targetUrls.flatMap(({ type, url }) => {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)(\.git)?$/);
  if (!match) {
    throw new Error(`Invalid GitHub URL: ${url}`);
  }

  const owner = match[1];
  const repo = match[2].replace(".git", "");
  const isKernel = type === "parser";
  const localDir = path.join(owner, repo);

  if (isKernel) {
    return [
      {
        type,
        owner,
        repo,
        localDir,
        url,
        filePath: "src/github/types/plugin-configuration.ts",
      },
    ];
  }

  // Always return both prod and dev configs
  return [
    {
      type,
      owner,
      repo,
      localDir,
      url,
      filePath: CONFIG_FULL_PATH,
    },
    {
      type,
      owner,
      repo,
      localDir,
      url,
      filePath: DEV_CONFIG_FULL_PATH,
    },
  ];
});

export type Target = {
  type: string;
  owner: string;
  repo: string;
  localDir: string;
  url: string;
  filePath: string;
};
