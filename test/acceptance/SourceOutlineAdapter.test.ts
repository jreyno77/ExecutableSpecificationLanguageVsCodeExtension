import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "a56c99f3-c409-4fe3-a894-9d099ece9d16" */
test("the native outline shows Library and one public count capability", async ({ workspace }) => {
  await workspace.outlineEditor("library.expec", "component Library {\n  public count\n  capability count() returns Number\n}");
  await workspace.requestEditorOutline();
  await workspace.expectNativeOutlineSize(1, 1, 2);
  await workspace.expectNativeOutlineDeclaration(1, [1], "Library", "Module", 1);
  await workspace.expectNativeOutlineDeclaration(1, [1, 1], "count", "Method", 0);
  await workspace.expectNativeOutlineWholeRange(1, [1], 1, 1, 4, 2);
  await workspace.expectNativeOutlineNameRange(1, [1], 1, 11, 18);
  await workspace.expectNativeOutlineNameRange(1, [1, 1], 3, 14, 19);
  await workspace.expectContainedNativeOutlineNames(1);
  await workspace.expectNoOutlineProjectWrites();
});

/* @expec-test "a8d65b17-44cb-4e5a-8ffa-fa75607ef7d1" */
test("unsaved declarations update the native outline and rejected text withdraws it", async ({ workspace }) => {
  await workspace.outlineEditor("book.expec", "type Book { title: Text }");
  await workspace.requestEditorOutline();
  await workspace.editOutlineWithoutSaving("type Magazine { title: Text }");
  await workspace.requestEditorOutline();
  await workspace.editOutlineWithoutSaving("type Magazine {");
  await workspace.requestEditorOutline();
  await workspace.expectNativeOutlineSize(1, 1, 2);
  await workspace.expectNativeOutlineDeclaration(1, [1], "Book", "Struct", 1);
  await workspace.expectNativeOutlineSize(2, 1, 2);
  await workspace.expectNativeOutlineDeclaration(2, [1], "Magazine", "Struct", 1);
  await workspace.expectNativeOutlineNameRange(2, [1], 1, 6, 14);
  await workspace.expectNativeOutlineSize(3, 0, 0);
  await workspace.expectUnsavedOutlineText("type Magazine {", "type Book { title: Text }");
  await workspace.expectNoOutlineProjectWrites();
});

/* @expec-test "ce7774d2-6d19-46b9-b5e6-6f14af25c13b" */
test("the native outline preserves decoded quoted names and real UTF-16 selections", async ({ workspace }) => {
  await workspace.outlineEditor("unicode.expec", "type `📚Book` {\n  `résumé`: Text\n}");
  await workspace.requestEditorOutline();
  await workspace.expectNativeOutlineSize(1, 1, 2);
  await workspace.expectNativeOutlineDeclaration(1, [1], "📚Book", "Struct", 1);
  await workspace.expectNativeOutlineDeclaration(1, [1, 1], "résumé", "Field", 0);
  await workspace.expectNativeOutlineWholeRange(1, [1], 1, 1, 3, 2);
  await workspace.expectNativeOutlineNameRange(1, [1], 1, 6, 14);
  await workspace.expectNativeOutlineNameRange(1, [1, 1], 2, 3, 11);
  await workspace.expectContainedNativeOutlineNames(1);
  await workspace.expectNoOutlineProjectWrites();
});

/* @expec-test "9480b217-3511-4bce-b172-ac625a90da82" */
test("the standard adapter converts CRLF and astral scalar ranges without narrowing them", async ({ workspace }) => {
  await workspace.outlineAdapterDocument("file:///workspace/unicode.expec", "type `📚Book` {\r\n  `résumé`: Text\r\n}", 1);
  await workspace.requestOutlineAdapter(1);
  await workspace.expectNativeOutlineSize(1, 1, 2);
  await workspace.expectNativeOutlineWholeRange(1, [1], 1, 1, 3, 2);
  await workspace.expectNativeOutlineNameRange(1, [1], 1, 6, 14);
  await workspace.expectNativeOutlineNameRange(1, [1, 1], 2, 3, 11);
  await workspace.expectContainedNativeOutlineNames(1);
});

/* @expec-test "f271b0b7-fefa-41a5-a39e-5c741f456acb" */
test("an older native TextDocument snapshot cannot use a newer core outline", async ({ workspace }) => {
  await workspace.outlineAdapterDocument("file:///workspace/book.expec", "type Book { title: Text }", 1);
  await workspace.requestOutlineAdapter(1);
  await workspace.changeOutlineAdapterDocument("type Magazine { title: Text }", 2);
  await workspace.requestOutlineAdapter(1);
  await workspace.requestOutlineAdapter(2);
  await workspace.expectNativeOutlineSize(1, 1, 2);
  await workspace.expectNativeOutlineDeclaration(1, [1], "Book", "Struct", 1);
  await workspace.expectNativeOutlineSize(2, 0, 0);
  await workspace.expectNativeOutlineSize(3, 1, 2);
  await workspace.expectNativeOutlineDeclaration(3, [1], "Magazine", "Struct", 1);
});
