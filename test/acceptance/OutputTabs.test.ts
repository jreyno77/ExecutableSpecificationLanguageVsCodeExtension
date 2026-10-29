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
  await workspace.presentOutputs([{ ["id"]: "markdown", ["label"]: "Notes", ["status"]: "ready", ["documents"]: [{ ["path"]: "Book.md", ["mediaType"]: "text/markdown", ["content"]: "# Updated Book" }] }]);
  await workspace.selectOutput("markdown");
  await workspace.expectOutputLabels(["Notes"]);
  await workspace.expectMarkdownHeadings(["Updated Book"]);
});

/* @expec-test "d61e35d7-2c4e-4beb-8815-e1909ced875a" */
test("closing the tabs leaves the host available to its owner", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.previews);
  await workspace.disposeOutputTabs();
  await workspace.disposeOutputTabs();
  await workspace.expectOutputLabels([]);
  await workspace.expectOutputHostRetained();
});

/* @expec-test "0a2eafde-3ea9-4a16-962c-b40d5e41ed9c" */
test("preserve a selected output while it remains configured", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.previews);
  await workspace.selectOutput("markdown");
  await workspace.presentOutputs([{ ["id"]: "markdown", ["label"]: "Notes", ["status"]: "ready", ["documents"]: [{ ["path"]: "Book.md", ["mediaType"]: "text/markdown", ["content"]: "# Updated Book" }] }]);
  await workspace.expectSelectedOutput("markdown");
  await workspace.expectMarkdownHeadings(["Updated Book"]);
});

/* @expec-test "0021f60c-5d8a-4963-b050-1cbec729d192" */
test("fall back to the first output when the selected ID is removed", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.previews);
  await workspace.selectOutput("typescript");
  await workspace.presentOutputs([{ ["id"]: "markdown", ["label"]: "Markdown", ["status"]: "ready", ["documents"]: [{ ["path"]: "Book.md", ["mediaType"]: "text/markdown", ["content"]: "# Book" }] }]);
  await workspace.expectSelectedOutput("markdown");
  await workspace.expectMarkdownHeadings(["Book"]);
});

/* @expec-test "fc946849-0185-4d17-850e-9233d978488b" */
test("readding a removed output does not resurrect its former selection", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.previews);
  await workspace.selectOutput("typescript");
  await workspace.presentOutputs([{ ["id"]: "markdown", ["label"]: "Markdown", ["status"]: "ready", ["documents"]: [{ ["path"]: "Book.md", ["mediaType"]: "text/markdown", ["content"]: "# Book" }] }]);
  await workspace.presentOutputs(workspace.previews);
  await workspace.expectSelectedOutput("markdown");
  await workspace.expectMarkdownHeadings(["Book"]);
});

/* @expec-test "8c39e2f2-c05f-4181-bb8c-0bb9c4cf37af" */
test("pending feedback withdraws the previous document", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.previews);
  await workspace.selectOutput("typescript");
  await workspace.presentOutputs([{ ["id"]: "typescript", ["label"]: "TypeScript", ["status"]: "pending", ["documents"]: [], ["message"]: "Previewing current source." }]);
  await workspace.expectOutputStatus("pending", "Previewing current source.");
});

/* @expec-test "39cb1f51-d6b2-4201-9b84-e914a949427b" */
test("show a refused output's actual explanation without documents", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs([{ ["id"]: "typescript", ["label"]: "TypeScript", ["status"]: "refused", ["documents"]: [], ["message"]: "invalid-native-mapping: Missing" }, { ["id"]: "markdown", ["label"]: "Markdown", ["status"]: "ready", ["documents"]: [{ ["path"]: "Book.md", ["mediaType"]: "text/markdown", ["content"]: "# Book" }] }]);
  await workspace.expectOutputLabels(["TypeScript", "Markdown"]);
  await workspace.expectOutputStatus("refused", "invalid-native-mapping: Missing");
});

/* @expec-test "8d9e76eb-3e7a-47d9-acc6-43bb8b40db1a" */
test("a refused output leaves another output readable", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs([{ ["id"]: "typescript", ["label"]: "TypeScript", ["status"]: "refused", ["documents"]: [], ["message"]: "invalid-native-mapping: Missing" }, { ["id"]: "markdown", ["label"]: "Markdown", ["status"]: "ready", ["documents"]: [{ ["path"]: "Book.md", ["mediaType"]: "text/markdown", ["content"]: "# Book" }] }]);
  await workspace.selectOutput("markdown");
  await workspace.expectOutputLabels(["TypeScript", "Markdown"]);
  await workspace.expectMarkdownHeadings(["Book"]);
});

/* @expec-test "f4ec32ce-fc46-40b4-b264-3111af0e9ebe" */
test("open the supplied UML image instead of its earlier D2 source", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.diagrams);
  await workspace.expectSelectedDocument("structure.svg", ["structure.d2", "structure.svg"]);
  await workspace.expectLoadedDiagram(100, 1800);
});

/* @expec-test "0a065d91-05ca-40ad-a444-1b5742d5731e" */
test("select real document paths within one output tab", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.diagrams);
  await workspace.selectOutputDocument("structure.svg");
  await workspace.expectSelectedDocument("structure.svg", ["structure.d2", "structure.svg"]);
  await workspace.expectLoadedDiagram(100, 1800);
});

/* @expec-test "6149357a-c59c-498e-a39f-064cf7ac4c89" */
test("retain the selected SVG path across a changed presentation", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.diagrams);
  await workspace.selectOutputDocument("structure.svg");
  await workspace.presentOutputs(workspace.revisedDiagrams);
  await workspace.expectSelectedDocument("structure.svg", ["notes.d2", "structure.svg"]);
  await workspace.expectLoadedDiagram(100, 1800);
});

/* @expec-test "e696ad4b-b0d2-4b29-80c8-062ea6ef5463" */
test("removing the selected SVG falls back to the first retained document", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.diagrams);
  await workspace.selectOutputDocument("structure.svg");
  await workspace.presentOutputs(workspace.revisedDiagrams);
  await workspace.presentOutputs([{ ["id"]: "uml", ["label"]: "UML", ["status"]: "ready", ["documents"]: [{ ["path"]: "notes.d2", ["mediaType"]: "text/vnd.d2", ["content"]: "Novel: { title: Number }" }] }]);
  await workspace.showOutputSource();
  await workspace.expectSelectedDocument("notes.d2", ["notes.d2"]);
  await workspace.expectOutputContent("Novel: { title: Number }");
});

/* @expec-test "ad52ee30-a538-4c9d-82af-48cdd85faa6f" */
test("zoom and scroll a readable wide diagram", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.diagrams);
  await workspace.selectOutputDocument("structure.svg");
  await workspace.setDiagramZoom(150);
  await workspace.scrollDiagram(100, 80);
  await workspace.expectLoadedDiagram(150, 2700);
  await workspace.expectDiagramScroll(100, 80);
});

/* @expec-test "37102992-2d25-414a-979f-91a8982168ac" */
test("zoom and scroll a readable wide diagram then reset its scale", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.diagrams);
  await workspace.selectOutputDocument("structure.svg");
  await workspace.setDiagramZoom(150);
  await workspace.scrollDiagram(100, 80);
  await workspace.resetDiagramZoom();
  await workspace.expectLoadedDiagram(100, 1800);
});

/* @expec-test "b9892ac9-bfd1-42c6-8b4e-b3ce65cfb6f3" */
test("ready with no authored documents is a visible successful empty result", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs([{ ["id"]: "typescript", ["label"]: "TypeScript", ["status"]: "ready", ["documents"]: [], ["message"]: "No authored documents" }]);
  await workspace.expectOutputStatus("ready", "No authored documents");
});

/* @expec-test "5fe63bef-5974-4f5b-9876-0efa079c85eb" */
test("read headings lists tables and code as a Markdown document", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.readableMarkdown);
  await workspace.expectReadableMarkdown();
});

/* @expec-test "39f43478-dd0b-481f-95d5-1e4f4813741f" */
test("open Home before another supplied Markdown page without reordering paths", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.wikiPages);
  await workspace.expectSelectedDocument("docs/Home.md", ["docs/reference/Book.md", "docs/Home.md"]);
  await workspace.expectMarkdownHeadings(["Library"]);
  await workspace.expectDocumentTextAbsent("expec-section:");
  await workspace.expectDocumentTextAbsent("expec-end:");
});

/* @expec-test "4261e67e-26f9-4260-9603-6343b45e4d03" */
test("follow supplied relative wiki pages and their actual anchors", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.wikiPages);
  await workspace.followDocumentLink("Read Book");
  await workspace.followDocumentLink("Book details");
  await workspace.expectSelectedDocument("docs/reference/Book.md", ["docs/reference/Book.md", "docs/Home.md"]);
  await workspace.expectMarkdownHeadings(["Book", "Book details"]);
  await workspace.expectDocumentAnchor("expec-626f6f6b");
  await workspace.expectSafePreview();
});

/* @expec-test "caa5782f-6cb2-4ca5-95d4-a049744b6ad9" */
test("return to the supplied Home page through a relative parent link", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.wikiPages);
  await workspace.followDocumentLink("Read Book");
  await workspace.followDocumentLink("Home");
  await workspace.expectSelectedDocument("docs/Home.md", ["docs/reference/Book.md", "docs/Home.md"]);
  await workspace.expectDocumentAnchor("expec-686f6d65");
  await workspace.expectSafePreview();
});

/* @expec-test "2494d19c-4485-4d4e-88b1-c302f9942bd5" */
test("retain a selected wiki page when the output is presented again", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.wikiPages);
  await workspace.selectOutputDocument("docs/reference/Book.md");
  await workspace.presentOutputs(workspace.wikiPages);
  await workspace.expectSelectedDocument("docs/reference/Book.md", ["docs/reference/Book.md", "docs/Home.md"]);
  await workspace.expectMarkdownHeadings(["Book", "Book details"]);
});

/* @expec-test "61168d81-780e-4bd0-af9e-d28a9ed95b0f" */
test("show D2 source only after the author asks for it", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.previews);
  await workspace.showOutputSource();
  await workspace.expectOutputContent("Book: { title: Text }");
});

/* @expec-test "40b71968-4824-4754-84d7-49cec5b2846e" */
test("explain a missing rendered diagram without showing D2 source by default", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.previews);
  await workspace.expectDocumentExplanation("Diagram preview unavailable. Select an SVG document or show source.");
  await workspace.expectDocumentTextAbsent("Book: { title: Text }");
});

/* @expec-test "512d3c9f-66b4-4220-8c8d-c938dff17384" */
test("explain a missing anchor without leaving the supplied document", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs(workspace.wikiPages);
  await workspace.followDocumentLink("Missing section");
  await workspace.expectDocumentExplanation("Anchor unavailable in supplied preview.");
  await workspace.expectSelectedDocument("docs/Home.md", ["docs/reference/Book.md", "docs/Home.md"]);
  await workspace.expectSafePreview();
});

/* @expec-test "baae3f52-35d8-4a75-9b73-a0f162c0a5e6" */
test("keep hostile HTML and resource links inert in a readable document", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs([{ ["id"]: "markdown", ["label"]: "Markdown", ["status"]: "ready", ["documents"]: [{ ["path"]: "Home.md", ["mediaType"]: "text/markdown", ["content"]: "# Safe document\n\n<script>window.expecPreviewUnsafe = true</script>\n\n<img src=\"https://example.invalid/pixel\" onerror=\"window.expecPreviewUnsafe = true\">\n\n![Book cover](https://example.invalid/cover.png)\n\n[Remote](https://example.invalid/)\n\n[Command](command:workbench.action.closeWindow)\n\n[Script](javascript:alert%281%29)\n\n[File](file:///tmp/book.md)\n\n[Missing](Missing.md#expec-626f6f6b)\n" }] }]);
  await workspace.expectMarkdownHeadings(["Safe document"]);
  await workspace.expectInactiveDocumentLinks(["Remote", "Command", "Script", "File", "Missing"]);
  await workspace.expectSafePreview();
});

/* @expec-test "9f7247a3-a2c8-424a-a75b-19ac6b0a0eea" */
test("keep fenced HTML visible as code without executing it", async ({ workspace }) => {
  await workspace.openOutputTabs();
  await workspace.presentOutputs([{ ["id"]: "markdown", ["label"]: "Markdown", ["status"]: "ready", ["documents"]: [{ ["path"]: "Home.md", ["mediaType"]: "text/markdown", ["content"]: "# Example\n\n```html\n<script>window.expecPreviewUnsafe = true</script>\n```\n" }] }]);
  await workspace.expectMarkdownHeadings(["Example"]);
  await workspace.expectMarkdownCodeBlocks(["<script>window.expecPreviewUnsafe = true</script>\n"]);
  await workspace.expectSafePreview();
});
