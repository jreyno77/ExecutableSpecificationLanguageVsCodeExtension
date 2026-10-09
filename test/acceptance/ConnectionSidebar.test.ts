import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "d203e11f-38d4-488f-b73b-ee8c0c0bc40b" */
test("choose an existing project and see its verified directory connection", async ({ workspace }) => {
  await workspace.unconfiguredSidebar(["shop"]);
  await workspace.chooseProjectInSidebar("shop");
  await workspace.expectSidebarConnection("connected", "shop");
  await workspace.expectSidebarSavedProject("shop");
});

/* @expec-test "bd162285-15a8-4902-9bce-76015ee1430e" */
test("a configured but initially missing project is shown as unavailable", async ({ workspace }) => {
  await workspace.connectionSidebar(workspace.configuredShop, []);
  await workspace.observeSidebar();
  await workspace.expectSidebarConnection("unavailable", "shop");
  await workspace.expectSidebarSavedProject("shop");
});

/* @expec-test "1571cbdd-76e9-4873-bc34-07d0ae7448ca" */
test("creating an initially missing project updates its status automatically", async ({ workspace }) => {
  await workspace.connectionSidebar(workspace.configuredShop, []);
  await workspace.observeSidebar();
  await workspace.restoreSidebarProject("shop");
  await workspace.expectSidebarConnection("connected", "shop");
  await workspace.expectSidebarSavedProject("shop");
});

/* @expec-test "3bb21c19-9b4c-4b52-8740-b95138d7213f" */
test("an unavailable project replaces the previous connected sidebar status", async ({ workspace }) => {
  await workspace.connectionSidebar(workspace.configuredShop, ["shop"]);
  await workspace.removeSidebarProject("shop");
  await workspace.expectSidebarConnection("unavailable", "shop");
});

/* @expec-test "9e42e7f1-9fe7-4c76-8301-6ed70947a47d" */
test("restoring the project recovers status without a refresh action", async ({ workspace }) => {
  await workspace.connectionSidebar(workspace.configuredShop, ["shop"]);
  await workspace.removeSidebarProject("shop");
  await workspace.restoreSidebarProject("shop");
  await workspace.expectSidebarConnection("connected", "shop");
});

/* @expec-test "8c10a8bd-4794-4c51-9de3-dcb833f63f79" */
test("a saved configuration follows its new project instead of the old target", async ({ workspace }) => {
  await workspace.connectionSidebar(workspace.configuredShop, ["shop", "library"]);
  await workspace.saveSidebarConfiguration(workspace.configuredLibrary);
  await workspace.removeSidebarProject("shop");
  await workspace.expectSidebarConnection("connected", "library");
});

/* @expec-test "bec4796b-945b-4f3a-87e8-239e223b55a9" */
test("choosing a project cannot overwrite an unsaved configuration edit", async ({ workspace }) => {
  await workspace.connectionSidebar(workspace.configuredShop, ["shop", "library"]);
  await workspace.editConfigurationWithoutSaving(workspace.configuredLibrary);
  await workspace.chooseProjectInSidebar("library");
  await workspace.expectSidebarConfigurationPreserved(workspace.configuredShop, workspace.configuredLibrary);
  await workspace.expectSidebarConnection("connected", "shop");
});
