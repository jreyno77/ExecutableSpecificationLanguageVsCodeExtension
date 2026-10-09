import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "08e45681-cc87-4282-aca3-aef61899c2f1" */
test("Go to Definition selects the actual local declaration", async ({ workspace }) => {
  await workspace.localDefinitionEditor(workspace.nativeDefinitionLocal);
  await workspace.goToNativeDefinition(2, 21);
  await workspace.expectNativeSourceDefinition("entry.expec", "Book", 1, 6, 10);
  await workspace.expectDefinitionFilesUnchanged();
});

/* @expec-test "9721c410-8d8b-4a50-b86d-40a82da5fc34" */
test("Go to Definition preserves UTF-16 columns around an astral name", async ({ workspace }) => {
  await workspace.localDefinitionEditor("type `📚Book` { title: Text }\ntype Basket { book: `📚Book` }");
  await workspace.goToNativeDefinition(2, 24);
  await workspace.expectNativeSourceDefinition("entry.expec", "`📚Book`", 1, 6, 14);
  await workspace.expectDefinitionFilesUnchanged();
});

/* @expec-test "6ba8e85f-fe13-41ed-befa-133648d44a58" */
test("Go to Definition uses unsaved imported text and exact Unicode ranges", async ({ workspace }) => {
  await workspace.importedDefinitionEditor(workspace.nativeDefinitionEntry, workspace.nativeDefinitionBook);
  await workspace.editDefinitionEntry(workspace.nativeDefinitionUnicodeEntry);
  await workspace.editDefinitionImport(workspace.nativeDefinitionUnicodeBook);
  await workspace.goToNativeDefinition(3, 21);
  await workspace.expectNativeSourceDefinition("book.expec", "Book", 3, 6, 10);
  await workspace.expectDefinitionBuffersDirty();
  await workspace.expectDefinitionFilesUnchanged();
});

/* @expec-test "479105e6-5676-432f-a7ee-87d98952261e" */
test("a bound definition remains available beside an unrelated editor error", async ({ workspace }) => {
  await workspace.localDefinitionEditor("type Book { title: Text }\ntype Basket { book: Book\n  missing: Unknown }");
  await workspace.goToNativeDefinition(2, 21);
  await workspace.expectDefinitionEditorProblem("unresolved-reference");
  await workspace.expectNativeSourceDefinition("entry.expec", "Book", 1, 6, 10);
  await workspace.expectDefinitionFilesUnchanged();
});

/* @expec-test "5bfd8179-bd2e-4888-bf29-fc5230e96b3b" */
test("an unresolved reference does not move to an invented declaration", async ({ workspace }) => {
  await workspace.localDefinitionEditor("type Basket { book: Missing }");
  await workspace.goToNativeDefinition(1, 21);
  await workspace.expectDefinitionEditorProblem("unresolved-reference");
  await workspace.expectNoNativeSourceDefinition();
  await workspace.expectDefinitionFilesUnchanged();
});

/* @expec-test "4ead5a82-643e-4a42-8008-89fdef08d7ba" */
test("an ambiguous imported reference does not pick one source", async ({ workspace }) => {
  await workspace.ambiguousDefinitionEditor("use Cart from \"./shopping.expec\"\nuse Cart from \"./shipping.expec\"\nfunction save(cart: Cart)", "type Cart {}", "type Cart {}");
  await workspace.goToNativeDefinition(3, 21);
  await workspace.expectDefinitionEditorProblem("ambiguous-reference");
  await workspace.expectNoNativeSourceDefinition();
  await workspace.expectDefinitionFilesUnchanged();
});

/* @expec-test "1d0e7279-cfa6-4715-aa0c-eda9a2a2a838" */
test("a negative LSP position does not clamp into a valid reference", async ({ workspace }) => {
  await workspace.definitionConversion("type `📚Book` { title: Text }\ntype Basket { book: `📚Book` }");
  await workspace.requestConvertedDefinition(1, 23);
  await workspace.requestConvertedDefinition((-finiteNumber(1, "unary operand")), 23);
  await workspace.expectConvertedDefinition(1, "`📚Book`", 0, 5, 13);
  await workspace.expectNoConvertedDefinition(2);
});

/* @expec-test "157b31c7-1133-47cc-b7bb-85a0ab2ed59e" */
test("an out-of-line LSP position does not clamp into a valid reference", async ({ workspace }) => {
  await workspace.definitionConversion("type `📚Book` { title: Text }\ntype Basket { book: `📚Book` }");
  await workspace.requestConvertedDefinition(1, 23);
  await workspace.requestConvertedDefinition(1, 999);
  await workspace.expectConvertedDefinition(1, "`📚Book`", 0, 5, 13);
  await workspace.expectNoConvertedDefinition(2);
});

/* @expec-test "f800a5b8-8ac4-42a8-9578-2d8db4aff70c" */
test("a position inside a surrogate pair has no guessed scalar target", async ({ workspace }) => {
  await workspace.definitionConversion("type `📚Book` { title: Text }\ntype Basket { book: `📚Book` }");
  await workspace.requestConvertedDefinition(1, 23);
  await workspace.requestConvertedDefinition(1, 22);
  await workspace.expectConvertedDefinition(1, "`📚Book`", 0, 5, 13);
  await workspace.expectNoConvertedDefinition(2);
});

/* @expec-test "19a54a55-33a1-45d6-b997-7503d7e1cde7" */
test("a fractional LSP position has no invented location", async ({ workspace }) => {
  await workspace.definitionConversion("type `📚Book` { title: Text }\ntype Basket { book: `📚Book` }");
  await workspace.requestConvertedDefinition(1, 23);
  await workspace.requestConvertedDefinition(1, 23.5);
  await workspace.expectConvertedDefinition(1, "`📚Book`", 0, 5, 13);
  await workspace.expectNoConvertedDefinition(2);
});
