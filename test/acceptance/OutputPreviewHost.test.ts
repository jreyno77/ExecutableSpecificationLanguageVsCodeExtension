import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "cc2b58d6-bd2f-4078-8ed1-11653e435600" */
test("read actual configured outputs from an unsaved edit without writing generated files", async ({ workspace }) => {
  await workspace.previewEditor("type Book { title: Text }", workspace.configuredPreviews);
  await workspace.showOutputPreviews();
  await workspace.editPreviewWithoutSaving("type Book { title: Number }");
  await workspace.selectPreviewOutput("typescript");
  await workspace.selectPreviewDocument("draft/types/Book.ts");
  await workspace.selectPreviewOutput("markdown");
  await workspace.selectPreviewDocument("draft/docs/Book.md");
  await workspace.selectPreviewOutput("uml");
  await workspace.selectPreviewDocument("draft/uml/structure.svg");
  await workspace.expectNativePreviewOutputs(["uml", "typescript", "markdown"]);
  await workspace.expectNativePreviewText("typescript", "draft/types/Book.ts", "text/typescript", "title: number;");
  await workspace.expectNativePreviewText("markdown", "draft/docs/Book.md", "text/markdown", "type Book");
  await workspace.expectNativePreviewDiagram("uml", "draft/uml/structure.svg", "Book");
  await workspace.expectNativePreviewUnsaved("type Book { title: Text }", "type Book { title: Number }");
});

/* @expec-test "0c5a68b5-97b3-4750-a0e5-43515a29d761" */
test("a rejected unsaved edit withdraws former successful documents", async ({ workspace }) => {
  await workspace.previewEditor("type Book { title: Text }", workspace.configuredPreviews);
  await workspace.showOutputPreviews();
  await workspace.selectPreviewOutput("typescript");
  await workspace.selectPreviewDocument("draft/types/Book.ts");
  await workspace.editPreviewWithoutSaving("type Book {");
  await workspace.expectNativePreviewBlocked();
});

/* @expec-test "775ca454-e985-476b-a0aa-8b10b8b74c7b" */
test("closing and reopening a preview replays the latest authored state", async ({ workspace }) => {
  await workspace.previewEditor("type Book { title: Text }", workspace.configuredPreviews);
  await workspace.showOutputPreviews();
  await workspace.selectPreviewOutput("typescript");
  await workspace.selectPreviewDocument("draft/types/Book.ts");
  await workspace.closePreviewPanel();
  await workspace.editPreviewWithoutSaving("type Book { title: Number }");
  await workspace.showOutputPreviews();
  await workspace.selectPreviewOutput("typescript");
  await workspace.selectPreviewDocument("draft/types/Book.ts");
  await workspace.expectClosedPreviewText("title: string;");
  await workspace.expectNativePreviewText("typescript", "draft/types/Book.ts", "text/typescript", "title: number;");
});

/* @expec-test "34404e66-8a39-4243-aea1-3f2fbf6f08f1" */
test("saving output configuration changes the open preview without refresh", async ({ workspace }) => {
  await workspace.previewEditor("type Book { title: Text }", workspace.configuredPreviews);
  await workspace.showOutputPreviews();
  await workspace.savePreviewConfiguration(workspace.revisedPreviews);
  await workspace.selectPreviewOutput("markdown");
  await workspace.selectPreviewDocument("revised/docs/Book.md");
  await workspace.expectNativePreviewPriorOutputs(["uml", "typescript", "markdown"]);
  await workspace.expectNativePreviewOutputs(["markdown"]);
  await workspace.expectNativePreviewText("markdown", "revised/docs/Book.md", "text/markdown", "type Book");
});

/* @expec-test "1399b29f-0105-4c47-9248-b19d48744339" */
test("read a large real diagram at normal scale and navigate its viewport", async ({ workspace }) => {
  await workspace.previewEditor(workspace.largeBookSource, workspace.configuredPreviews);
  await workspace.showOutputPreviews();
  await workspace.selectPreviewOutput("uml");
  await workspace.selectPreviewDocument("draft/uml/structure.svg");
  await workspace.zoomPreviewDiagram();
  await workspace.scrollPreviewDiagram();
  await workspace.resetPreviewZoom();
  await workspace.expectNativePreviewDiagram("uml", "draft/uml/structure.svg", "Book");
  await workspace.expectNativePreviewScrollable();
  await workspace.expectNativePreviewZoomHistory([100, 125, 100]);
  await workspace.expectNativePreviewZoom(100);
});
