import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "d64ea7f2-f3ca-42d0-a23d-dfedab5b2343" */
test("the installed type provider offers Book and its returned edit changes only the unsaved token", async ({ workspace }) => {
  await workspace.completionEditor("type Book {}\ncomponent Store {\n  local type Bookcase {}\n}\ntype Basket { book: Boo }");
  await workspace.requestNativeTypeCompletion(5, 24);
  await workspace.applyNativeTypeSuggestion(1, 1);
  await workspace.expectNativeTypeSuggestions(1, 1);
  await workspace.expectNativeTypeEdit(1, 1, "Book", "Book", 5, 21, 24);
  await workspace.expectNativeCompletionText("type Book {}\ncomponent Store {\n  local type Bookcase {}\n}\ntype Basket { book: Book }", "type Book {}\ncomponent Store {\n  local type Bookcase {}\n}\ntype Basket { book: Boo }", true);
  await workspace.expectNoCompletionProjectWrites();
});

/* @expec-test "3099ee46-6573-43dc-8407-ed8db210e338" */
test("an unsaved declaration changes current provider suggestions and rejected text withdraws them", async ({ workspace }) => {
  await workspace.completionEditor("type Book {}\ntype Basket { book: Boo }");
  await workspace.requestNativeTypeCompletion(2, 24);
  await workspace.editCompletionWithoutSaving("type Booklet {}\ntype Basket { book: Boo }");
  await workspace.requestNativeTypeCompletion(2, 24);
  await workspace.editCompletionWithoutSaving("type Booklet {}\ntype Basket { book: Boo");
  await workspace.requestNativeTypeCompletion(2, 24);
  await workspace.expectNativeTypeEdit(1, 1, "Book", "Book", 2, 21, 24);
  await workspace.expectNativeTypeEdit(2, 1, "Booklet", "Booklet", 2, 21, 24);
  await workspace.expectNativeTypeSuggestions(3, 0);
  await workspace.expectNativeCompletionText("type Booklet {}\ntype Basket { book: Boo", "type Book {}\ntype Basket { book: Boo }", true);
  await workspace.expectNoCompletionProjectWrites();
});

/* @expec-test "8bfa7726-7709-4575-b87f-35e0770bacd2" */
test("the real provider preserves quoted Unicode names and UTF-16 replacement bounds", async ({ workspace }) => {
  await workspace.completionEditor("type `📚Book` {}\r\ntype Basket { book: `📚B` }");
  await workspace.requestNativeTypeCompletion(2, 26);
  await workspace.expectNativeTypeSuggestions(1, 1);
  await workspace.expectNativeTypeEdit(1, 1, "📚Book", "`📚Book`", 2, 21, 26);
  await workspace.expectNoCompletionProjectWrites();
});

/* @expec-test "6a907519-3a53-4133-af01-55833ad220f4" */
test("protocol completion preserves the whole quoted token after CRLF and an astral character", async ({ workspace }) => {
  await workspace.completionConversion("type `📚Book` {}\r\ntype Basket { book: `📚B` }");
  await workspace.requestConvertedTypeCompletion(1, 25);
  await workspace.expectConvertedTypeEdit(1, "📚Book", "`📚Book`", 20, 25);
});

/* @expec-test "12572119-4896-4d06-9c8b-71cebb8d6ced" */
test("malformed native positions cannot clamp into a type suggestion", async ({ workspace }) => {
  await workspace.completionConversion("type `📚Book` {}\r\ntype Basket { book: `📚B` }");
  await workspace.requestConvertedTypeCompletion(1, 22);
  await workspace.requestConvertedTypeCompletion(1, 999);
  await workspace.requestConvertedTypeCompletion(1, 25.5);
  await workspace.requestConvertedTypeCompletion((-finiteNumber(1, "unary operand")), 25);
  await workspace.expectNoConvertedTypeItems(1);
  await workspace.expectNoConvertedTypeItems(2);
  await workspace.expectNoConvertedTypeItems(3);
  await workspace.expectNoConvertedTypeItems(4);
});
