import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "d34b0d22-a93e-4ede-b3f7-134d54258acc" */
test("preview every configured output while typing without requesting generation", async ({ workspace }) => {
  await workspace.connectedOutputs(workspace.tabs, true);
  await workspace.requestPreview(workspace.document);
  await workspace.expectPreviewTabs(workspace.tabs);
  await workspace.expectOutputRequests([workspace.document], []);
});

/* @expec-test "05337a45-24e0-4813-b346-c794087d05b9" */
test("saving leaves generation disabled until it is enabled for the connection", async ({ workspace }) => {
  await workspace.connectedOutputs(workspace.tabs, false);
  await workspace.saveSource(workspace.document);
  await workspace.expectOutputRequests([], []);
});

/* @expec-test "55ee229f-3bf8-4f8c-80ff-2e845eb68073" */
test("saving requests generation when enabled for the connection", async ({ workspace }) => {
  await workspace.connectedOutputs(workspace.tabs, true);
  await workspace.saveSource(workspace.document);
  await workspace.expectOutputRequests([], [workspace.document]);
});
