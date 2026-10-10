import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "7480706c-7099-43f7-b9ef-c2d701ca50bc" */
test("the actual type scope offers Book and excludes another owner's local Bookcase", async ({ workspace }) => {
  await workspace.sourceCompletions();
  await workspace.openCompletionSource({ ["uri"]: "file:///workspace/basket.expec", ["text"]: "type Book {}\ncomponent Store {\n  local type Bookcase {}\n}\ntype Basket { book: Boo }" }, 1);
  await workspace.rememberCompletionWork();
  await workspace.requestTypeCompletion("file:///workspace/basket.expec", 1, 5, 24);
  await workspace.expectTypeCompletionAvailable(1, true);
  await workspace.expectTypeSuggestions(1, 1);
  await workspace.expectTypeSuggestion(1, 1, "Book", "Book", "Book");
  await workspace.expectTypeReplacement(1, "type Book {}\ncomponent Store {\n  local type Bookcase {}\n}\ntype Basket { book: Boo }", 5, 21, 24);
  await workspace.expectNoCompletionWork();
});

/* @expec-test "4f481cad-95a5-473a-bf9f-0d09bf81d6ef" */
test("an eligible imported alias keeps Novel distinct from its Book target", async ({ workspace }) => {
  await workspace.sourceCompletions();
  await workspace.saveCompletionSource({ ["uri"]: "file:///workspace/book.expec", ["text"]: "type Book {}" });
  await workspace.openCompletionSource({ ["uri"]: "file:///workspace/basket.expec", ["text"]: "use Book as Novel from \"./book.expec\"\ntype Basket { book: Nov }" }, 1);
  await workspace.requestTypeCompletion("file:///workspace/basket.expec", 1, 2, 24);
  await workspace.expectTypeSuggestions(1, 1);
  await workspace.expectTypeSuggestion(1, 1, "Novel", "Novel", "Book");
});

/* @expec-test "5f7a45c4-5a5b-481b-a0b4-52fc4665d76d" */
test("an own qualified type replaces only Boo while its Library prefix has no completion", async ({ workspace }) => {
  await workspace.sourceCompletions();
  await workspace.openCompletionSource({ ["uri"]: "file:///workspace/library.expec", ["text"]: "component Library {\n  local type Book {}\n  capability read(book: Library.Boo)\n}" }, 1);
  await workspace.requestTypeCompletion("file:///workspace/library.expec", 1, 3, 36);
  await workspace.requestTypeCompletion("file:///workspace/library.expec", 1, 3, 26);
  await workspace.expectTypeCompletionAvailable(1, true);
  await workspace.expectTypeSuggestions(1, 1);
  await workspace.expectTypeSuggestion(1, 1, "Book", "Book", "Book");
  await workspace.expectTypeReplacement(1, "component Library {\n  local type Book {}\n  capability read(book: Library.Boo)\n}", 3, 33, 36);
  await workspace.expectTypeCompletionAvailable(2, false);
  await workspace.expectTypeSuggestions(2, 0);
});

/* @expec-test "591ef922-f70c-44e0-b3d7-588ca6e14cbf" */
test("a current context with no matching spelling has a present empty reply", async ({ workspace }) => {
  await workspace.sourceCompletions();
  await workspace.openCompletionSource({ ["uri"]: "file:///workspace/basket.expec", ["text"]: "type Book {}\ntype Basket { book: Zoo }" }, 1);
  await workspace.requestTypeCompletion("file:///workspace/basket.expec", 1, 2, 24);
  await workspace.expectTypeCompletionAvailable(1, true);
  await workspace.expectTypeSuggestions(1, 0);
});

/* @expec-test "70c6b265-f384-4d4a-9239-1ac874809cde" */
test("a missing qualifier has no reply instead of falling back to global Book", async ({ workspace }) => {
  await workspace.sourceCompletions();
  await workspace.openCompletionSource({ ["uri"]: "file:///workspace/basket.expec", ["text"]: "type Book {}\ntype Basket { book: Missing.Boo }" }, 1);
  await workspace.requestTypeCompletion("file:///workspace/basket.expec", 1, 2, 32);
  await workspace.expectTypeCompletionAvailable(1, false);
  await workspace.expectTypeSuggestions(1, 0);
});

/* @expec-test "0c75ba08-319a-44e1-bf26-b7c86da67d91" */
test("a missing include retains deferred composition instead of inventing candidates", async ({ workspace }) => {
  await workspace.sourceCompletions();
  await workspace.openCompletionSource({ ["uri"]: "file:///workspace/basket.expec", ["text"]: "include \"./missing.expec\"\ntype Basket { book: Boo }" }, 1);
  await workspace.requestTypeCompletion("file:///workspace/basket.expec", 1, 2, 24);
  await workspace.expectTypeCompletionAvailable(1, false);
  await workspace.expectTypeSuggestions(1, 0);
});

/* @expec-test "992d3982-6dbb-4380-9991-6108c30bd69f" */
test("unsaved source replaces suggestions and an older version has none", async ({ workspace }) => {
  await workspace.sourceCompletions();
  await workspace.openCompletionSource({ ["uri"]: "file:///workspace/basket.expec", ["text"]: "type Book {}\ntype Basket { book: Boo }" }, 1);
  await workspace.requestTypeCompletion("file:///workspace/basket.expec", 1, 2, 24);
  await workspace.changeCompletionSource({ ["uri"]: "file:///workspace/basket.expec", ["text"]: "type Booklet {}\ntype Basket { book: Boo }" }, 2);
  await workspace.requestTypeCompletion("file:///workspace/basket.expec", 1, 2, 24);
  await workspace.requestTypeCompletion("file:///workspace/basket.expec", 2, 2, 24);
  await workspace.expectTypeSuggestion(1, 1, "Book", "Book", "Book");
  await workspace.expectTypeCompletionAvailable(2, false);
  await workspace.expectTypeSuggestions(2, 0);
  await workspace.expectTypeSuggestion(3, 1, "Booklet", "Booklet", "Booklet");
});

/* @expec-test "e3665115-965b-40be-a804-f6692e637b39" */
test("an unsaved imported replacement withdraws Book at the same entry version", async ({ workspace }) => {
  await workspace.sourceCompletions();
  await workspace.saveCompletionSource({ ["uri"]: "file:///workspace/book.expec", ["text"]: "type Book {}" });
  await workspace.openCompletionSource({ ["uri"]: "file:///workspace/basket.expec", ["text"]: "use Book from \"./book.expec\"\ntype Basket { book: Boo }" }, 1);
  await workspace.requestTypeCompletion("file:///workspace/basket.expec", 1, 2, 24);
  await workspace.openCompletionSource({ ["uri"]: "file:///workspace/book.expec", ["text"]: "type Magazine {}" }, 2);
  await workspace.requestTypeCompletion("file:///workspace/basket.expec", 1, 2, 24);
  await workspace.expectTypeSuggestion(1, 1, "Book", "Book", "Book");
  await workspace.expectTypeCompletionAvailable(2, true);
  await workspace.expectTypeSuggestions(2, 0);
});

/* @expec-test "05b755f7-7ebd-4c55-a9ba-a29bb6fa532c" */
test("ambiguous imported spellings do not choose the first Book", async ({ workspace }) => {
  await workspace.sourceCompletions();
  await workspace.saveCompletionSource({ ["uri"]: "file:///workspace/first.expec", ["text"]: "type Book {}" });
  await workspace.saveCompletionSource({ ["uri"]: "file:///workspace/second.expec", ["text"]: "type Book {}" });
  await workspace.openCompletionSource({ ["uri"]: "file:///workspace/basket.expec", ["text"]: "use Book from \"./first.expec\"\nuse Book from \"./second.expec\"\ntype Basket { book: Boo }" }, 1);
  await workspace.requestTypeCompletion("file:///workspace/basket.expec", 1, 3, 24);
  await workspace.expectTypeCompletionAvailable(1, true);
  await workspace.expectTypeSuggestions(1, 0);
});

/* @expec-test "60a0571b-6214-46e5-a15d-88e0a87159b2" */
test("rejected text withdraws old suggestions instead of using the previous model", async ({ workspace }) => {
  await workspace.sourceCompletions();
  await workspace.openCompletionSource({ ["uri"]: "file:///workspace/basket.expec", ["text"]: "type Book {}\ntype Basket { book: Boo }" }, 1);
  await workspace.requestTypeCompletion("file:///workspace/basket.expec", 1, 2, 24);
  await workspace.changeCompletionSource({ ["uri"]: "file:///workspace/basket.expec", ["text"]: "type Book {}\ntype Basket { book: Boo" }, 2);
  await workspace.requestTypeCompletion("file:///workspace/basket.expec", 2, 2, 24);
  await workspace.requestTypeCompletion("file:///workspace/basket.expec", 1, 2, 24);
  await workspace.expectTypeSuggestion(1, 1, "Book", "Book", "Book");
  await workspace.expectTypeCompletionAvailable(2, false);
  await workspace.expectTypeCompletionAvailable(3, false);
  await workspace.expectTypeSuggestions(2, 0);
  await workspace.expectTypeSuggestions(3, 0);
});

/* @expec-test "69e50747-57a1-44d6-b0d1-dcae3996558c" */
test("a promise string is not a type-completion context", async ({ workspace }) => {
  await workspace.sourceCompletions();
  await workspace.openCompletionSource({ ["uri"]: "file:///workspace/basket.expec", ["text"]: "type Book {}\nfunction publish() returns Text { promises \"Boo\" }" }, 1);
  await workspace.requestTypeCompletion("file:///workspace/basket.expec", 1, 2, 47);
  await workspace.expectTypeCompletionAvailable(1, false);
  await workspace.expectTypeSuggestions(1, 0);
});
