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
