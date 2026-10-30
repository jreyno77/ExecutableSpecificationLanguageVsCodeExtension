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

/* @expec-test "ec43025a-3d2d-4bfa-ba20-9326433f916e" */
test("the dedicated expec view exposes connection actions and edits the selected manifest", async ({ workspace }) => {
  await workspace.connectionSidebar(workspace.configuredShop, ["shop"]);
  await workspace.openConnectionActivityBar();
  await workspace.openSidebarConnectionMenu();
  await workspace.editSidebarConnection();
  await workspace.deleteSidebarConnection(false);
  await workspace.expectDedicatedConnectionView(["Edit Connection", "New Connection", "Disconnect", "Delete Connection"]);
  await workspace.expectSidebarConnection("connected", "shop");
  await workspace.expectSidebarConfigurationPreserved(workspace.configuredShop, workspace.configuredShop);
  await workspace.expectSidebarTreesUntouched();
});

/* @expec-test "ab8de583-98a6-4241-b3cb-d8bb4d7a1243" */
test("guided new connection configures an empty target without scaffolding it", async ({ workspace }) => {
  await workspace.unconfiguredSidebar(["shop"]);
  await workspace.keepSidebarSource("src/model.expec", "type Book {}");
  await workspace.guideNewSidebarConnection("shop", workspace.sidebarNewOutputs, workspace.sidebarEntries);
  await workspace.expectSidebarConnection("connected", "shop");
  await workspace.expectSidebarSavedProject("shop");
  await workspace.expectSidebarSavedOutputs(["src/model.expec"], ["typescript", "uml"]);
  await workspace.expectSidebarSavedOutput("typescript", "{\"directory\":\".\",\"sourceRoot\":\".\"}");
  await workspace.expectSidebarSavedOutput("uml", "{\"directory\":\"diagrams\",\"views\":[\"structure\"]}");
  await workspace.expectSidebarTreesUntouched();
});

/* @expec-test "89fd6920-feaa-4c8d-84da-b4e69273e3c3" */
test("guided existing target retains authored settings and handwritten target files", async ({ workspace }) => {
  await workspace.connectionSidebar(workspace.managedShop, ["shop", "library"]);
  await workspace.keepSidebarTargetFile("library", "manual.txt", "Keep handwritten library");
  await workspace.guideNewSidebarConnection("library", workspace.sidebarRetainedOutputs, workspace.retainedSidebarEntries);
  await workspace.expectSidebarConnection("connected", "library");
  await workspace.expectSidebarSavedOutputs(["src/main.expec"], ["typescript", "markdown"]);
  await workspace.expectSidebarSavedOutput("typescript", "{\"configFile\":\"tsconfig.json\",\"directory\":\".\",\"sourceRoot\":\".\"}");
  await workspace.expectSidebarSavedOutput("markdown", "{\"directory\":\"docs\"}");
  await workspace.expectSidebarRetainedSettings("1.2.3", "[{\"alias\":\"storage\",\"name\":\"npm:storage\",\"phases\":[\"runtime\"],\"version\":\"1.0.0\"}]");
  await workspace.expectSidebarTreesUntouched();
});

/* @expec-test "0b400f21-e3a4-4452-9877-271c329d3ba6" */
test("cancelling guided output destination preserves the old saved connection", async ({ workspace }) => {
  await workspace.connectionSidebar(workspace.configuredShop, ["shop", "library"]);
  await workspace.cancelNewSidebarConnectionAtDestination("library", ["typescript", "uml"]);
  await workspace.expectSidebarConnection("connected", "shop");
  await workspace.expectSidebarConfigurationPreserved(workspace.configuredShop, workspace.configuredShop);
  await workspace.expectSidebarTreesUntouched();
});

/* @expec-test "96f336aa-7df0-485a-8bc1-3a06c004dd43" */
test("new and delete commands cannot overwrite dirty configuration", async ({ workspace }) => {
  await workspace.connectionSidebar(workspace.configuredShop, ["shop", "library"]);
  await workspace.editConfigurationWithoutSaving(workspace.configuredLibrary);
  await workspace.guideNewSidebarConnection("library", workspace.sidebarNewOutputs, workspace.retainedSidebarEntries);
  await workspace.deleteSidebarConnection(true);
  await workspace.expectSidebarConfigurationPreserved(workspace.configuredShop, workspace.configuredLibrary);
  await workspace.expectSidebarConnection("connected", "shop");
  await workspace.expectSidebarTreesUntouched();
});

/* @expec-test "b9f81988-9ab1-4496-971b-5f29f30f8b5d" */
test("session-only disconnect keeps authored previews and cannot be reversed by target events", async ({ workspace }) => {
  await workspace.connectionSidebar(workspace.previewShop, ["shop"]);
  await workspace.keepSidebarSource("src/model.expec", "type Book {}");
  await workspace.disconnectSidebarConnection();
  await workspace.removeSidebarProject("shop");
  await workspace.restoreSidebarProject("shop");
  await workspace.previewSidebarSource("src/model.expec");
  await workspace.expectSidebarConnection("disconnected", "shop");
  await workspace.expectSidebarSavedProject("shop");
  await workspace.expectSidebarPreviewDocument("markdown", "docs/pages/src/model.md", "type Book");
  await workspace.expectSidebarPreviewDocument("markdown", "docs/Home.md", "Home");
  await workspace.expectSidebarTreesUntouched();
});

/* @expec-test "341da8d6-b515-4a74-aedf-d228d686e3a2" */
test("reconnect verifies the latest saved target without rewriting configuration", async ({ workspace }) => {
  await workspace.connectionSidebar(workspace.configuredShop, ["shop", "library"]);
  await workspace.disconnectSidebarConnection();
  await workspace.saveSidebarConfiguration(workspace.configuredLibrary);
  await workspace.reconnectSidebarConnection();
  await workspace.expectSidebarConnection("connected", "library");
  await workspace.expectSidebarConfigurationPreserved(workspace.configuredLibrary, workspace.configuredLibrary);
  await workspace.expectSidebarTreesUntouched();
});

/* @expec-test "2bca2476-1690-4558-840d-9bc9a699e882" */
test("confirmed delete removes connection metadata but preserves output configuration and files", async ({ workspace }) => {
  await workspace.connectionSidebar(workspace.managedShop, ["shop"]);
  await workspace.keepSidebarTargetFile("shop", "manual.txt", "Keep handwritten shop");
  await workspace.deleteSidebarConnection(true);
  await workspace.expectSidebarConnection("unconfigured", "");
  await workspace.expectSidebarSavedProject("");
  await workspace.expectSidebarSavedOutputs(["src/main.expec"], ["typescript"]);
  await workspace.expectSidebarSavedOutput("typescript", "{\"configFile\":\"tsconfig.json\",\"directory\":\".\",\"sourceRoot\":\".\"}");
  await workspace.expectSidebarRetainedSettings("1.2.3", "[{\"alias\":\"storage\",\"name\":\"npm:storage\",\"phases\":[\"runtime\"],\"version\":\"1.0.0\"}]");
  await workspace.expectSidebarTreesUntouched();
});
