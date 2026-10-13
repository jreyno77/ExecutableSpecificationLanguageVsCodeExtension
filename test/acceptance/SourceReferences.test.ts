import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "2e4cd773-56b8-4ae9-9994-2f9cf65e49df" */
test("a declaration finds its bound use and includes its own range only when requested", async ({ workspace }) => {
  await workspace.sourceReferences();
  await workspace.openReferenceSource(workspace.referencesLocal, 1);
  await workspace.rememberReferenceWork();
  await workspace.requestSourceReferences((workspace.referencesLocal)["uri"], 1, 1, 6, false);
  await workspace.requestSourceReferences((workspace.referencesLocal)["uri"], 1, 2, 22, true);
  await workspace.expectReferenceCount(1, 1);
  await workspace.expectReferenceLocation(1, 1, (workspace.referencesLocal)["uri"], (workspace.referencesLocal)["text"], "Book", 2, 21, 25);
  await workspace.expectReferenceCount(2, 2);
  await workspace.expectReferenceLocation(2, 1, (workspace.referencesLocal)["uri"], (workspace.referencesLocal)["text"], "Book", 1, 6, 10);
  await workspace.expectReferenceLocation(2, 2, (workspace.referencesLocal)["uri"], (workspace.referencesLocal)["text"], "Book", 2, 21, 25);
  await workspace.expectReferenceCoverage(2, [(workspace.referencesLocal)["uri"]]);
  await workspace.expectNoReferenceAnalysis();
});

/* @expec-test "303461f1-8bf2-4954-bd56-d459ce90cfd5" */
test("an imported alias finds every actual use of the same declaration in the captured closure", async ({ workspace }) => {
  await workspace.sourceReferences();
  await workspace.saveReferenceSource(workspace.referencesBook);
  await workspace.openReferenceSource(workspace.referencesEntry, 1);
  await workspace.requestSourceReferences((workspace.referencesEntry)["uri"], 1, 2, 22, false);
  await workspace.expectReferenceCount(1, 3);
  await workspace.expectReferenceLocation(1, 1, (workspace.referencesEntry)["uri"], (workspace.referencesEntry)["text"], "Book", 1, 5, 9);
  await workspace.expectReferenceLocation(1, 2, (workspace.referencesEntry)["uri"], (workspace.referencesEntry)["text"], "Novel", 2, 21, 26);
  await workspace.expectReferenceLocation(1, 3, (workspace.referencesBook)["uri"], (workspace.referencesBook)["text"], "Book", 2, 20, 24);
  await workspace.expectReferenceCoverage(1, [(workspace.referencesEntry)["uri"], (workspace.referencesBook)["uri"]]);
});

/* @expec-test "c5dc9978-af6a-4403-bc3a-45925304cea9" */
test("another same-named declaration is not a reference to the selected Book", async ({ workspace }) => {
  await workspace.sourceReferences();
  await workspace.openReferenceSource({ ["uri"]: (workspace.referencesLocal)["uri"], ["text"]: "type Book {}\ncomponent Store {\n  local type Book {}\n  capability stock(book: Book)\n}\ntype Basket { book: Book }" }, 1);
  await workspace.requestSourceReferences((workspace.referencesLocal)["uri"], 1, 1, 6, false);
  await workspace.expectReferenceCount(1, 1);
  await workspace.expectReferenceLocation(1, 1, (workspace.referencesLocal)["uri"], "type Book {}\ncomponent Store {\n  local type Book {}\n  capability stock(book: Book)\n}\ntype Basket { book: Book }", "Book", 6, 21, 25);
});

/* @expec-test "3e71ec94-1ea8-40bf-96e3-3ad71323baf5" */
test("an unused declaration has a present empty search rather than an unavailable result", async ({ workspace }) => {
  await workspace.sourceReferences();
  await workspace.openReferenceSource({ ["uri"]: (workspace.referencesLocal)["uri"], ["text"]: "type Book {}" }, 1);
  await workspace.requestSourceReferences((workspace.referencesLocal)["uri"], 1, 1, 6, false);
  await workspace.requestSourceReferences((workspace.referencesLocal)["uri"], 1, 1, 6, true);
  await workspace.expectReferenceCount(1, 0);
  await workspace.expectReferenceCount(2, 1);
  await workspace.expectReferenceLocation(2, 1, (workspace.referencesLocal)["uri"], "type Book {}", "Book", 1, 6, 10);
});

/* @expec-test "de8b0760-e386-4b8e-b75c-a61eb2a94d34" */
test("unsaved replacement withdraws the old version and uses actual new captured text", async ({ workspace }) => {
  await workspace.sourceReferences();
  await workspace.openReferenceSource(workspace.referencesLocal, 1);
  await workspace.requestSourceReferences((workspace.referencesLocal)["uri"], 1, 1, 6, false);
  await workspace.changeReferenceSource({ ["uri"]: (workspace.referencesLocal)["uri"], ["text"]: "type Magazine {}\ntype Basket { book: Magazine }" }, 2);
  await workspace.requestSourceReferences((workspace.referencesLocal)["uri"], 1, 1, 6, false);
  await workspace.requestSourceReferences((workspace.referencesLocal)["uri"], 2, 1, 6, false);
  await workspace.expectReferenceCount(1, 1);
  await workspace.expectNoReferenceSearch(2);
  await workspace.expectReferenceCount(3, 1);
  await workspace.expectReferenceLocation(3, 1, (workspace.referencesLocal)["uri"], "type Magazine {}\ntype Basket { book: Magazine }", "Magazine", 2, 21, 29);
});

/* @expec-test "2a910776-2460-4958-adf8-7ac4b4c730b8" */
test("an imported unsaved replacement invalidates the same-version entry binding", async ({ workspace }) => {
  await workspace.sourceReferences();
  await workspace.saveReferenceSource(workspace.referencesBook);
  await workspace.openReferenceSource(workspace.referencesEntry, 1);
  await workspace.requestSourceReferences((workspace.referencesEntry)["uri"], 1, 2, 22, false);
  await workspace.openReferenceSource({ ["uri"]: (workspace.referencesBook)["uri"], ["text"]: "type Magazine {}" }, 2);
  await workspace.requestSourceReferences((workspace.referencesEntry)["uri"], 1, 2, 22, false);
  await workspace.expectReferenceCount(1, 3);
  await workspace.expectNoReferenceSearch(2);
});

/* @expec-test "41f84555-98d8-45cc-986d-9df6bed338b5" */
test("an ambiguous selected use does not choose one imported declaration", async ({ workspace }) => {
  await workspace.sourceReferences();
  await workspace.saveReferenceSource({ ["uri"]: "file:///workspace/first.expec", ["text"]: "type Book {}" });
  await workspace.saveReferenceSource({ ["uri"]: "file:///workspace/second.expec", ["text"]: "type Book {}" });
  await workspace.openReferenceSource({ ["uri"]: (workspace.referencesEntry)["uri"], ["text"]: "use Book from \"./first.expec\"\nuse Book from \"./second.expec\"\ntype Basket { book: Book }" }, 1);
  await workspace.requestSourceReferences((workspace.referencesEntry)["uri"], 1, 3, 22, false);
  await workspace.expectNoReferenceSearch(1);
});

/* @expec-test "eb279a6c-af82-4eb3-8583-43992e10213f" */
test("known matches expose unavailable composition coverage without claiming an exhaustive search", async ({ workspace }) => {
  await workspace.sourceReferences();
  await workspace.openReferenceSource({ ["uri"]: (workspace.referencesLocal)["uri"], ["text"]: "include \"./missing.expec\"\ntype Book {}\ntype Basket { book: Book }" }, 1);
  await workspace.requestSourceReferences((workspace.referencesLocal)["uri"], 1, 2, 6, false);
  await workspace.expectReferenceCount(1, 1);
  await workspace.expectReferenceLocation(1, 1, (workspace.referencesLocal)["uri"], "include \"./missing.expec\"\ntype Book {}\ntype Basket { book: Book }", "Book", 3, 21, 25);
  await workspace.expectReferenceCoverage(1, [(workspace.referencesLocal)["uri"]]);
  await workspace.expectUnavailableReferenceSource(1, "file:///workspace/missing.expec");
  await workspace.expectReferencePrerequisite(1, "unavailable-module");
  await workspace.expectDeferredReferenceCoverage(1);
});

/* @expec-test "c915225a-ba4f-405f-9fde-debcffc5747a" */
test("deferred and rejected edits plus close and disposal never reuse earlier matches", async ({ workspace }) => {
  await workspace.sourceReferences();
  await workspace.openReferenceSource(workspace.referencesLocal, 10);
  await workspace.requestSourceReferences((workspace.referencesLocal)["uri"], 10, 1, 6, false);
  await workspace.changeReferenceSource({ ["uri"]: (workspace.referencesLocal)["uri"], ["text"]: "include \"./missing.expec\"\ntype Basket { book: Boo }" }, 11);
  await workspace.requestSourceReferences((workspace.referencesLocal)["uri"], 11, 2, 22, false);
  await workspace.changeReferenceSource({ ["uri"]: (workspace.referencesLocal)["uri"], ["text"]: "type Book {}\ntype Basket { book: Book " }, 12);
  await workspace.requestSourceReferences((workspace.referencesLocal)["uri"], 12, 2, 22, false);
  await workspace.requestSourceReferences((workspace.referencesLocal)["uri"], 10, 1, 6, false);
  await workspace.closeReferenceSource((workspace.referencesLocal)["uri"]);
  await workspace.openReferenceSource(workspace.referencesLocal, 1);
  await workspace.requestSourceReferences((workspace.referencesLocal)["uri"], 1, 1, 6, false);
  await workspace.closeReferenceSource((workspace.referencesLocal)["uri"]);
  await workspace.requestSourceReferences((workspace.referencesLocal)["uri"], 1, 1, 6, false);
  await workspace.openReferenceSource(workspace.referencesLocal, 1);
  await workspace.disposeReferences();
  await workspace.requestSourceReferences((workspace.referencesLocal)["uri"], 1, 1, 6, false);
  await workspace.expectReferenceCount(1, 1);
  await workspace.expectNoReferenceSearch(2);
  await workspace.expectNoReferenceSearch(3);
  await workspace.expectNoReferenceSearch(4);
  await workspace.expectReferenceCount(5, 1);
  await workspace.expectNoReferenceSearch(6);
  await workspace.expectNoReferenceSearch(7);
});
