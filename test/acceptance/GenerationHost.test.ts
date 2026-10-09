import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "5c53cfed-92f4-4021-935b-fba7712fde65" */
test("an installed save generates all saved entries and preserves manual code", async ({ workspace }) => {
  await workspace.generationEditorWithOutputs(workspace.nativeGenerationLibrary, workspace.nativeGenerationShelf, false);
  await workspace.saveNativeGenerationOtherEntry("type Shelf { copies: Text }");
  await workspace.setNativeGenerationEnabled(true);
  await workspace.keepNativeGenerationImplementation("src/Library.ts", "return 41;");
  await workspace.editNativeGenerationSource(workspace.nativeGenerationAddition);
  await workspace.saveNativeGenerationSource();
  await workspace.awaitNativeGeneration();
  await workspace.expectNativeGenerationStatus("built");
  await workspace.expectNativeGenerationRuntime("24.19.0");
  await workspace.expectNativeGenerationFile("src/Library.ts", "title(): string");
  await workspace.expectNativeGenerationFile("src/Library.ts", "return 41;");
  await workspace.expectNativeGenerationFile("src/Shelf.ts", "copies: string;");
  await workspace.expectNativeGenerationFile("docs/Library.md", "title");
  await workspace.expectNativeGenerationDiagram("Library");
  await workspace.expectNativeGenerationDiagram("title()");
});

/* @expec-test "eb99e4ab-5e5d-46cb-9175-498ba2344431" */
test("typing alone starts no installed generation", async ({ workspace }) => {
  await workspace.generationEditor(workspace.nativeGenerationLibrary, workspace.nativeGenerationShelf, true);
  await workspace.editNativeGenerationSource(workspace.nativeGenerationAddition);
  await workspace.expectNativeGenerationUntouched();
});

/* @expec-test "b66dab52-3c91-45a6-9eb0-fbd2d36fff73" */
test("disabled installed generation preserves targets when saved", async ({ workspace }) => {
  await workspace.generationEditor(workspace.nativeGenerationLibrary, workspace.nativeGenerationShelf, false);
  await workspace.editNativeGenerationSource(workspace.nativeGenerationAddition);
  await workspace.saveNativeGenerationSource();
  await workspace.awaitNativeGeneration();
  await workspace.expectNativeGenerationStatus("disabled");
  await workspace.expectNativeGenerationUntouched();
});

/* @expec-test "760b5d99-0c4a-4a88-b2cd-e360603d28be" */
test("an actual hidden dirty target is refused without overwriting its buffer", async ({ workspace }) => {
  await workspace.generationEditor(workspace.nativeGenerationLibrary, workspace.nativeGenerationShelf, true);
  await workspace.dirtyHiddenGenerationTarget("src/Library.ts", "return 42;");
  await workspace.editNativeGenerationSource(workspace.nativeGenerationAddition);
  await workspace.saveNativeGenerationSource();
  await workspace.awaitNativeGeneration();
  await workspace.expectNativeGenerationDirtyRefusal("return 42;");
  await workspace.expectNativeGenerationUntouched();
});

/* @expec-test "a4184c1e-a8e5-4802-8684-965e883e8b95" */
test("an actual dirty other entry outside the target blocks installed generation", async ({ workspace }) => {
  await workspace.generationEditor(workspace.nativeGenerationLibrary, workspace.nativeGenerationShelf, true);
  await workspace.dirtyNativeGenerationOtherEntry("type Shelf { copies: Text }");
  await workspace.editNativeGenerationSource(workspace.nativeGenerationAddition);
  await workspace.saveNativeGenerationSource();
  await workspace.awaitNativeGeneration();
  await workspace.expectNativeGenerationDirtyRefusal("type Shelf { copies: Text }");
  await workspace.expectNativeGenerationUntouched();
});

/* @expec-test "1c36dade-3e01-4ecb-acc0-57d4f762ef81" */
test("generation opt-in does not transfer to another selected saved manifest", async ({ workspace }) => {
  await workspace.generationEditor(workspace.nativeGenerationLibrary, workspace.nativeGenerationShelf, true);
  await workspace.selectOtherGenerationConfiguration();
  await workspace.editNativeGenerationSource(workspace.nativeGenerationAddition);
  await workspace.saveNativeGenerationSource();
  await workspace.awaitNativeGeneration();
  await workspace.expectNativeGenerationStatus("disabled");
  await workspace.expectNativeGenerationUntouched();
});

/* @expec-test "b3e9a1cc-a3d5-4e3b-8424-8df51b890c1a" */
test("returning to the original selected saved manifest retains only its opt-in", async ({ workspace }) => {
  await workspace.generationEditor(workspace.nativeGenerationLibrary, workspace.nativeGenerationShelf, true);
  await workspace.selectOtherGenerationConfiguration();
  await workspace.selectOriginalGenerationConfiguration();
  await workspace.expectNativeGenerationStatus("idle");
  await workspace.expectNativeGenerationUntouched();
});

/* @expec-test "75fc9c9f-59ae-42fe-9a34-2ce8ba148ef3" */
test("a missing generation runtime is an actual visible launch failure", async ({ workspace }) => {
  await workspace.generationEditorWithoutRuntime(workspace.nativeGenerationLibrary);
  await workspace.editNativeGenerationSource(workspace.nativeGenerationAddition);
  await workspace.saveNativeGenerationSource();
  await workspace.awaitNativeGeneration();
  await workspace.expectNativeGenerationLaunchFailure("ENOENT");
  await workspace.expectNativeGenerationUntouched();
});
