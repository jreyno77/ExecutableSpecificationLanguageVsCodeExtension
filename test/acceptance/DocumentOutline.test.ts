import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "6c164023-e814-4035-947b-be18dfd99ab7" */
test("public count appears once beneath its Library declaration", async ({ workspace }) => {
  await workspace.documentOutline();
  await workspace.openOutlineSource(workspace.outlineLibrary, 1);
  await workspace.requestDocumentOutline((workspace.outlineLibrary)["uri"], 1);
  await workspace.expectDocumentOutline(1, workspace.outlineLibrary, 1, 2);
  await workspace.expectOutlineDeclaration(1, [1], "Library", "component", 1);
  await workspace.expectOutlineDeclaration(1, [1, 1], "count", "capability", 0);
  await workspace.expectOutlineWholeRange(1, [1], 1, 1, 4, 2);
  await workspace.expectOutlineNameRange(1, [1], 1, 11, 18);
  await workspace.expectOutlineWholeRange(1, [1, 1], 3, 3, 3, 36);
  await workspace.expectOutlineNameRange(1, [1, 1], 3, 14, 19);
});

/* @expec-test "7d96e0e7-09cd-454a-871f-8e922d84fb2f" */
test("authored kinds and nested local types retain source order without wrapper entries", async ({ workspace }) => {
  await workspace.documentOutline();
  await workspace.openOutlineSource(workspace.outlineKinds, 1);
  await workspace.requestDocumentOutline((workspace.outlineKinds)["uri"], 1);
  await workspace.expectDocumentOutline(1, workspace.outlineKinds, 7, 10);
  await workspace.expectOutlineDeclaration(1, [1], "Library", "component", 2);
  await workspace.expectOutlineDeclaration(1, [1, 1], "Book", "record-type-declaration", 1);
  await workspace.expectOutlineDeclaration(1, [1, 1, 1], "title", "field", 0);
  await workspace.expectOutlineDeclaration(1, [1, 2], "count", "capability", 0);
  await workspace.expectOutlineDeclaration(1, [2], "Named", "concept", 0);
  await workspace.expectOutlineDeclaration(1, [3], "Shelf", "class", 0);
  await workspace.expectOutlineDeclaration(1, [4], "Catalog", "interface", 0);
  await workspace.expectOutlineDeclaration(1, [5], "Name", "alias-type-declaration", 0);
  await workspace.expectOutlineDeclaration(1, [6], "Handle", "opaque-type-declaration", 0);
  await workspace.expectOutlineDeclaration(1, [7], "describe", "function", 0);
  await workspace.expectOutlineWholeRange(1, [1, 1], 2, 9, 4, 4);
  await workspace.expectOutlineNameRange(1, [1, 1], 2, 14, 18);
});

/* @expec-test "9b642451-9013-4484-a478-20a400641b05" */
test("quoted Unicode names are decoded while selections retain their actual tokens", async ({ workspace }) => {
  await workspace.documentOutline();
  await workspace.openOutlineSource(workspace.outlineUnicode, 1);
  await workspace.requestDocumentOutline((workspace.outlineUnicode)["uri"], 1);
  await workspace.expectDocumentOutline(1, workspace.outlineUnicode, 1, 2);
  await workspace.expectOutlineDeclaration(1, [1], "📚Book", "record-type-declaration", 1);
  await workspace.expectOutlineDeclaration(1, [1, 1], "résumé", "field", 0);
  await workspace.expectOutlineWholeRange(1, [1], 1, 1, 3, 2);
  await workspace.expectOutlineNameRange(1, [1], 1, 6, 13);
  await workspace.expectOutlineWholeRange(1, [1, 1], 2, 3, 2, 17);
  await workspace.expectOutlineNameRange(1, [1, 1], 2, 3, 11);
});

/* @expec-test "c6e4c8da-be8a-4956-911b-d06834968185" */
test("an unsaved declaration edit replaces the outline and rejects an old requested version", async ({ workspace }) => {
  await workspace.documentOutline();
  await workspace.openOutlineSource(workspace.outlineBook, 1);
  await workspace.requestDocumentOutline((workspace.outlineBook)["uri"], 1);
  await workspace.changeOutlineSource({ ["uri"]: (workspace.outlineBook)["uri"], ["text"]: "type Magazine { title: Text }" }, 2);
  await workspace.requestDocumentOutline((workspace.outlineBook)["uri"], 1);
  await workspace.requestDocumentOutline((workspace.outlineBook)["uri"], 2);
  await workspace.expectDocumentOutline(1, workspace.outlineBook, 1, 2);
  await workspace.expectOutlineDeclaration(1, [1], "Book", "record-type-declaration", 1);
  await workspace.expectNoDocumentOutline(2);
  await workspace.expectDocumentOutline(3, { ["uri"]: (workspace.outlineBook)["uri"], ["text"]: "type Magazine { title: Text }" }, 1, 2);
  await workspace.expectOutlineDeclaration(3, [1], "Magazine", "record-type-declaration", 1);
  await workspace.expectOutlineNameRange(3, [1], 1, 6, 14);
});

/* @expec-test "283a0db7-6393-4a0f-93bf-543bee2b1c47" */
test("independent semantic errors retain current declarations without importing another module's tree", async ({ workspace }) => {
  await workspace.documentOutline();
  await workspace.saveOutlineSource(workspace.outlineBook);
  await workspace.openOutlineSource({ ["uri"]: "file:///workspace/basket.expec", ["text"]: "use Book from \"./book.expec\"\ntype Basket { book: Book\n  missing: Unknown }" }, 1);
  await workspace.requestDocumentOutline("file:///workspace/basket.expec", 1);
  await workspace.requestDocumentOutline((workspace.outlineBook)["uri"], 1);
  await workspace.expectOutlineProblem("file:///workspace/basket.expec", "unresolved-reference");
  await workspace.expectDocumentOutline(1, { ["uri"]: "file:///workspace/basket.expec", ["text"]: "use Book from \"./book.expec\"\ntype Basket { book: Book\n  missing: Unknown }" }, 1, 3);
  await workspace.expectOutlineDeclaration(1, [1], "Basket", "record-type-declaration", 2);
  await workspace.expectOutlineDeclaration(1, [1, 1], "book", "field", 0);
  await workspace.expectOutlineDeclaration(1, [1, 2], "missing", "field", 0);
  await workspace.expectNoDocumentOutline(2);
});

/* @expec-test "23b6542c-3244-4a9c-bf72-a014849ea959" */
test("a rejected edit withdraws both the old version and current outline", async ({ workspace }) => {
  await workspace.documentOutline();
  await workspace.openOutlineSource(workspace.outlineBook, 1);
  await workspace.requestDocumentOutline((workspace.outlineBook)["uri"], 1);
  await workspace.changeOutlineSource({ ["uri"]: (workspace.outlineBook)["uri"], ["text"]: "type Book {" }, 2);
  await workspace.requestDocumentOutline((workspace.outlineBook)["uri"], 2);
  await workspace.requestDocumentOutline((workspace.outlineBook)["uri"], 1);
  await workspace.expectDocumentOutline(1, workspace.outlineBook, 1, 2);
  await workspace.expectNoDocumentOutline(2);
  await workspace.expectNoDocumentOutline(3);
});

/* @expec-test "955c6000-da9b-436f-be58-83be25b622d6" */
test("closing reopening and disposal respect the document lifetime", async ({ workspace }) => {
  await workspace.documentOutline();
  await workspace.openOutlineSource(workspace.outlineLibrary, 10);
  await workspace.closeOutlineSource((workspace.outlineLibrary)["uri"]);
  await workspace.requestDocumentOutline((workspace.outlineLibrary)["uri"], 10);
  await workspace.openOutlineSource(workspace.outlineLibrary, 1);
  await workspace.requestDocumentOutline((workspace.outlineLibrary)["uri"], 1);
  await workspace.disposeDocumentOutline();
  await workspace.requestDocumentOutline((workspace.outlineLibrary)["uri"], 1);
  await workspace.openOutlineSource(workspace.outlineUnicode, 1);
  await workspace.requestDocumentOutline((workspace.outlineUnicode)["uri"], 1);
  await workspace.expectNoDocumentOutline(1);
  await workspace.expectDocumentOutline(2, workspace.outlineLibrary, 1, 2);
  await workspace.expectNoDocumentOutline(3);
  await workspace.expectNoDocumentOutline(4);
});

/* @expec-test "1d7c0c6e-3ed0-4b74-8d2a-b2eca5a64867" */
test("a current accepted document without declarations has an empty outline", async ({ workspace }) => {
  await workspace.documentOutline();
  await workspace.openOutlineSource({ ["uri"]: "untitled:Outline.expec", ["text"]: "// a draft" }, 1);
  await workspace.requestDocumentOutline("untitled:Outline.expec", 1);
  await workspace.expectDocumentOutline(1, { ["uri"]: "untitled:Outline.expec", ["text"]: "// a draft" }, 0, 0);
});

/* @expec-test "33cea5d1-6738-432d-8973-65f1b9f20d3b" */
test("requests reuse prepared facts and caller mutation cannot alter another reply", async ({ workspace }) => {
  await workspace.documentOutline();
  await workspace.openOutlineSource(workspace.outlineLibrary, 1);
  await workspace.rememberOutlineWork();
  await workspace.requestDocumentOutline((workspace.outlineLibrary)["uri"], 1);
  await workspace.requestDocumentOutline((workspace.outlineLibrary)["uri"], 1);
  await workspace.attemptOutlineReplyMutation(1);
  await workspace.requestDocumentOutline((workspace.outlineLibrary)["uri"], 1);
  await workspace.expectDocumentOutline(2, workspace.outlineLibrary, 1, 2);
  await workspace.expectOutlineDeclaration(2, [1], "Library", "component", 1);
  await workspace.expectOutlineDeclaration(2, [1, 1], "count", "capability", 0);
  await workspace.expectDocumentOutline(3, workspace.outlineLibrary, 1, 2);
  await workspace.expectOutlineDeclaration(3, [1], "Library", "component", 1);
  await workspace.expectOutlineDeclaration(3, [1, 1], "count", "capability", 0);
  await workspace.expectNoOutlineAnalysis();
});
