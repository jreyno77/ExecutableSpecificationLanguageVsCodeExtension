import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "9e3245a7-ee84-43fc-a7f6-c712b5f53f52" */
test("show a missing brace from unsaved text without changing the saved file", async ({ workspace }) => {
  await workspace.diagnosticEditor("library.expec", "type Book {\n  title: Text\n}");
  await workspace.editWithoutSaving("type Book {\n  title: Text\n");
  await workspace.expectEditorSyntaxProblem(3, 1, 3, 1);
  await workspace.expectUnsavedText("type Book {\n  title: Text\n", "type Book {\n  title: Text\n}");
});

/* @expec-test "9e8ed3d7-ec4e-4460-a62b-27caeb635ce1" */
test("fixing an unsaved syntax error clears its diagnostic", async ({ workspace }) => {
  await workspace.diagnosticEditor("library.expec", "type Book {\n  title: Text\n}");
  await workspace.editWithoutSaving("type Book {\n  title: Text\n");
  await workspace.editWithoutSaving("type Book {\n  title: Text\n  copies: Number\n}");
  await workspace.expectResolvedEditorProblem();
  await workspace.expectUnsavedText("type Book {\n  title: Text\n  copies: Number\n}", "type Book {\n  title: Text\n}");
});

/* @expec-test "dd3c3b35-9b19-49ef-91a7-6d2715ece69a" */
test("rapid edits keep diagnostics for the latest text", async ({ workspace }) => {
  await workspace.diagnosticEditor("library.expec", "type Book { title: Text }");
  await workspace.editWithoutSaving("type Book {");
  await workspace.editQuickly("type Book { title: @ }", "type Book { title: Text\n  copies: Number }");
  await workspace.expectResolvedEditorProblem();
  await workspace.expectUnsavedText("type Book { title: Text\n  copies: Number }", "type Book { title: Text }");
});

/* @expec-test "e1445eca-a329-4a4e-8619-0df12c3c7b60" */
test("locate errors after an astral character using editor columns", async ({ workspace }) => {
  await workspace.diagnosticEditor("unicode.expec", "type `📚` { title: Text }");
  await workspace.editWithoutSaving("type `📚` { title: Text @ }");
  await workspace.expectEditorSyntaxProblem(1, 25, 1, 26);
});

/* @expec-test "bc28450a-5bdb-4f5e-b55d-e6cc3e536246" */
test("closing a document clears its owned diagnostics", async ({ workspace }) => {
  await workspace.diagnosticEditor("library.expec", "type Book { title: Text }");
  await workspace.editWithoutSaving("type Book {");
  await workspace.closeEditedDocument();
  await workspace.expectResolvedEditorProblem();
});

/* @expec-test "d7382bd2-ad2f-4ddf-a9bd-810a8bf05d6a" */
test("untitled expec documents receive syntax feedback without a project connection", async ({ workspace }) => {
  await workspace.diagnosticEditor("untitled:Draft.expec", "type Draft { title: Text }");
  await workspace.editWithoutSaving("type Draft {");
  await workspace.expectEditorSyntaxProblem(1, 13, 1, 13);
});

/* @expec-test "9e463f13-4ece-4838-a66c-39b930cc22e6" */
test("an unsaved unknown type is reported", async ({ workspace }) => {
  await workspace.diagnosticEditor("basket.expec", "type Basket { book: Text }");
  await workspace.editWithoutSaving("type Basket { book: Boook }");
  await workspace.expectEditorSemanticCode("unresolved-reference");
  await workspace.expectEditorSyntaxProblem(1, 21, 1, 26);
  await workspace.expectUnsavedText("type Basket { book: Boook }", "type Basket { book: Text }");
});

/* @expec-test "158a74e3-9aa7-4381-97aa-185a816a6082" */
test("fixing an unsaved unknown type clears feedback", async ({ workspace }) => {
  await workspace.diagnosticEditor("basket.expec", "type Basket { book: Text }");
  await workspace.editWithoutSaving("type Basket { book: Boook }");
  await workspace.editWithoutSaving("type Basket { book: Number }");
  await workspace.expectResolvedEditorProblem();
  await workspace.expectUnsavedText("type Basket { book: Number }", "type Basket { book: Text }");
});

/* @expec-test "ea16163a-9a4d-49c5-ab1a-225d39ff8a56" */
test("saved imported changes refresh diagnostics without editing the entry", async ({ workspace }) => {
  await workspace.importedEditor("use Book from \"./book.expec\"\ntype Basket { book: Book }", "type Book { title: Text }");
  await workspace.saveImportedText("type Magazine { title: Text }");
  await workspace.expectEditorSemanticCode("unresolved-reference");
  await workspace.expectEditorSyntaxProblem(1, 5, 1, 9);
  await workspace.expectUnchangedEntryVersion();
});

/* @expec-test "8f8173ca-644b-4e3a-b886-873f0bd8553f" */
test("restoring an imported declaration clears the dependent editor problem", async ({ workspace }) => {
  await workspace.importedEditor("use Book from \"./book.expec\"\ntype Basket { book: Book }", "type Book { title: Text }");
  await workspace.saveImportedText("type Magazine { title: Text }");
  await workspace.saveImportedText("type Book { title: Text }");
  await workspace.expectResolvedEditorProblem();
  await workspace.expectUnchangedEntryVersion();
});

/* @expec-test "61322c9a-f7fa-4146-8897-6ec4ee92c45b" */
test("deleting an imported file reports the missing module", async ({ workspace }) => {
  await workspace.importedEditor("use Book from \"./book.expec\"\ntype Basket { book: Book }", "type Book { title: Text }");
  await workspace.deleteImportedFile();
  await workspace.expectEditorSemanticCode("unavailable-module");
  await workspace.expectEditorSyntaxProblem(1, 5, 1, 9);
  await workspace.expectUnchangedEntryVersion();
});

/* @expec-test "55e240c7-9601-4b5a-ac45-77f67e27db11" */
test("recreating an imported file clears its dependent editor problem", async ({ workspace }) => {
  await workspace.importedEditor("use Book from \"./book.expec\"\ntype Basket { book: Book }", "type Book { title: Text }");
  await workspace.deleteImportedFile();
  await workspace.saveImportedText("type Book { title: Text }");
  await workspace.expectResolvedEditorProblem();
  await workspace.expectUnchangedEntryVersion();
});

/* @expec-test "28a2571f-aa60-46cb-8e30-d5d1561498fc" */
test("creating an initially missing import establishes live dependency feedback", async ({ workspace }) => {
  await workspace.missingImportedEditor("use Book from \"./book.expec\"\ntype Basket { book: Book }");
  await workspace.saveImportedText("type Magazine { title: Text }");
  await workspace.expectEditorSemanticCode("unresolved-reference");
  await workspace.expectEditorSyntaxProblem(1, 5, 1, 9);
  await workspace.expectUnchangedEntryVersion();
});

/* @expec-test "77b6a32d-a7b9-4e7d-83a9-8800473879c6" */
test("creating an initially missing import clears its editor problem", async ({ workspace }) => {
  await workspace.missingImportedEditor("use Book from \"./book.expec\"\ntype Basket { book: Book }");
  await workspace.saveImportedText("type Book { title: Text }");
  await workspace.expectResolvedEditorProblem();
  await workspace.expectUnchangedEntryVersion();
});
