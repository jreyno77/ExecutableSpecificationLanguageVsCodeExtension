import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "b8ebbc89-1a70-4d42-9c44-83b17016a0b9" */
test("locate a missing closing brace at the end of the supplied text", async ({ workspace }) => {
  await workspace.syntaxAnalysis();
  await workspace.openSource(workspace.broken, 1);
  await workspace.expectSyntaxProblem((workspace.broken)["uri"], 1, 3, 1);
});

/* @expec-test "49583ce1-3d61-45c3-b329-2e9b16b1dd35" */
test("correcting unsaved text replaces the previous syntax problem", async ({ workspace }) => {
  await workspace.syntaxAnalysis();
  await workspace.openSource(workspace.broken, 1);
  await workspace.changeSource(workspace.corrected, 2);
  await workspace.expectNoSyntaxProblems((workspace.corrected)["uri"], 2);
  await workspace.expectPublications((workspace.corrected)["uri"], 2);
});

/* @expec-test "31d054c1-3db9-4ff2-896d-278edb240aa9" */
test("older and duplicate document versions cannot replace current feedback", async ({ workspace }) => {
  await workspace.syntaxAnalysis();
  await workspace.openSource(workspace.broken, 1);
  await workspace.changeSource(workspace.corrected, 3);
  await workspace.changeSource(workspace.broken, 2);
  await workspace.changeSource(workspace.broken, 3);
  await workspace.expectNoSyntaxProblems((workspace.corrected)["uri"], 3);
  await workspace.expectPublications((workspace.corrected)["uri"], 2);
});

/* @expec-test "6376ba20-5be0-4d66-8dcb-6917061b0af6" */
test("closing clears feedback and ignores later document changes", async ({ workspace }) => {
  await workspace.syntaxAnalysis();
  await workspace.openSource(workspace.broken, 1);
  await workspace.closeSource((workspace.broken)["uri"]);
  await workspace.closeSource((workspace.broken)["uri"]);
  await workspace.changeSource(workspace.corrected, 2);
  await workspace.expectClears((workspace.broken)["uri"], 1);
  await workspace.expectPublications((workspace.broken)["uri"], 1);
});

/* @expec-test "33ec7eda-9715-46a2-83b7-299237a61812" */
test("reopening starts a new document lifetime with its own version", async ({ workspace }) => {
  await workspace.syntaxAnalysis();
  await workspace.openSource(workspace.broken, 10);
  await workspace.closeSource((workspace.broken)["uri"]);
  await workspace.openSource(workspace.corrected, 1);
  await workspace.expectNoSyntaxProblems((workspace.corrected)["uri"], 1);
  await workspace.expectPublications((workspace.corrected)["uri"], 2);
});

/* @expec-test "05800cd7-117f-49a3-b665-178f3e4fd1d5" */
test("syntax feedback does not claim that an unresolved type is invalid syntax", async ({ workspace }) => {
  await workspace.syntaxAnalysis();
  await workspace.openSource(workspace.other, 1);
  await workspace.expectNoSyntaxProblems((workspace.other)["uri"], 1);
});

/* @expec-test "a8b62c24-385c-47a2-b75b-b6a1053be1b3" */
test("closing one document leaves another document's feedback intact", async ({ workspace }) => {
  await workspace.syntaxAnalysis();
  await workspace.openSource(workspace.broken, 1);
  await workspace.openSource(workspace.other, 1);
  await workspace.closeSource((workspace.other)["uri"]);
  await workspace.expectSyntaxProblem((workspace.broken)["uri"], 1, 3, 1);
  await workspace.expectClears((workspace.broken)["uri"], 0);
  await workspace.expectClears((workspace.other)["uri"], 1);
});

/* @expec-test "219f05a2-5f4d-4be0-99fb-a322607933bb" */
test("reject negative document versions without publishing", async ({ workspace }) => {
  await workspace.syntaxAnalysis();
  await workspace.tryOpeningSource(workspace.broken, (-finiteNumber(1, "unary operand")));
  await workspace.expectInvalidVersionRejected();
  await workspace.expectPublications((workspace.broken)["uri"], 0);
});

/* @expec-test "1fd98525-3c17-4285-8758-3f35e177c9c7" */
test("reject fractional versions without changing existing feedback", async ({ workspace }) => {
  await workspace.syntaxAnalysis();
  await workspace.openSource(workspace.corrected, 1);
  await workspace.tryChangingSource(workspace.broken, 1.5);
  await workspace.expectInvalidVersionRejected();
  await workspace.expectNoSyntaxProblems((workspace.corrected)["uri"], 1);
  await workspace.expectPublications((workspace.corrected)["uri"], 1);
});
