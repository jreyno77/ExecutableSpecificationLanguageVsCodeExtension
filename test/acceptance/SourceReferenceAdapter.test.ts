import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "2fb17549-5cff-4ebf-832f-1fb5c6921f1c" */
test("Find References uses the current unsaved imported source and visibly declares its bounded coverage", async ({ workspace }) => {
  await workspace.importedReferenceEditor(workspace.nativeReferencesEntry, workspace.nativeReferencesBook);
  await workspace.editReferenceImport(workspace.nativeReferencesChangedBook);
  await workspace.findNativeReferences(2, 22);
  await workspace.showNativeReferenceCoverage();
  await workspace.expectNativeReferenceCount(3);
  await workspace.expectNativeReference(1, "book.expec", "Book", 4, 20, 24);
  await workspace.expectNativeReference(2, "entry.expec", "Book", 1, 5, 9);
  await workspace.expectNativeReference(3, "entry.expec", "Novel", 2, 21, 26);
  await workspace.expectVisibleReferenceCoverage();
  await workspace.expectCoveredReferenceFile("entry.expec");
  await workspace.expectCoveredReferenceFile("book.expec");
  await workspace.expectReferenceImportDirty();
  await workspace.expectNativeReferenceFilesUnchanged();
});

/* @expec-test "07735b6e-8f72-4437-a904-74a92c5ca14f" */
test("known references remain useful while the actual coverage view names an unavailable include", async ({ workspace }) => {
  await workspace.localReferenceEditor("type Book {}\ntype Basket { book: Book }");
  await workspace.editReferenceEntry("include \"./missing.expec\"\ntype Book {}\ntype Basket { book: Book }");
  await workspace.findNativeReferences(2, 6);
  await workspace.showNativeReferenceCoverage();
  await workspace.expectNativeReferenceCount(1);
  await workspace.expectNativeReference(1, "entry.expec", "Book", 3, 21, 25);
  await workspace.expectVisibleReferenceCoverage();
  await workspace.expectCoveredReferenceFile("entry.expec");
  await workspace.expectUnavailableNativeReferenceFile("missing.expec");
  await workspace.expectNativeReferencePrerequisite("unavailable-module");
  await workspace.expectReferenceEntryDirty();
  await workspace.expectNativeReferenceFilesUnchanged();
});

/* @expec-test "9eb4b30c-81a1-4f79-bfdd-ee7406cc7218" */
test("quoted astral references preserve CRLF UTF-16 ranges and reject a split surrogate position", async ({ workspace }) => {
  await workspace.referenceConversion("type `📚Book` {}\r\ntype Basket { book: `📚Book` }");
  await workspace.requestConvertedReferences(1, 23, true);
  await workspace.requestConvertedReferences(1, 22, true);
  await workspace.expectConvertedReferenceCount(1, 2);
  await workspace.expectConvertedReference(1, 1, "`📚Book`", 0, 5, 13);
  await workspace.expectConvertedReference(1, 2, "`📚Book`", 1, 20, 28);
  await workspace.expectNoConvertedReferenceSearch(2);
});
