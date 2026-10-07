import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "9900dd43-164e-4f16-9588-3ca7fd82757a" */
test("preview the current unsaved editor text", async ({ workspace }) => {
  await workspace.editorCoreReturns(workspace.previewTabs);
  await workspace.changeEditorDocument(workspace.editedDocument);
  await workspace.expectCoreRequests([workspace.editedDocument], []);
  await workspace.expectEditorPreviews(workspace.previewTabs);
});

/* @expec-test "5c182226-4837-4360-9b12-7c78c4175a7d" */
test("forward a saved document to core's save policy", async ({ workspace }) => {
  await workspace.editorCoreReturns(workspace.previewTabs);
  await workspace.saveEditorDocument(workspace.editedDocument);
  await workspace.expectCoreRequests([], [workspace.editedDocument]);
});
