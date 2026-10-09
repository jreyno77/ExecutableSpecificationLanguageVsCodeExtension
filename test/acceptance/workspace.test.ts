import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "86c9c5c3-29f0-41c9-9dcf-d2fe198fe8a4" */
test("an installed extension recognizes an expec file", async ({ workspace }) => {
  await workspace.preparedExpecEditor();
  await workspace.openSyntaxFile("library.expec", workspace.syntaxDeclaration);
  await workspace.expectEditorLanguage("expec");
});

/* @expec-test "16c759ca-4b61-4538-934e-76f161a2cefa" */
test("read declaration keywords and lexical names using theme scopes", async ({ workspace }) => {
  await workspace.preparedExpecGrammar();
  await workspace.tokenizeSyntax(workspace.syntaxDeclaration);
  await workspace.expectSyntaxScope(1, 1, "keyword.control.expec");
  await workspace.expectSyntaxScope(1, 6, "entity.name.expec");
});

/* @expec-test "5737763b-5684-4c90-99ba-a5e9cfa7c940" */
test("read quoted strings without interpreting their words as code", async ({ workspace }) => {
  await workspace.preparedExpecGrammar();
  await workspace.tokenizeSyntax(workspace.syntaxString);
  await workspace.expectSyntaxScope(3, 15, "string.quoted.double.expec");
  await workspace.expectSyntaxScope(3, 28, "string.quoted.double.expec");
});

/* @expec-test "8a796e7f-08cf-41ed-86d8-00e712bffd7b" */
test("read comments without carrying their scope into the next line", async ({ workspace }) => {
  await workspace.preparedExpecGrammar();
  await workspace.tokenizeSyntax(workspace.syntaxComment);
  await workspace.expectSyntaxScope(1, 4, "comment.line.expec");
  await workspace.expectSyntaxScope(2, 1, "keyword.control.expec");
});

/* @expec-test "8870195b-acee-464a-b82b-5bbf8a500f0e" */
test("read a quoted name containing keyword and comment text", async ({ workspace }) => {
  await workspace.preparedExpecGrammar();
  await workspace.tokenizeSyntax(workspace.syntaxQuotedName);
  await workspace.expectSyntaxScope(1, 10, "entity.name.expec");
  await workspace.expectSyntaxScope(1, 15, "entity.name.expec");
});

/* @expec-test "11c627ec-4800-49e6-9c81-dd6d3b8c5194" */
test("keep an unrelated file in its existing language", async ({ workspace }) => {
  await workspace.preparedExpecEditor();
  await workspace.openSyntaxFile("notes.txt", workspace.syntaxDeclaration);
  await workspace.expectEditorLanguage("plaintext");
});
