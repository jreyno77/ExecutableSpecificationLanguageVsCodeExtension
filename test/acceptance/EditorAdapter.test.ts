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

/* @expec-test "f82d4ffd-4240-4156-9e36-7e558fdb562b" */
test("preview an untitled document without a filesystem path", async ({ workspace }) => {
  await workspace.editorCoreReturns(workspace.previewTabs);
  await workspace.changeEditorDocument(workspace.untitledDocument);
  await workspace.expectCoreRequests([workspace.untitledDocument], []);
  await workspace.expectEditorPreviews(workspace.previewTabs);
});

/* @expec-test "68f9ef87-9835-4a5e-b286-3b1ece49d12c" */
test("keep each edit's text snapshot for the same document", async ({ workspace }) => {
  await workspace.editorCoreReturns(workspace.previewTabs);
  await workspace.changeEditorDocument(workspace.editedDocument);
  await workspace.changeEditorDocument(workspace.latestDocument);
  await workspace.expectCoreRequests([workspace.editedDocument, workspace.latestDocument], []);
  await workspace.expectEditorPreviews(workspace.previewTabs);
});
