import { jest } from "@jest/globals";
import * as cloneOrPullRepo from "../src/sync-configs/clone-or-pull-repo";
import * as getDefaultBranch from "../src/sync-configs/get-default-branch";
import { syncConfigsAgent } from "../src/sync-configs/sync-configs";
import * as syncConfigsNonInteractive from "../src/sync-configs/sync-configs-non-interactive";

// Mock the modules
jest.mock("../src/sync-configs/clone-or-pull-repo");
jest.mock("../src/sync-configs/get-default-branch");
jest.mock("../src/sync-configs/sync-configs-non-interactive");

describe("sync-configs-agent", () => {
  const originalEnv = process.env;
  const originalArgv = process.argv;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock environment variables that the workflow uses
    process.env = {
      ...originalEnv,
      ANTHROPIC_API_KEY: "test-anthropic-key",
      EDITOR_INSTRUCTION: "insert all missing defaults",
      INTERACTIVE: "false",
      ACTOR: "ubiquity-os[bot]",
      EMAIL: "ubiquity-os[bot]@users.noreply.github.com",
      AUTH_TOKEN: "test-auth-token"
    };

    // Mock command line arguments to match workflow
    process.argv = ["node", "src/index.ts", "https://github.com/ubiquity/.ubiquity-os.git"];
  });

  afterEach(() => {
    // Restore original env and argv
    process.env = originalEnv;
    process.argv = originalArgv;
  });

  it("should process repository in non-interactive mode", async () => {
    // Mock the default branch response
    const mockDefaultBranch = "main";
    jest.spyOn(getDefaultBranch, "getDefaultBranch").mockResolvedValue(mockDefaultBranch);

    // Mock successful clone/pull
    jest.spyOn(cloneOrPullRepo, "cloneOrPullRepo").mockResolvedValue();

    // Mock successful non-interactive sync
    jest.spyOn(syncConfigsNonInteractive, "syncConfigsNonInteractive").mockResolvedValue();

    // Run the agent
    await expect(syncConfigsAgent()).resolves.not.toThrow();

    // Verify default branch was fetched
    expect(getDefaultBranch.getDefaultBranch).toHaveBeenCalledWith("https://github.com/ubiquity/.ubiquity-os.git");

    // Verify repository was cloned/pulled
    expect(cloneOrPullRepo.cloneOrPullRepo).toHaveBeenCalled();

    // Verify non-interactive sync was called
    expect(syncConfigsNonInteractive.syncConfigsNonInteractive).toHaveBeenCalled();
  });

  it("should handle push flag", async () => {
    // Modify argv to include --push flag
    process.argv.push("--push");

    // Run the agent
    await expect(syncConfigsAgent()).resolves.not.toThrow();

    // Verify no clone/pull operations were performed
    expect(cloneOrPullRepo.cloneOrPullRepo).not.toHaveBeenCalled();
    expect(syncConfigsNonInteractive.syncConfigsNonInteractive).not.toHaveBeenCalled();
  });

  it("should throw error for invalid INTERACTIVE value", async () => {
    // Set invalid INTERACTIVE value
    process.env.INTERACTIVE = "invalid";

    // Run the agent and expect error
    await expect(syncConfigsAgent()).rejects.toThrow("Invalid value for INTERACTIVE environment variable.");
  });
});
