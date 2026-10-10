import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "e469cd68-4a72-4eea-80cb-631a7326cdea" */
test("a callable reference shows its declared default failure and own promises without repeating analysis", async ({ workspace }) => {
  await workspace.sourceHovers();
  await workspace.openHoverSource(workspace.hoverCallable, 1);
  await workspace.rememberHoverWork();
  await workspace.requestDeclarationHover((workspace.hoverCallable)["uri"], 1, 10, 20);
  await workspace.requestDeclarationHover((workspace.hoverCallable)["uri"], 1, 10, 22);
  await workspace.expectDeclarationHover(1, workspace.hoverCallable, "save", "capability save(title: Text, copies: Number = 1) returns Boolean fails with SaveFailure", "Save the requested title.\n\nKeep existing copies.", 10, 20, 24);
  await workspace.expectDeclarationHover(2, workspace.hoverCallable, "save", "capability save(title: Text, copies: Number = 1) returns Boolean fails with SaveFailure", "Save the requested title.\n\nKeep existing copies.", 10, 20, 24);
  await workspace.expectNoHoverAnalysis();
});

/* @expec-test "52016653-e4c1-403a-882b-493c257badc5" */
test("hovering the callable declaration name selects the requesting authored name", async ({ workspace }) => {
  await workspace.sourceHovers();
  await workspace.openHoverSource(workspace.hoverCallable, 1);
  await workspace.requestDeclarationHover((workspace.hoverCallable)["uri"], 1, 5, 15);
  await workspace.expectDeclarationHover(1, workspace.hoverCallable, "save", "capability save(title: Text, copies: Number = 1) returns Boolean fails with SaveFailure", "Save the requested title.\n\nKeep existing copies.", 5, 14, 18);
});

/* @expec-test "714d8e79-12d8-4e83-b72a-e396ed8f940c" */
test("quoted Unicode names and decoded promises preserve actual text and scalar ranges", async ({ workspace }) => {
  await workspace.sourceHovers();
  await workspace.openHoverSource(workspace.hoverUnicode, 1);
  await workspace.requestDeclarationHover((workspace.hoverUnicode)["uri"], 1, 7, 24);
  await workspace.expectDeclarationHover(1, workspace.hoverUnicode, "`📚save`", "capability `📚save`(title: Text) returns Text", "Store \"Bibliothèque\".\nKeep 📚.", 7, 22, 29);
});

/* @expec-test "6a4991f9-59f5-4bb4-8c8b-40e56f9299bf" */
test("an unsaved imported declaration replaces the hover at the same entry version", async ({ workspace }) => {
  await workspace.sourceHovers();
  await workspace.saveHoverSource(workspace.hoverSavedFunction);
  await workspace.openHoverSource(workspace.hoverEntry, 1);
  await workspace.requestDeclarationHover((workspace.hoverEntry)["uri"], 1, 2, 15);
  await workspace.openHoverSource(workspace.hoverUnsavedFunction, 2);
  await workspace.requestDeclarationHover((workspace.hoverEntry)["uri"], 1, 2, 15);
  await workspace.expectDeclarationHover(1, workspace.hoverEntry, "publish", "function publish(title: Text) returns Boolean", "Publish the title.", 2, 14, 21);
  await workspace.expectDeclarationHover(2, workspace.hoverEntry, "publish", "function publish(title: Text, copies: Number = 1) returns Text", "Publish current unsaved copies.", 2, 14, 21);
});

/* @expec-test "ebb9b77a-f1ed-46e6-8810-5285759aa57d" */
test("an independent semantic error does not suppress a current bound brief type header", async ({ workspace }) => {
  await workspace.sourceHovers();
  await workspace.openHoverSource({ ["uri"]: (workspace.hoverCatalog)["uri"], ["text"]: "type Book { title: Text }\ntype Basket { book: Book\n  missing: Unknown }" }, 1);
  await workspace.requestDeclarationHover((workspace.hoverCatalog)["uri"], 1, 2, 22);
  await workspace.expectHoverProblem((workspace.hoverCatalog)["uri"], "unresolved-reference");
  await workspace.expectDeclarationHover(1, { ["uri"]: (workspace.hoverCatalog)["uri"], ["text"]: "type Book { title: Text }\ntype Basket { book: Book\n  missing: Unknown }" }, "Book", "type Book", "", 2, 21, 25);
});

/* @expec-test "3a2b3d9f-845a-420d-b22d-dd21da07f499" */
test("alias and opaque type references show finite whole authored declarations", async ({ workspace }) => {
  await workspace.sourceHovers();
  await workspace.openHoverSource({ ["uri"]: (workspace.hoverCatalog)["uri"], ["text"]: "type Titles = List<Text>\nopaque type Token<T>\nfunction read(titles: Titles, token: Token<Text>)" }, 1);
  await workspace.requestDeclarationHover((workspace.hoverCatalog)["uri"], 1, 3, 24);
  await workspace.requestDeclarationHover((workspace.hoverCatalog)["uri"], 1, 3, 40);
  await workspace.expectDeclarationHover(1, { ["uri"]: (workspace.hoverCatalog)["uri"], ["text"]: "type Titles = List<Text>\nopaque type Token<T>\nfunction read(titles: Titles, token: Token<Text>)" }, "Titles", "type Titles = List<Text>", "", 3, 23, 29);
  await workspace.expectDeclarationHover(2, { ["uri"]: (workspace.hoverCatalog)["uri"], ["text"]: "type Titles = List<Text>\nopaque type Token<T>\nfunction read(titles: Titles, token: Token<Text>)" }, "Token", "opaque type Token<T>", "", 3, 38, 43);
});

/* @expec-test "e28247eb-5c5c-40b1-b17f-481d460d1c33" */
test("containers and records show brief name prefixes without dumping bodies or guessing generic headers", async ({ workspace }) => {
  await workspace.sourceHovers();
  await workspace.openHoverSource(workspace.hoverDeclarations, 1);
  await workspace.requestDeclarationHover((workspace.hoverDeclarations)["uri"], 1, 1, 12);
  await workspace.requestDeclarationHover((workspace.hoverDeclarations)["uri"], 1, 2, 10);
  await workspace.requestDeclarationHover((workspace.hoverDeclarations)["uri"], 1, 3, 8);
  await workspace.requestDeclarationHover((workspace.hoverDeclarations)["uri"], 1, 4, 12);
  await workspace.requestDeclarationHover((workspace.hoverDeclarations)["uri"], 1, 5, 7);
  await workspace.expectDeclarationHover(1, workspace.hoverDeclarations, "Shelf", "component Shelf", "", 1, 11, 16);
  await workspace.expectDeclarationHover(2, workspace.hoverDeclarations, "Book", "concept Book", "", 2, 9, 13);
  await workspace.expectDeclarationHover(3, workspace.hoverDeclarations, "Library", "class Library", "", 3, 7, 14);
  await workspace.expectDeclarationHover(4, workspace.hoverDeclarations, "Reader", "interface Reader", "", 4, 11, 17);
  await workspace.expectDeclarationHover(5, workspace.hoverDeclarations, "Box", "type Box", "", 5, 6, 9);
});

/* @expec-test "c7cc54aa-893e-4c1b-b310-9591231b27c9" */
test("field and parameter declaration names show their finite declared types and defaults", async ({ workspace }) => {
  await workspace.sourceHovers();
  await workspace.openHoverSource({ ["uri"]: (workspace.hoverCatalog)["uri"], ["text"]: "type Book { title: Text = \"Draft\" }\nfunction read(title: Text = \"Untitled\") returns Text" }, 1);
  await workspace.requestDeclarationHover((workspace.hoverCatalog)["uri"], 1, 1, 14);
  await workspace.requestDeclarationHover((workspace.hoverCatalog)["uri"], 1, 2, 17);
  await workspace.expectDeclarationHover(1, { ["uri"]: (workspace.hoverCatalog)["uri"], ["text"]: "type Book { title: Text = \"Draft\" }\nfunction read(title: Text = \"Untitled\") returns Text" }, "title", "title: Text = \"Draft\"", "", 1, 13, 18);
  await workspace.expectDeclarationHover(2, { ["uri"]: (workspace.hoverCatalog)["uri"], ["text"]: "type Book { title: Text = \"Draft\" }\nfunction read(title: Text = \"Untitled\") returns Text" }, "title", "title: Text = \"Untitled\"", "", 2, 15, 20);
});

/* @expec-test "e55efcbc-c3a7-4b23-b879-b820639a304c" */
test("an unresolved reference has no fabricated signature", async ({ workspace }) => {
  await workspace.sourceHovers();
  await workspace.openHoverSource({ ["uri"]: (workspace.hoverCatalog)["uri"], ["text"]: "type Basket { book: Missing }" }, 1);
  await workspace.requestDeclarationHover((workspace.hoverCatalog)["uri"], 1, 1, 22);
  await workspace.expectHoverProblem((workspace.hoverCatalog)["uri"], "unresolved-reference");
  await workspace.expectNoDeclarationHover(1);
});

/* @expec-test "667f4d89-bea7-4f15-ab5d-19aaa8e506dc" */
test("ambiguous imports do not choose the first declaration", async ({ workspace }) => {
  await workspace.sourceHovers();
  await workspace.saveHoverSource({ ["uri"]: "file:///workspace/shopping.expec", ["text"]: "type Cart {}" });
  await workspace.saveHoverSource({ ["uri"]: "file:///workspace/shipping.expec", ["text"]: "type Cart {}" });
  await workspace.openHoverSource({ ["uri"]: (workspace.hoverEntry)["uri"], ["text"]: "use Cart from \"./shopping.expec\"\nuse Cart from \"./shipping.expec\"\nfunction save(cart: Cart)" }, 1);
  await workspace.requestDeclarationHover((workspace.hoverEntry)["uri"], 1, 3, 21);
  await workspace.expectHoverProblem((workspace.hoverEntry)["uri"], "ambiguous-reference");
  await workspace.expectNoDeclarationHover(1);
});

/* @expec-test "74dd0f76-2fc8-4b88-878b-c55375bae26e" */
test("a bound builtin shows its exact name without invented documentation", async ({ workspace }) => {
  await workspace.sourceHovers();
  await workspace.openHoverSource(workspace.hoverCatalog, 1);
  await workspace.requestDeclarationHover((workspace.hoverCatalog)["uri"], 1, 1, 21);
  await workspace.expectDeclarationHover(1, workspace.hoverCatalog, "Text", "Text", "", 1, 20, 24);
});

/* @expec-test "39177cd9-e016-4db0-a89a-07b9da5486f4" */
test("qualified prefixes punctuation and the half-open end do not select a hover", async ({ workspace }) => {
  await workspace.sourceHovers();
  await workspace.openHoverSource(workspace.hoverCallable, 1);
  await workspace.requestDeclarationHover((workspace.hoverCallable)["uri"], 1, 10, 20);
  await workspace.requestDeclarationHover((workspace.hoverCallable)["uri"], 1, 10, 14);
  await workspace.requestDeclarationHover((workspace.hoverCallable)["uri"], 1, 10, 19);
  await workspace.requestDeclarationHover((workspace.hoverCallable)["uri"], 1, 10, 24);
  await workspace.expectDeclarationHover(1, workspace.hoverCallable, "save", "capability save(title: Text, copies: Number = 1) returns Boolean fails with SaveFailure", "Save the requested title.\n\nKeep existing copies.", 10, 20, 24);
  await workspace.expectNoDeclarationHover(2);
  await workspace.expectNoDeclarationHover(3);
  await workspace.expectNoDeclarationHover(4);
});

/* @expec-test "83efa7ca-f302-4f86-9858-d36e2d414f57" */
test("a rejected edit withdraws previous hovers for both current and old requested versions", async ({ workspace }) => {
  await workspace.sourceHovers();
  await workspace.openHoverSource(workspace.hoverCatalog, 1);
  await workspace.requestDeclarationHover((workspace.hoverCatalog)["uri"], 1, 2, 22);
  await workspace.changeHoverSource({ ["uri"]: (workspace.hoverCatalog)["uri"], ["text"]: "type Book { title: Text }\ntype Basket { book: Book " }, 2);
  await workspace.requestDeclarationHover((workspace.hoverCatalog)["uri"], 2, 2, 22);
  await workspace.requestDeclarationHover((workspace.hoverCatalog)["uri"], 1, 2, 22);
  await workspace.expectDeclarationHover(1, workspace.hoverCatalog, "Book", "type Book", "", 2, 21, 25);
  await workspace.expectNoDeclarationHover(2);
  await workspace.expectNoDeclarationHover(3);
});

/* @expec-test "f5309b6f-0306-4d2a-97c3-209d5fd5c460" */
test("closing and reopening starts a new lower-version lifetime", async ({ workspace }) => {
  await workspace.sourceHovers();
  await workspace.openHoverSource(workspace.hoverCatalog, 10);
  await workspace.closeHoverSource((workspace.hoverCatalog)["uri"]);
  await workspace.requestDeclarationHover((workspace.hoverCatalog)["uri"], 10, 2, 22);
  await workspace.openHoverSource(workspace.hoverCatalog, 1);
  await workspace.requestDeclarationHover((workspace.hoverCatalog)["uri"], 10, 2, 22);
  await workspace.requestDeclarationHover((workspace.hoverCatalog)["uri"], 1, 2, 22);
  await workspace.expectNoDeclarationHover(1);
  await workspace.expectNoDeclarationHover(2);
  await workspace.expectDeclarationHover(3, workspace.hoverCatalog, "Book", "type Book", "", 2, 21, 25);
});

/* @expec-test "e6cacdcf-c89b-4a8b-9d2c-17333a60dfd0" */
test("disposal withdraws hovers and ignores later current publications", async ({ workspace }) => {
  await workspace.sourceHovers();
  await workspace.openHoverSource(workspace.hoverCatalog, 1);
  await workspace.disposeSourceHovers();
  await workspace.changeHoverSource({ ["uri"]: (workspace.hoverCatalog)["uri"], ["text"]: "type Magazine { title: Text }\ntype Basket { book: Magazine }" }, 2);
  await workspace.requestDeclarationHover((workspace.hoverCatalog)["uri"], 2, 2, 22);
  await workspace.expectNoDeclarationHover(1);
});
