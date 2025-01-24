import { describe, expect, test } from "bun:test";
import { getDefaultBranch } from "../src/sync-configs/get-default-branch";
import { getModifiedContent } from "../src/sync-configs/get-modified-content";
import { parsePluginUrls } from "../src/sync-configs/parse-plugin-urls";

// Set environment variable for mock response
process.env.USE_MOCK_CLAUDE_RESPONSE = "true";

describe("sync-configs", () => {
  test("parsePluginUrls parses plugin URLs correctly", () => {
    const input = `
plugins:
  - uses:
    - plugin: http://github.com/org/repo1
    - plugin: http://github.com/org/repo2
`;
    const result = parsePluginUrls(input);
    expect(result).toEqual([
      "http://github.com/org/repo1/manifest.json",
      "http://github.com/org/repo2/manifest.json"
    ]);
  });

  test("getDefaultBranch returns main as fallback", async () => {
    const repoUrl = "https://github.com/org/repo";
    const branch = await getDefaultBranch(repoUrl);
    expect(branch).toBe("main");
  });

  test("getModifiedContent uses mock response", async () => {
    const original = "plugins:\n  - url: https://github.com/org/repo";
    const instruction = "Update the config";
    const parserCode = "function parseConfig(yaml) { return yaml; }";
    const repoUrl = "https://github.com/org/repo";

    const modified = await getModifiedContent(
      original,
      instruction,
      parserCode,
      repoUrl
    );
    expect(modified).toBeTruthy();
  });
});
