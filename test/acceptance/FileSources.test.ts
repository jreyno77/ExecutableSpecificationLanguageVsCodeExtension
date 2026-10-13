import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "eaa8b697-f612-4526-bb13-f2a2b0cf4d44" */
test("native source ownership keeps the primary root path through nested folders", async ({ workspace }) => {
  await workspace.scopeFileDirectory();
  await workspace.keepScopeSource("src/ui/view.expec", "type Book {}");
  await workspace.queryScopePath("src/ui/view.expec");
  await workspace.expectNativeScopePath("src/ui/view.expec");
});

/* @expec-test "25f2c825-3594-403a-954a-69a33e06d74e" */
test("native ownership permits a named unsaved source without creating its contents", async ({ workspace }) => {
  await workspace.scopeFileDirectory();
  await workspace.keepScopeFolder("src/ui");
  await workspace.queryScopePath("src/ui/new.expec");
  await workspace.expectNativeScopePath("src/ui/new.expec");
  await workspace.expectNamedSourceNotCreated();
});

/* @expec-test "81364ba0-2154-4780-be6f-a3ff3fd153e8" */
test("a native link escaping the authoring root has no guessed local scope", async ({ workspace }) => {
  await workspace.scopeFileDirectory();
  await workspace.keepEscapingScopeLink("src/escape", "view.expec", "type Outside { title: Text }");
  await workspace.queryScopePath("src/escape/view.expec");
  await workspace.expectNoNativeScopePath();
});
