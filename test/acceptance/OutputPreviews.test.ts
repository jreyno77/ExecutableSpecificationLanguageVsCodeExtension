import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "31259bb8-c60f-4a19-b6b2-c318e019c1c6" */
test("show three registered outputs from the current unsaved text", async ({ workspace }) => {
  await workspace.previewAuthoring(workspace.threeOutputs);
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" }, 1);
  await workspace.changePreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Number }" }, 2);
  await workspace.settleCurrentPreviews();
  await workspace.expectConfiguredOutputs(["uml", "typescript", "markdown"], ["UML", "TypeScript", "Markdown"]);
  await workspace.expectCurrentPreviewSource("file:///workspace/src/library.expec", 2);
  await workspace.expectPreviewDocument("typescript", "draft/types/Book.ts", "text/typescript", "title: number;");
  await workspace.expectPreviewDocument("markdown", "draft/docs/Book.md", "text/markdown", "type Book");
  await workspace.expectPreviewSvgLabel("uml", "draft/uml/structure.svg", "Book");
  await workspace.expectTargetsPreserved();
});

/* @expec-test "f99a7cc1-1d30-4b37-a303-6d00da2a9416" */
test("a rejected current edit withdraws old successful documents", async ({ workspace }) => {
  await workspace.previewAuthoring(workspace.textOutputs);
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" }, 1);
  await workspace.settleCurrentPreviews();
  await workspace.changePreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book {" }, 2);
  await workspace.settleCurrentPreviews();
  await workspace.expectPreviewStatus("typescript", "blocked");
  await workspace.expectPreviewStatus("markdown", "blocked");
  await workspace.expectPreviewExplanation("typescript", "expected-token");
  await workspace.expectNoPreviewDocuments("typescript");
  await workspace.expectNoPreviewDocuments("markdown");
});

/* @expec-test "6e8b0658-6b41-4db9-8a4b-7eea5c61e0c5" */
test("a native mapping refusal leaves documentation available", async ({ workspace }) => {
  await workspace.previewAuthoring("{\"formatVersion\":1,\"version\":\"0.1.0\",\"build\":{\"entries\":[\"src/library.expec\"]},\"outputs\":[{\"id\":\"typescript\",\"options\":{\"directory\":\"draft/types\",\"names\":[{\"declaration\":[\"Missing\"],\"name\":\"Renamed\"}]}},{\"id\":\"markdown\",\"options\":{\"directory\":\"draft/docs\"}}]}");
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" }, 1);
  await workspace.settleCurrentPreviews();
  await workspace.expectPreviewStatus("typescript", "refused");
  await workspace.expectPreviewExplanation("typescript", "invalid-native-mapping");
  await workspace.expectNoPreviewDocuments("typescript");
  await workspace.expectPreviewStatus("markdown", "ready");
  await workspace.expectPreviewDocument("markdown", "draft/docs/Book.md", "text/markdown", "type Book");
});

/* @expec-test "46770195-b126-401f-8c88-232097c900f4" */
test("registered outputs sharing Markdown presentation retain distinct IDs", async ({ workspace }) => {
  await workspace.previewAuthoring("{\"formatVersion\":1,\"version\":\"0.1.0\",\"build\":{\"entries\":[\"src/library.expec\"]},\"outputs\":[{\"id\":\"markdown\",\"options\":{\"directory\":\"draft/docs\"}},{\"id\":\"contract-list\",\"options\":{\"directory\":\"draft/contracts\"}}]}");
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" }, 1);
  await workspace.settleCurrentPreviews();
  await workspace.expectConfiguredOutputs(["markdown", "contract-list"], ["Markdown", "contract-list"]);
  await workspace.expectPreviewStatus("markdown", "ready");
  await workspace.expectPreviewStatus("contract-list", "ready");
});

/* @expec-test "f20e87ef-7818-46f6-bc94-2f53d4cefee1" */
test("configuration changes replace output IDs and actual document paths", async ({ workspace }) => {
  await workspace.previewAuthoring(workspace.textOutputs);
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" }, 1);
  await workspace.settleCurrentPreviews();
  await workspace.changePreviewConfiguration("{\"formatVersion\":1,\"version\":\"0.1.0\",\"build\":{\"entries\":[\"src/library.expec\"]},\"outputs\":[{\"id\":\"markdown\",\"options\":{\"directory\":\"revised/docs\"}}]}");
  await workspace.settleCurrentPreviews();
  await workspace.expectConfiguredOutputs(["markdown"], ["Markdown"]);
  await workspace.expectPreviewDocument("markdown", "revised/docs/Book.md", "text/markdown", "type Book");
});

/* @expec-test "6566f3cd-2d32-4dfe-82ba-8d59b8e21630" */
test("saved imports update previews without a newer entry editor version", async ({ workspace }) => {
  await workspace.previewAuthoring(workspace.typeScriptOnly);
  await workspace.savePreviewImport("file:///workspace/src/book.expec", "type Book { title: Text }");
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "use Book from \"./book.expec\"\ntype Shelf { book: Book }" }, 1);
  await workspace.settleCurrentPreviews();
  await workspace.savePreviewImport("file:///workspace/src/book.expec", "type Book { title: Number }");
  await workspace.settleCurrentPreviews();
  await workspace.expectCurrentPreviewSource("file:///workspace/src/library.expec", 1);
  await workspace.expectPreviewDocument("typescript", "draft/types/Book.ts", "text/typescript", "title: number;");
});

/* @expec-test "d42a2084-4c5c-46da-ad63-6457733b9c0b" */
test("an empty authored projection is a visible successful result", async ({ workspace }) => {
  await workspace.previewAuthoring(workspace.typeScriptOnly);
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "" }, 1);
  await workspace.settleCurrentPreviews();
  await workspace.expectPreviewStatus("typescript", "ready");
  await workspace.expectNoPreviewDocuments("typescript");
  await workspace.expectPreviewExplanation("typescript", "No authored documents");
});

/* @expec-test "a699d591-0d7a-4771-ab0c-f268e2635842" */
test("a configured output without a preview does not hide another output", async ({ workspace }) => {
  await workspace.previewAuthoring("{\"formatVersion\":1,\"version\":\"0.1.0\",\"build\":{\"entries\":[\"src/library.expec\"]},\"outputs\":[{\"id\":\"java\",\"options\":{\"directory\":\"draft/java\",\"package\":\"example.library\"}},{\"id\":\"markdown\",\"options\":{\"directory\":\"draft/docs\"}}]}");
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" }, 1);
  await workspace.settleCurrentPreviews();
  await workspace.expectPreviewStatus("java", "refused");
  await workspace.expectPreviewExplanation("java", "output-preview-unavailable");
  await workspace.expectPreviewStatus("markdown", "ready");
  await workspace.expectPreviewDocument("markdown", "draft/docs/Book.md", "text/markdown", "type Book");
});

/* @expec-test "618e2fe4-95c4-48fa-9de8-5f44c9b61472" */
test("an unresolved declaration blocks preview rather than succeeding empty", async ({ workspace }) => {
  await workspace.previewAuthoring(workspace.typeScriptOnly);
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Boook }" }, 1);
  await workspace.settleCurrentPreviews();
  await workspace.expectPreviewStatus("typescript", "blocked");
  await workspace.expectPreviewExplanation("typescript", "unresolved-reference");
  await workspace.expectNoPreviewDocuments("typescript");
});

/* @expec-test "aac70900-9ec8-4001-9ed6-f122db501733" */
test("documentation completes while the actual TypeScript callback remains held", async ({ workspace }) => {
  await workspace.gatedPreviewAuthoring(workspace.textOutputs, "typescript");
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" }, 1);
  await workspace.awaitHeldOutput("typescript");
  await workspace.awaitReadyOutput("markdown");
  await workspace.expectConfiguredOutputs(["typescript", "markdown"], ["TypeScript", "Markdown"]);
  await workspace.expectCurrentPreviewSource("file:///workspace/src/library.expec", 1);
  await workspace.expectPreviewStatus("typescript", "pending");
  await workspace.expectNoPreviewDocuments("typescript");
  await workspace.expectBoundedOutputWork("typescript", 1);
  await workspace.expectPreviewStatus("markdown", "ready");
  await workspace.expectPreviewDocument("markdown", "draft/docs/Book.md", "text/markdown", "type Book");
});

/* @expec-test "c5932e2e-8dcb-4b07-a683-05d7d59f6c83" */
test("a valid changed render becomes pending after a real ready preview", async ({ workspace }) => {
  await workspace.previewAuthoring(workspace.typeScriptOnly);
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" }, 1);
  await workspace.settleCurrentPreviews();
  await workspace.rememberPreviewOutput("typescript");
  await workspace.armNextOutput("typescript");
  await workspace.changePreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Number }" }, 2);
  await workspace.awaitHeldOutput("typescript");
  await workspace.expectEarlierReadyDocument("typescript", "draft/types/Book.ts", "text/typescript", "title: string;");
  await workspace.expectCurrentPreviewSource("file:///workspace/src/library.expec", 2);
  await workspace.expectPreviewStatus("typescript", "pending");
  await workspace.expectNoPreviewDocuments("typescript");
  await workspace.expectBoundedOutputWork("typescript", 2);
});

/* @expec-test "ee71d13f-0ced-4008-9838-c4487dd60960" */
test("a running output presents pending state with no previous documents", async ({ workspace }) => {
  await workspace.gatedPreviewAuthoring(workspace.typeScriptOnly, "typescript");
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" }, 1);
  await workspace.awaitHeldOutput("typescript");
  await workspace.expectPreviewStatus("typescript", "pending");
  await workspace.expectNoPreviewDocuments("typescript");
  await workspace.expectBoundedOutputWork("typescript", 1);
});

/* @expec-test "3a514be1-14e3-4fd7-9fcc-880c4c3c6949" */
test("rapid edits coalesce running output work to only the latest request", async ({ workspace }) => {
  await workspace.gatedPreviewAuthoring(workspace.typeScriptOnly, "typescript");
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" }, 1);
  await workspace.awaitHeldOutput("typescript");
  await workspace.changePreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Boolean }" }, 2);
  await workspace.changePreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Novel { title: Number }" }, 3);
  await workspace.releaseHeldOutput("typescript");
  await workspace.settleCurrentPreviews();
  await workspace.expectBoundedOutputWork("typescript", 2);
  await workspace.expectCurrentPreviewSource("file:///workspace/src/library.expec", 3);
  await workspace.expectPreviewDocument("typescript", "draft/types/Novel.ts", "text/typescript", "title: number;");
});

/* @expec-test "21e898bb-bd5a-430b-a219-e3193cd0fab9" */
test("a new rejected report prevents an older completion restoring content", async ({ workspace }) => {
  await workspace.gatedPreviewAuthoring(workspace.typeScriptOnly, "typescript");
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" }, 1);
  await workspace.awaitHeldOutput("typescript");
  await workspace.changePreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book {" }, 2);
  await workspace.releaseHeldOutput("typescript");
  await workspace.drainPreviewWork();
  await workspace.expectCurrentPreviewSource("file:///workspace/src/library.expec", 2);
  await workspace.expectPreviewStatus("typescript", "blocked");
  await workspace.expectNoPreviewDocuments("typescript");
  await workspace.expectBoundedOutputWork("typescript", 1);
});

/* @expec-test "3d0d4344-d27d-4f57-8e2f-e28ab38aa525" */
test("changed output options supersede a running projection", async ({ workspace }) => {
  await workspace.gatedPreviewAuthoring(workspace.typeScriptOnly, "typescript");
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" }, 1);
  await workspace.awaitHeldOutput("typescript");
  await workspace.changePreviewConfiguration("{\"formatVersion\":1,\"version\":\"0.1.0\",\"build\":{\"entries\":[\"src/library.expec\"]},\"outputs\":[{\"id\":\"typescript\",\"options\":{\"directory\":\"latest/types\"}}]}");
  await workspace.releaseHeldOutput("typescript");
  await workspace.settleCurrentPreviews();
  await workspace.expectBoundedOutputWork("typescript", 2);
  await workspace.expectPreviewDocument("typescript", "latest/types/Book.ts", "text/typescript", "title: string;");
});

/* @expec-test "484344b2-cb9c-4620-9079-4199be5fb09b" */
test("selection discards another document's running preview", async ({ workspace }) => {
  await workspace.gatedPreviewAuthoring(workspace.typeScriptOnly, "typescript");
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" }, 1);
  await workspace.awaitHeldOutput("typescript");
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/novel.expec", ["text"]: "type Novel { title: Number }" }, 1);
  await workspace.releaseHeldOutput("typescript");
  await workspace.settleCurrentPreviews();
  await workspace.expectCurrentPreviewSource("file:///workspace/src/novel.expec", 1);
  await workspace.expectPreviewDocument("typescript", "draft/types/Novel.ts", "text/typescript", "title: number;");
});

/* @expec-test "aa33f4ff-214d-4d3a-b36c-e36201453634" */
test("closing a selected source prevents its running result from returning", async ({ workspace }) => {
  await workspace.gatedPreviewAuthoring(workspace.typeScriptOnly, "typescript");
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" }, 1);
  await workspace.awaitHeldOutput("typescript");
  await workspace.closePreviewSource("file:///workspace/src/library.expec");
  await workspace.releaseHeldOutput("typescript");
  await workspace.drainPreviewWork();
  await workspace.expectNoSelectedPreview();
});

/* @expec-test "42c1b7e3-3684-49a0-be23-55261aa51489" */
test("disposal prevents a running callback from publishing afterward", async ({ workspace }) => {
  await workspace.gatedPreviewAuthoring(workspace.typeScriptOnly, "typescript");
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" }, 1);
  await workspace.awaitHeldOutput("typescript");
  await workspace.disposePreviews();
  await workspace.releaseHeldOutput("typescript");
  await workspace.drainPreviewWork();
  await workspace.expectNoPublicationAfterDisposal();
});

/* @expec-test "26f2e8e5-ca54-4aff-a953-ea6839488a98" */
test("invalid UTF-8 is explicitly refused without replacement content", async ({ workspace }) => {
  await workspace.undecodableTextOutput();
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" }, 1);
  await workspace.settleCurrentPreviews();
  await workspace.expectPreviewStatus("typescript", "refused");
  await workspace.expectPreviewExplanation("typescript", "unsupported-presentation");
  await workspace.expectNoPreviewDocuments("typescript");
});

/* @expec-test "9f5de090-519e-4771-9da7-d1e66bdb1115" */
test("unsupported binary presentation remains visibly refused", async ({ workspace }) => {
  await workspace.unsupportedBinaryOutput();
  await workspace.openPreviewSource({ ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" }, 1);
  await workspace.settleCurrentPreviews();
  await workspace.expectPreviewStatus("binary", "refused");
  await workspace.expectPreviewExplanation("binary", "unsupported-presentation");
  await workspace.expectNoPreviewDocuments("binary");
});
