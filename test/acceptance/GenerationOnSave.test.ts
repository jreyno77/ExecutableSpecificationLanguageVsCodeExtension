import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "1a93a42e-07d6-4422-baa6-07e629c51a8c" */
test("saving one entry generates the complete configured saved build", async ({ workspace }) => {
  await workspace.savedGenerationWorkspace("type Book { title: Text }", workspace.generationOtherEntry, false);
  await workspace.saveGenerationOtherEntry("type Shelf { copies: Text }");
  await workspace.setGenerationEnabled(true);
  await workspace.editGenerationSource("type Book { title: Number }");
  await workspace.saveGenerationSource();
  await workspace.awaitGenerationSettlement();
  await workspace.expectGenerationStatus("built");
  await workspace.expectGenerationFile("src/Book.ts", "title: number;");
  await workspace.expectGenerationFile("src/Shelf.ts", "copies: string;");
});

/* @expec-test "d1af7523-adff-4d10-a956-1ac426875b7a" */
test("a saved contract addition preserves its handwritten implementation", async ({ workspace }) => {
  await workspace.savedGenerationWorkspace(workspace.generationLibraryInitial, workspace.generationOtherEntry, true);
  await workspace.keepGenerationImplementation("src/Library.ts", "return 41;");
  await workspace.editGenerationSource(workspace.generationLibraryChanged);
  await workspace.saveGenerationSource();
  await workspace.awaitGenerationSettlement();
  await workspace.expectGenerationStatus("built");
  await workspace.expectGenerationFile("src/Library.ts", "title(): string");
  await workspace.expectGenerationFile("src/Library.ts", "return 41;");
});

/* @expec-test "e376a245-54af-440a-b252-db9d5497eb01" */
test("typing alone starts no full generation", async ({ workspace }) => {
  await workspace.savedGenerationWorkspace("type Book { title: Text }", workspace.generationOtherEntry, true);
  await workspace.editGenerationSource("type Book { title: Number }");
  await workspace.expectGenerationUntouched(0);
});

/* @expec-test "40b24d8e-99ff-4fe0-9538-62e519a06f1e" */
test("a disabled connection does not generate when saved", async ({ workspace }) => {
  await workspace.savedGenerationWorkspace("type Book { title: Text }", workspace.generationOtherEntry, false);
  await workspace.editGenerationSource("type Book { title: Number }");
  await workspace.saveGenerationSource();
  await workspace.awaitGenerationSettlement();
  await workspace.expectGenerationStatus("disabled");
  await workspace.expectGenerationUntouched(0);
});

/* @expec-test "3d70e5e4-cd9f-493f-9cc5-49bc2dbb4a23" */
test("a save notification cannot substitute text that is not saved", async ({ workspace }) => {
  await workspace.savedGenerationWorkspace("type Book { title: Text }", workspace.generationOtherEntry, true);
  await workspace.requestGenerationSaveSnapshot("type Book { title: Number }", 1);
  await workspace.awaitGenerationSettlement();
  await workspace.expectGenerationRefused();
  await workspace.expectGenerationUntouched(0);
});

/* @expec-test "fd8786ca-dd59-4144-afd0-7df2b0aba803" */
test("a changed saved manifest cannot be replaced by the selected old snapshot", async ({ workspace }) => {
  await workspace.savedGenerationWorkspace("type Book { title: Text }", workspace.generationOtherEntry, true);
  await workspace.replaceGenerationSavedConfiguration("{\"formatVersion\":1,\"version\":\"0.1.0\",\"project\":{\"root\":\"target\"},\"build\":{\"entries\":[\"authoring/main.expec\"]},\"outputs\":[]}");
  await workspace.editGenerationSource("type Book { title: Number }");
  await workspace.saveGenerationSource();
  await workspace.awaitGenerationSettlement();
  await workspace.expectGenerationRefused();
  await workspace.expectGenerationUntouched(0);
});

/* @expec-test "31bf575e-df32-4607-87d5-3bab28b02b17" */
test("a dirty other configured entry outside the target blocks a selected save", async ({ workspace }) => {
  await workspace.savedGenerationWorkspace("type Book { title: Text }", workspace.generationOtherEntry, true);
  await workspace.dirtyGenerationOtherEntry("type Shelf { copies: Text }");
  await workspace.editGenerationSource("type Book { title: Number }");
  await workspace.saveGenerationSource();
  await workspace.awaitGenerationSettlement();
  await workspace.expectGenerationRefused();
  await workspace.expectGenerationUntouched(0);
});

/* @expec-test "b2580441-a989-43f1-ad9b-65514c9c997e" */
test("saving an unrelated authored file starts no configured build", async ({ workspace }) => {
  await workspace.savedGenerationWorkspace("type Book { title: Text }", workspace.generationOtherEntry, true);
  await workspace.saveUnrelatedGenerationSource("type Outside { label: Text }");
  await workspace.awaitGenerationSettlement();
  await workspace.expectGenerationUntouched(0);
});

/* @expec-test "abc40c75-eb6b-4b91-b94b-5fc42373b753" */
test("a target dirtied before an outstanding permission check prevents application", async ({ workspace }) => {
  await workspace.heldGenerationWorkspace(workspace.generationLibraryInitial, workspace.generationOtherEntry);
  await workspace.editGenerationSource(workspace.generationLibraryChanged);
  await workspace.saveGenerationSource();
  await workspace.awaitGenerationPermission();
  await workspace.dirtyGenerationTarget("src/Library.ts", "return 42;");
  await workspace.releaseGenerationPermission();
  await workspace.awaitGenerationSettlement();
  await workspace.expectGenerationRefused();
  await workspace.expectGenerationUntouched(1);
  await workspace.expectGenerationDirtyText("return 42;");
});
