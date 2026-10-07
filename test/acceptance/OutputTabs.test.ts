import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "b2164d16-0da1-4197-9309-acbe0a08e7a1" */
test("see a tab for each supplied output", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.previews);
  await workspace.expectOutputLabels(["UML", "TypeScript", "Markdown"]);
});

/* @expec-test "cf3d7aea-ecd4-43cf-8546-59c4ef97555c" */
test("read the selected output", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.previews);
  await workspace.selectOutput("typescript");
  await workspace.expectOutputContent("export interface Book { title: string }");
});

/* @expec-test "5beec689-0a10-4321-94c7-6e455151970e" */
test("replace the previous tabs when the available outputs change", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.previews);
  await workspace.presentOutputs([{ ["id"]: "markdown", ["label"]: "Notes", ["content"]: "# Updated Book" }]);
  await workspace.selectOutput("markdown");
  await workspace.expectOutputLabels(["Notes"]);
  await workspace.expectOutputContent("# Updated Book");
});
