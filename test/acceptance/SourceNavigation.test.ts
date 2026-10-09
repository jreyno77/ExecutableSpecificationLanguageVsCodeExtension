import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "28171631-6d2c-4c37-9c72-f3b3b40e78b7" */
test("a local type reference selects its actual authored name", async ({ workspace }) => {
  await workspace.sourceNavigation();
  await workspace.openNavigationSource(workspace.navigationLocal, 1);
  await workspace.requestSourceDefinition((workspace.navigationLocal)["uri"], 1, 2, 21);
  await workspace.expectSourceDefinition(1, (workspace.navigationLocal)["uri"], (workspace.navigationLocal)["text"], "Book", 1, 6, 10);
});

/* @expec-test "44c6fe7f-6fbe-45ed-8b01-0265bb927c18" */
test("quoted Unicode names retain their exact scalar name range", async ({ workspace }) => {
  await workspace.sourceNavigation();
  await workspace.openNavigationSource({ ["uri"]: (workspace.navigationLocal)["uri"], ["text"]: "type `📚Book` { title: Text }\ntype Basket { book: `📚Book` }" }, 1);
  await workspace.requestSourceDefinition((workspace.navigationLocal)["uri"], 1, 2, 23);
  await workspace.expectSourceDefinition(1, (workspace.navigationLocal)["uri"], "type `📚Book` { title: Text }\ntype Basket { book: `📚Book` }", "`📚Book`", 1, 6, 13);
});

/* @expec-test "2a7776b7-4f82-4d77-a511-736a311164ff" */
test("an imported reference selects the captured imported declaration", async ({ workspace }) => {
  await workspace.sourceNavigation();
  await workspace.saveNavigationSource(workspace.navigationBook);
  await workspace.openNavigationSource(workspace.navigationEntry, 1);
  await workspace.requestSourceDefinition((workspace.navigationEntry)["uri"], 1, 2, 21);
  await workspace.expectSourceDefinition(1, (workspace.navigationBook)["uri"], (workspace.navigationBook)["text"], "Book", 1, 6, 10);
});

/* @expec-test "4c5bd9c1-ff90-4a1f-b89f-2b01be7f2804" */
test("an unsaved imported edit supplies the current target after Unicode", async ({ workspace }) => {
  await workspace.sourceNavigation();
  await workspace.saveNavigationSource(workspace.navigationBook);
  await workspace.openNavigationSource(workspace.navigationEntry, 1);
  await workspace.openNavigationSource(workspace.navigationUnicodeBook, 2);
  await workspace.requestSourceDefinition((workspace.navigationEntry)["uri"], 1, 2, 21);
  await workspace.expectSourceDefinition(1, (workspace.navigationBook)["uri"], (workspace.navigationUnicodeBook)["text"], "Book", 3, 6, 10);
});

/* @expec-test "f2939e78-c0e4-4504-ac2a-ddcc58b006d3" */
test("a bound reference remains navigable with an independent semantic error", async ({ workspace }) => {
  await workspace.sourceNavigation();
  await workspace.openNavigationSource({ ["uri"]: (workspace.navigationLocal)["uri"], ["text"]: "type Book { title: Text }\ntype Basket { book: Book\n  missing: Unknown }" }, 1);
  await workspace.requestSourceDefinition((workspace.navigationLocal)["uri"], 1, 2, 21);
  await workspace.expectNavigationProblem((workspace.navigationLocal)["uri"], "unresolved-reference");
  await workspace.expectSourceDefinition(1, (workspace.navigationLocal)["uri"], "type Book { title: Text }\ntype Basket { book: Book\n  missing: Unknown }", "Book", 1, 6, 10);
});

/* @expec-test "f8b0223d-28d7-4535-849e-00b7b241efd9" */
test("an unresolved reference has no invented definition", async ({ workspace }) => {
  await workspace.sourceNavigation();
  await workspace.openNavigationSource({ ["uri"]: (workspace.navigationLocal)["uri"], ["text"]: "type Basket { book: Missing }" }, 1);
  await workspace.requestSourceDefinition((workspace.navigationLocal)["uri"], 1, 1, 21);
  await workspace.expectNavigationProblem((workspace.navigationLocal)["uri"], "unresolved-reference");
  await workspace.expectNoSourceDefinition(1);
});

/* @expec-test "7f39d951-fce8-4b0d-994e-ab97141402ba" */
test("ambiguous imported names do not choose the first declaration", async ({ workspace }) => {
  await workspace.sourceNavigation();
  await workspace.saveNavigationSource({ ["uri"]: "file:///workspace/shopping.expec", ["text"]: "type Cart {}" });
  await workspace.saveNavigationSource({ ["uri"]: "file:///workspace/shipping.expec", ["text"]: "type Cart {}" });
  await workspace.openNavigationSource({ ["uri"]: (workspace.navigationEntry)["uri"], ["text"]: "use Cart from \"./shopping.expec\"\nuse Cart from \"./shipping.expec\"\nfunction save(cart: Cart)" }, 1);
  await workspace.requestSourceDefinition((workspace.navigationEntry)["uri"], 1, 3, 21);
  await workspace.expectNavigationProblem((workspace.navigationEntry)["uri"], "ambiguous-reference");
  await workspace.expectNoSourceDefinition(1);
});

/* @expec-test "5f7f4cfe-cada-46ef-818c-61a3b5ec4c4f" */
test("a malformed edit withdraws the previous definition", async ({ workspace }) => {
  await workspace.sourceNavigation();
  await workspace.openNavigationSource(workspace.navigationLocal, 1);
  await workspace.requestSourceDefinition((workspace.navigationLocal)["uri"], 1, 2, 21);
  await workspace.changeNavigationSource({ ["uri"]: (workspace.navigationLocal)["uri"], ["text"]: "type Book { title: Text }\ntype Basket { book: Book " }, 2);
  await workspace.requestSourceDefinition((workspace.navigationLocal)["uri"], 2, 2, 21);
  await workspace.requestSourceDefinition((workspace.navigationLocal)["uri"], 1, 2, 21);
  await workspace.expectSourceDefinition(1, (workspace.navigationLocal)["uri"], (workspace.navigationLocal)["text"], "Book", 1, 6, 10);
  await workspace.expectNoSourceDefinition(2);
  await workspace.expectNoSourceDefinition(3);
});

/* @expec-test "fb259eb9-8ff1-4601-8b57-8aa6df50eaf5" */
test("an older requested version cannot navigate with newer text", async ({ workspace }) => {
  await workspace.sourceNavigation();
  await workspace.openNavigationSource(workspace.navigationLocal, 1);
  await workspace.changeNavigationSource({ ["uri"]: (workspace.navigationLocal)["uri"], ["text"]: "type Magazine { title: Text }\ntype Basket { book: Magazine }" }, 2);
  await workspace.requestSourceDefinition((workspace.navigationLocal)["uri"], 1, 2, 21);
  await workspace.requestSourceDefinition((workspace.navigationLocal)["uri"], 2, 2, 21);
  await workspace.expectNoSourceDefinition(1);
  await workspace.expectSourceDefinition(2, (workspace.navigationLocal)["uri"], "type Magazine { title: Text }\ntype Basket { book: Magazine }", "Magazine", 1, 6, 14);
});

/* @expec-test "bbe25e12-bbd3-401d-97f9-9db26b2d0adc" */
test("closing and reopening replaces the old report lifetime", async ({ workspace }) => {
  await workspace.sourceNavigation();
  await workspace.openNavigationSource(workspace.navigationLocal, 10);
  await workspace.closeNavigationSource((workspace.navigationLocal)["uri"]);
  await workspace.requestSourceDefinition((workspace.navigationLocal)["uri"], 10, 2, 21);
  await workspace.openNavigationSource(workspace.navigationLocal, 1);
  await workspace.requestSourceDefinition((workspace.navigationLocal)["uri"], 1, 2, 21);
  await workspace.expectNoSourceDefinition(1);
  await workspace.expectSourceDefinition(2, (workspace.navigationLocal)["uri"], (workspace.navigationLocal)["text"], "Book", 1, 6, 10);
});

/* @expec-test "8f98e8c9-f77e-4be7-af45-e5365dea272f" */
test("definition requests do not repeat parsing compilation or source acquisition", async ({ workspace }) => {
  await workspace.sourceNavigation();
  await workspace.saveNavigationSource(workspace.navigationBook);
  await workspace.openNavigationSource(workspace.navigationEntry, 1);
  await workspace.rememberNavigationWork();
  await workspace.requestSourceDefinition((workspace.navigationEntry)["uri"], 1, 2, 21);
  await workspace.requestSourceDefinition((workspace.navigationEntry)["uri"], 1, 2, 22);
  await workspace.expectSourceDefinition(1, (workspace.navigationBook)["uri"], (workspace.navigationBook)["text"], "Book", 1, 6, 10);
  await workspace.expectSourceDefinition(2, (workspace.navigationBook)["uri"], (workspace.navigationBook)["text"], "Book", 1, 6, 10);
  await workspace.expectNoNavigationAnalysis();
});

/* @expec-test "8911b0f9-c936-4317-9c6a-13f7b0560544" */
test("only the final segment of a qualified source reference has a definition", async ({ workspace }) => {
  await workspace.sourceNavigation();
  await workspace.openNavigationSource({ ["uri"]: (workspace.navigationLocal)["uri"], ["text"]: "component Store { public save\ncapability save() returns Nothing }\nexamples for Store.save {}" }, 1);
  await workspace.requestSourceDefinition((workspace.navigationLocal)["uri"], 1, 3, 20);
  await workspace.requestSourceDefinition((workspace.navigationLocal)["uri"], 1, 3, 14);
  await workspace.expectSourceDefinition(1, (workspace.navigationLocal)["uri"], "component Store { public save\ncapability save() returns Nothing }\nexamples for Store.save {}", "save", 2, 12, 16);
  await workspace.expectNoSourceDefinition(2);
});

/* @expec-test "e6f4b75b-e609-4317-8d4a-e1364653905c" */
test("a cursor on punctuation has no fabricated target", async ({ workspace }) => {
  await workspace.sourceNavigation();
  await workspace.openNavigationSource(workspace.navigationLocal, 1);
  await workspace.requestSourceDefinition((workspace.navigationLocal)["uri"], 1, 2, 19);
  await workspace.expectNoSourceDefinition(1);
});

/* @expec-test "55e06c74-a0bb-424a-a1b8-cc0829759122" */
test("a built-in type has no fabricated source declaration", async ({ workspace }) => {
  await workspace.sourceNavigation();
  await workspace.openNavigationSource(workspace.navigationLocal, 1);
  await workspace.requestSourceDefinition((workspace.navigationLocal)["uri"], 1, 2, 21);
  await workspace.requestSourceDefinition((workspace.navigationLocal)["uri"], 1, 1, 20);
  await workspace.expectSourceDefinition(1, (workspace.navigationLocal)["uri"], (workspace.navigationLocal)["text"], "Book", 1, 6, 10);
  await workspace.expectNoSourceDefinition(2);
});

/* @expec-test "6c9b43bf-00b8-4b3f-a05d-4a465de89a55" */
test("disposing withdraws all retained targets", async ({ workspace }) => {
  await workspace.sourceNavigation();
  await workspace.openNavigationSource(workspace.navigationLocal, 1);
  await workspace.disposeNavigation();
  await workspace.requestSourceDefinition((workspace.navigationLocal)["uri"], 1, 2, 21);
  await workspace.expectNoSourceDefinition(1);
});
