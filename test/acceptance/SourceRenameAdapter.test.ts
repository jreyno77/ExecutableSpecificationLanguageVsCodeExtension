import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "fd98792a-d8c6-4832-83b8-57cba25bd700" */
test("native rename applies the real versioned edit to both current author buffers", async ({ workspace }) => {
  await workspace.nativeRenameProject("type Book {}", "use Book from \"./book.expec\"\ntype Basket { book: Book }");
  await workspace.prepareNativeRename(1, 6);
  await workspace.applyNativeRename(1, 6, "Publication");
  await workspace.expectNativeRenamePrepared("Book");
  await workspace.expectNativeRenameText("type Publication {}", "use Publication from \"./book.expec\"\ntype Basket { book: Publication }");
  await workspace.expectUnsavedNativeRename();
});

/* @expec-test "52bee8aa-995f-4ac1-be67-1db38feaadc7" */
test("native rename reports a collision and applies no partial edit", async ({ workspace }) => {
  await workspace.nativeRenameProject("type Book {}\ntype Publication {}", "use Book from \"./book.expec\"\ntype Basket { book: Book }");
  await workspace.applyNativeRename(1, 6, "Publication");
  await workspace.expectNativeRenameRefused("Publication");
  await workspace.expectNativeRenameText("type Book {}\ntype Publication {}", "use Book from \"./book.expec\"\ntype Basket { book: Book }");
});
