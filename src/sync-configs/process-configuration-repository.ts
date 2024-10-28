import * as fs from "fs";
import { applyChanges } from "./apply-changes";
import { confirmChanges } from "./confirm-changes";
import { getDiff } from "./get-diff";
import { getModifiedContent } from "./get-modified-content";
import { Target } from "./targets";
import * as path from "path";

export async function processConfigurationRepository(target: Target, instruction: string, parserCode: string, isInteractive: boolean) {
  const filePath = path.resolve("src", "fixtures", target.localDir, target.filePath);
  if (!fs.existsSync(filePath)) {
    console.trace({ filePath });
    console.log(`Skipping ${target.url} as the file ${target.filePath} does not exist.`);
    return;
  }
  const fileContent = fs.readFileSync(filePath, "utf8");

  const modifiedContent = await getModifiedContent(fileContent, instruction, parserCode, target.url);

  const tempFilePath = `${filePath}.modified`;
  fs.writeFileSync(tempFilePath, modifiedContent, "utf8");

  const diff = await getDiff(filePath, tempFilePath);
  console.log(diff);

  const isConfirmed = !isInteractive || (await confirmChanges(target.url));

  if (isConfirmed) {
    await applyChanges({ target, filePath, modifiedContent, instruction, isInteractive });
  } else {
    console.log(`Changes to ${target.url} discarded.`);
  }
}
