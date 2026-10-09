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

/* @expec-test "112a575f-ec6a-41ad-a3e2-98211f81b2f3" */
test("an unknown type is a semantic problem rather than invalid syntax", async ({ workspace }) => {
  await workspace.semanticAnalysis();
  await workspace.openSemanticSource({ ["uri"]: "untitled:Draft", ["text"]: "type Basket { book: Boook }" }, 1);
  await workspace.expectSemanticProblem("untitled:Draft", "unresolved-reference", 1, 21, 26);
  await workspace.expectNoSyntaxProblems("untitled:Draft", 1);
});

/* @expec-test "dc21fb46-bf61-441e-98b9-51c98027ba1b" */
test("fixing an unsaved unknown type produces a checked specification", async ({ workspace }) => {
  await workspace.semanticAnalysis();
  await workspace.openSemanticSource({ ["uri"]: "untitled:Draft", ["text"]: "type Basket { book: Boook }" }, 1);
  await workspace.changeSemanticSource({ ["uri"]: "untitled:Draft", ["text"]: "type Basket { book: Text }" }, 2);
  await workspace.expectCheckedSource("untitled:Draft");
  await workspace.expectSemanticPublications("untitled:Draft", 2, 2);
});

/* @expec-test "f574643a-d0e2-4f9d-b758-48bbb4fa28a0" */
test("a value incompatible with its declared field type is located", async ({ workspace }) => {
  await workspace.semanticAnalysis();
  await workspace.openSemanticSource({ ["uri"]: "untitled:Draft", ["text"]: "type Book { copies: Number = \"many\" }" }, 1);
  await workspace.expectSemanticProblem("untitled:Draft", "incompatible-type", 1, 30, 36);
  await workspace.expectNoSyntaxProblems("untitled:Draft", 1);
});

/* @expec-test "806cdfc1-09ac-4313-9ce5-83d4a1fbfce9" */
test("a supplied import permits checking the open entry", async ({ workspace }) => {
  await workspace.semanticAnalysis();
  await workspace.saveSemanticSource(workspace.book);
  await workspace.openSemanticSource(workspace.basket, 1);
  await workspace.expectCheckedSource((workspace.basket)["uri"]);
});

/* @expec-test "17ba62a9-9c8b-4157-a917-836f6dc852f9" */
test("changing an imported declaration updates an unchanged open entry", async ({ workspace }) => {
  await workspace.semanticAnalysis();
  await workspace.saveSemanticSource(workspace.book);
  await workspace.openSemanticSource(workspace.basket, 1);
  await workspace.saveSemanticSource(workspace.renamedBook);
  await workspace.expectSemanticProblem((workspace.basket)["uri"], "unresolved-reference", 1, 5, 9);
  await workspace.expectSemanticPublications((workspace.basket)["uri"], 2, 1);
});

/* @expec-test "89de018f-459e-4e6c-b3e6-f1fd4b3d018c" */
test("restoring an imported declaration clears the dependent problem", async ({ workspace }) => {
  await workspace.semanticAnalysis();
  await workspace.saveSemanticSource(workspace.book);
  await workspace.openSemanticSource(workspace.basket, 1);
  await workspace.saveSemanticSource(workspace.renamedBook);
  await workspace.saveSemanticSource(workspace.book);
  await workspace.expectCheckedSource((workspace.basket)["uri"]);
  await workspace.expectSemanticPublications((workspace.basket)["uri"], 3, 1);
});

/* @expec-test "a21731cf-877f-4113-aedf-a89a160c4eca" */
test("a missing import remains explicit", async ({ workspace }) => {
  await workspace.semanticAnalysis();
  await workspace.openSemanticSource(workspace.basket, 1);
  await workspace.expectSemanticProblem((workspace.basket)["uri"], "unavailable-module", 1, 5, 9);
});

/* @expec-test "90302a5f-9c7c-4ebc-aabc-c7c18762a5a5" */
test("creating a missing import checks the unchanged entry", async ({ workspace }) => {
  await workspace.semanticAnalysis();
  await workspace.openSemanticSource(workspace.basket, 1);
  await workspace.saveSemanticSource(workspace.book);
  await workspace.expectCheckedSource((workspace.basket)["uri"]);
  await workspace.expectSemanticPublications((workspace.basket)["uri"], 2, 1);
});

/* @expec-test "3735cff2-542b-41e4-a42b-641f445748cb" */
test("deleting an imported source invalidates the open entry", async ({ workspace }) => {
  await workspace.semanticAnalysis();
  await workspace.saveSemanticSource(workspace.book);
  await workspace.openSemanticSource(workspace.basket, 1);
  await workspace.removeSemanticSource((workspace.book)["uri"]);
  await workspace.expectSemanticProblem((workspace.basket)["uri"], "unavailable-module", 1, 5, 9);
});

/* @expec-test "0e94d1b7-e792-442f-b42a-bc7a54a8832d" */
test("unsaved imported text overrides saved changes", async ({ workspace }) => {
  await workspace.semanticAnalysis();
  await workspace.saveSemanticSource(workspace.book);
  await workspace.openSemanticSource(workspace.basket, 1);
  await workspace.openSemanticSource(workspace.renamedBook, 1);
  await workspace.saveSemanticSource(workspace.book);
  await workspace.expectSemanticProblem((workspace.basket)["uri"], "unresolved-reference", 1, 5, 9);
  await workspace.expectSemanticPublications((workspace.basket)["uri"], 2, 1);
});

/* @expec-test "261385e5-d237-4fc2-b9ae-667b2f0df0b0" */
test("closing an imported document restores its current saved text", async ({ workspace }) => {
  await workspace.semanticAnalysis();
  await workspace.saveSemanticSource(workspace.book);
  await workspace.openSemanticSource(workspace.basket, 1);
  await workspace.openSemanticSource(workspace.renamedBook, 1);
  await workspace.closeSemanticSource((workspace.book)["uri"]);
  await workspace.expectCheckedSource((workspace.basket)["uri"]);
});

/* @expec-test "ece60bfe-f271-455d-a830-52971a5e9674" */
test("invalid imported text never reuses an older accepted model", async ({ workspace }) => {
  await workspace.semanticAnalysis();
  await workspace.saveSemanticSource(workspace.book);
  await workspace.openSemanticSource(workspace.basket, 1);
  await workspace.saveSemanticSource({ ["uri"]: (workspace.book)["uri"], ["text"]: "type Book {" });
  await workspace.expectSemanticProblem((workspace.basket)["uri"], "unavailable-module", 1, 5, 9);
});

/* @expec-test "21e34a42-3a9e-48f7-a020-b43a033255f3" */
test("unrelated saved files do not republish an open entry", async ({ workspace }) => {
  await workspace.semanticAnalysis();
  await workspace.saveSemanticSource(workspace.book);
  await workspace.openSemanticSource(workspace.basket, 1);
  await workspace.saveSemanticSource({ ["uri"]: "file:///workspace/other.expec", ["text"]: "type Other { value: Text }" });
  await workspace.expectCheckedSource((workspace.basket)["uri"]);
  await workspace.expectSemanticPublications((workspace.basket)["uri"], 1, 1);
});

/* @expec-test "e8513432-3169-4e99-ac68-10575d90a529" */
test("an unavailable runtime package remains an explicit located problem", async ({ workspace }) => {
  await workspace.semanticAnalysis();
  await workspace.openSemanticSource({ ["uri"]: "untitled:Draft", ["text"]: "component Store { requires package \"storage\" for runtime }" }, 1);
  await workspace.expectSemanticProblem("untitled:Draft", "unavailable-package", 1, 36, 45);
});
