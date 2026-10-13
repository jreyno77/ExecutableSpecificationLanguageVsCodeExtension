import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "51253f7f-f5cf-40eb-bb5b-cbe8838f04f3" */
test("a missing configuration does not claim a connection", async ({ workspace }) => {
  await workspace.missingConnectionWorkspace(true);
  await workspace.inspectConnection();
  await workspace.expectConnection("unconfigured", "", "");
  await workspace.expectSaveRequests(0);
});

/* @expec-test "dcecdf58-7d9d-4879-a33b-e2ccad2f2e67" */
test("an existing configured directory has verified availability", async ({ workspace }) => {
  await workspace.connectionWorkspace(workspace.alphaConfiguration, true);
  await workspace.inspectConnection();
  await workspace.expectConnection("connected", "alpha", "alpha");
  await workspace.expectSaveRequests(0);
});

/* @expec-test "886ef730-6f12-4d29-a6a1-501da01af0c9" */
test("invalid configuration is reported without replacing it during setup", async ({ workspace }) => {
  await workspace.connectionWorkspace("{\"project\":", true);
  await workspace.inspectConnection();
  await workspace.chooseProjectDirectory("beta");
  await workspace.expectConnection("invalid", "", "");
  await workspace.expectConfigurationProblem();
});

/* @expec-test "72dc12bb-d253-4d96-acce-b9df8e97ced6" */
test("choosing a missing directory cannot save or claim a connection", async ({ workspace }) => {
  await workspace.missingConnectionWorkspace(true);
  await workspace.inspectConnection();
  await workspace.chooseProjectDirectory("missing");
  await workspace.expectConnection("unavailable", "missing", "");
  await workspace.expectSaveRequests(0);
  await workspace.expectUnwrittenConfiguration();
});

/* @expec-test "271b62da-a562-492f-91e0-21eb78fc86a7" */
test("choosing a verified directory requests a save without claiming persistence", async ({ workspace }) => {
  await workspace.missingConnectionWorkspace(true);
  await workspace.inspectConnection();
  await workspace.chooseProjectDirectory("alpha");
  await workspace.expectConnection("checking", "alpha", "");
  await workspace.expectSaveRequests(1);
  await workspace.expectRequestedProject("alpha");
  await workspace.expectUnwrittenConfiguration();
});

/* @expec-test "f3856cea-efa3-4d7d-a225-483b41dfe3e8" */
test("confirming the saved choice connects without changing other settings", async ({ workspace }) => {
  await workspace.connectionWorkspace(workspace.configuredSettings, true);
  await workspace.inspectConnection();
  await workspace.chooseProjectDirectory("beta");
  await workspace.confirmRequestedConfigurationSave();
  await workspace.expectConnection("connected", "beta", "beta");
  await workspace.expectSaveRequests(1);
  await workspace.expectRequestedProject("beta");
  await workspace.expectPreservedSettings("{\"formatVersion\":1,\"version\":\"1.2.3\",\"build\":{\"entries\":[\"src/library.expec\"]},\"outputs\":[],\"packages\":[{\"alias\":\"storage\",\"name\":\"npm:storage\",\"version\":\"1.0.0\",\"phases\":[\"runtime\"]}]}");
});

/* @expec-test "c899bf77-391d-4c1f-a328-e18afc8aaea7" */
test("a failed configuration save never claims the requested connection", async ({ workspace }) => {
  await workspace.missingConnectionWorkspace(true);
  await workspace.inspectConnection();
  await workspace.chooseProjectDirectory("alpha");
  await workspace.rejectRequestedConfigurationSave("Permission denied.");
  await workspace.expectConnection("unavailable", "alpha", "");
  await workspace.expectConnectionMessage("Permission denied.");
  await workspace.expectSaveRequests(1);
  await workspace.expectUnwrittenConfiguration();
});

/* @expec-test "b1db2156-d369-47e9-892b-abfe0e12575e" */
test("a disappearing configured directory becomes unavailable automatically", async ({ workspace }) => {
  await workspace.connectionWorkspace(workspace.alphaConfiguration, true);
  await workspace.inspectConnection();
  await workspace.makeProjectUnavailable("alpha");
  await workspace.expectConnection("unavailable", "alpha", "");
  await workspace.expectSaveRequests(0);
});

/* @expec-test "b0f52d4d-9cc0-4b7d-9cd4-1f7f36cb4373" */
test("restoring the configured directory recovers after its unavailable state", async ({ workspace }) => {
  await workspace.connectionWorkspace(workspace.alphaConfiguration, true);
  await workspace.inspectConnection();
  await workspace.makeProjectUnavailable("alpha");
  await workspace.restoreProjectDirectory("alpha");
  await workspace.expectRecoveredConnection();
  await workspace.expectSaveRequests(0);
});

/* @expec-test "344429e7-bd68-4110-af85-aaa62f22ff5d" */
test("configuration changes select the new target and ignore old target events", async ({ workspace }) => {
  await workspace.connectionWorkspace(workspace.alphaConfiguration, true);
  await workspace.inspectConnection();
  await workspace.replaceConnectionConfiguration(workspace.betaConfiguration);
  await workspace.makeProjectUnavailable("alpha");
  await workspace.expectConnection("connected", "beta", "beta");
  await workspace.expectConnectionPublications(4);
  await workspace.expectSaveRequests(0);
});

/* @expec-test "68c97ce1-0d1b-464e-9018-38786945043c" */
test("choosing another project cannot overwrite unsaved configuration edits", async ({ workspace }) => {
  await workspace.connectionWorkspace(workspace.alphaConfiguration, false);
  await workspace.inspectConnection();
  await workspace.chooseProjectDirectory("beta");
  await workspace.expectConnection("connected", "alpha", "alpha");
  await workspace.expectConnectionMessage("Save or revert unsaved configuration edits before choosing a project.");
  await workspace.expectSaveRequests(0);
});

/* @expec-test "8ee4d668-b947-4b61-8725-37b88509d069" */
test("new connection metadata uses selected sources and preserves an empty target", async ({ workspace }) => {
  await workspace.missingConnectionWorkspace(true);
  await workspace.keepConnectionSource("src/model.expec", "type Book {}");
  await workspace.inspectConnection();
  await workspace.attachConnectionWorkObserver();
  await workspace.createProjectConnection("alpha", workspace.simpleConnectionOutputs, workspace.connectionEntries);
  await workspace.confirmRequestedConfigurationSave();
  await workspace.expectConnection("connected", "alpha", "alpha");
  await workspace.expectSaveRequests(1);
  await workspace.expectSavedConnection(["src/model.expec"], ["typescript", "uml"]);
  await workspace.expectSavedConnectionOutput("typescript", "{\"directory\":\".\",\"sourceRoot\":\".\"}");
  await workspace.expectSavedConnectionOutput("uml", "{\"directory\":\"diagrams\",\"views\":[\"structure\"]}");
  await workspace.expectConnectionWork("alpha");
  await workspace.expectConnectionTreesUntouched();
});

/* @expec-test "01bdf71f-dd9c-47c9-ba3f-b85dd7aa54a1" */
test("new target and output choices retain existing advanced options and packages", async ({ workspace }) => {
  await workspace.connectionWorkspace(workspace.retainedConnectionSettings, true);
  await workspace.keepConnectionTargetFile("beta", "manual.txt", "Keep handwritten beta");
  await workspace.inspectConnection();
  await workspace.createProjectConnection("beta", workspace.retainedConnectionOutputs, workspace.unchangedConnectionEntries);
  await workspace.confirmRequestedConfigurationSave();
  await workspace.expectConnection("connected", "beta", "beta");
  await workspace.expectSavedConnection(["src/library.expec"], ["typescript", "java", "markdown"]);
  await workspace.expectSavedConnectionOutput("typescript", "{\"configFile\":\"tsconfig.json\",\"directory\":\".\",\"sourceRoot\":\".\"}");
  await workspace.expectSavedConnectionOutput("java", "{\"directory\":\"java\",\"package\":\"example.library\"}");
  await workspace.expectSavedConnectionOutput("markdown", "{\"directory\":\"docs\"}");
  await workspace.expectSavedConnectionSettings("1.2.3", "[{\"alias\":\"storage\",\"name\":\"npm:storage\",\"phases\":[\"runtime\"],\"version\":\"1.0.0\"}]");
  await workspace.expectConnectionTreesUntouched();
});

/* @expec-test "bb7c799f-a452-4f94-bf72-1b5769597eb7" */
test("new metadata needs real chosen source entries rather than a guessed filename", async ({ workspace }) => {
  await workspace.missingConnectionWorkspace(true);
  await workspace.inspectConnection();
  await workspace.createProjectConnection("alpha", workspace.simpleConnectionOutputs, workspace.unchangedConnectionEntries);
  await workspace.expectSaveRequests(0);
  await workspace.expectConfigurationProblem();
  await workspace.expectUnwrittenConfiguration();
  await workspace.expectConnectionTreesUntouched();
});

/* @expec-test "dc2ad069-7584-4513-814c-2e5b71beb36a" */
test("an advanced profile cannot be newly configured with guessed options", async ({ workspace }) => {
  await workspace.missingConnectionWorkspace(true);
  await workspace.inspectConnection();
  await workspace.createProjectConnection("alpha", [{ ["id"]: "java", ["directory"]: "java" }], workspace.connectionEntries);
  await workspace.expectSaveRequests(0);
  await workspace.expectConfigurationProblem();
  await workspace.expectUnwrittenConfiguration();
});

/* @expec-test "f3fd95d8-8ed6-4e5c-a424-c5dbb1140f81" */
test("dirty metadata refuses new connection and deletion without replacing saved settings", async ({ workspace }) => {
  await workspace.connectionWorkspace(workspace.alphaConfiguration, false);
  await workspace.inspectConnection();
  await workspace.createProjectConnection("beta", workspace.simpleConnectionOutputs, workspace.connectionEntries);
  await workspace.deleteProjectConnection();
  await workspace.expectConnection("connected", "alpha", "alpha");
  await workspace.expectSaveRequests(0);
  await workspace.expectConnectionSavedText(workspace.alphaConfiguration);
  await workspace.expectConnectionTreesUntouched();
});

/* @expec-test "fef50511-b674-49db-a16b-89c9a6b76040" */
test("disconnect is session-only and watcher restoration cannot silently resume work", async ({ workspace }) => {
  await workspace.connectionWorkspace(workspace.alphaConfiguration, true);
  await workspace.inspectConnection();
  await workspace.attachConnectionWorkObserver();
  await workspace.disconnectProjectConnection();
  await workspace.makeProjectUnavailable("alpha");
  await workspace.restoreProjectDirectory("alpha");
  await workspace.expectConnection("disconnected", "alpha", "");
  await workspace.expectConnectionWork("");
  await workspace.expectSaveRequests(0);
  await workspace.expectConnectionSavedText(workspace.alphaConfiguration);
});

/* @expec-test "2b453286-c675-41ef-9037-90e7fa143102" */
test("reconnection checks the latest saved target without changing metadata", async ({ workspace }) => {
  await workspace.connectionWorkspace(workspace.alphaConfiguration, true);
  await workspace.inspectConnection();
  await workspace.attachConnectionWorkObserver();
  await workspace.disconnectProjectConnection();
  await workspace.replaceConnectionConfiguration(workspace.betaConfiguration);
  await workspace.reconnectProjectConnection();
  await workspace.expectConnection("connected", "beta", "beta");
  await workspace.expectConnectionWork("beta");
  await workspace.expectSaveRequests(0);
  await workspace.expectConnectionSavedText(workspace.betaConfiguration);
  await workspace.expectConnectionTreesUntouched();
});

/* @expec-test "8b440988-89b6-48f3-9e2f-fb5c5c1187b0" */
test("deleting a connection removes only project metadata and withdraws work", async ({ workspace }) => {
  await workspace.connectionWorkspace(workspace.retainedConnectionSettings, true);
  await workspace.keepConnectionTargetFile("alpha", "manual.txt", "Keep handwritten alpha");
  await workspace.inspectConnection();
  await workspace.attachConnectionWorkObserver();
  await workspace.deleteProjectConnection();
  await workspace.confirmRequestedConfigurationSave();
  await workspace.expectConnection("unconfigured", "", "");
  await workspace.expectConnectionWork("");
  await workspace.expectSaveRequests(1);
  await workspace.expectSavedConnection(["src/library.expec"], ["typescript", "java"]);
  await workspace.expectSavedConnectionOutput("typescript", "{\"configFile\":\"tsconfig.json\",\"directory\":\".\",\"sourceRoot\":\".\"}");
  await workspace.expectSavedConnectionOutput("java", "{\"directory\":\"java\",\"package\":\"example.library\"}");
  await workspace.expectSavedConnectionSettings("1.2.3", "[{\"alias\":\"storage\",\"name\":\"npm:storage\",\"phases\":[\"runtime\"],\"version\":\"1.0.0\"}]");
  await workspace.expectConnectionTreesUntouched();
});

/* @expec-test "c55044fa-6212-418c-9159-5993bc6842e2" */
test("guidance distinguishes missing metadata from an unsaved proposed connection", async ({ workspace }) => {
  await workspace.missingConnectionWorkspace(true);
  await workspace.keepConnectionSource("src/model.expec", "type Book {}");
  await workspace.inspectConnection();
  await workspace.createProjectConnection("alpha", workspace.simpleConnectionOutputs, workspace.connectionEntries);
  await workspace.inspectConnectionGuidance();
  await workspace.expectConnectionGuidance(1, true, false, workspace.freshGuidanceOutputs);
  await workspace.expectGuidanceSavedSnapshot(1);
  await workspace.expectGuidanceNoEffects(1);
  await workspace.expectSaveRequests(1);
  await workspace.expectUnwrittenConfiguration();
});

/* @expec-test "81017081-d974-48a9-8c83-235bab35a970" */
test("guidance retains configured profile order and only suggests genuinely new profiles", async ({ workspace }) => {
  await workspace.connectionWorkspace(workspace.retainedConnectionSettings, true);
  await workspace.inspectConnection();
  await workspace.inspectConnectionGuidance();
  await workspace.expectConnectionGuidance(1, false, true, workspace.retainedGuidanceOutputs);
  await workspace.expectGuidanceSavedSnapshot(1);
  await workspace.expectGuidanceNoEffects(1);
  await workspace.expectSaveRequests(0);
});

/* @expec-test "25378f7c-b870-4489-a91e-f8a58846f20b" */
test("invalid metadata and disposed selection withdraw earlier usable guidance", async ({ workspace }) => {
  await workspace.connectionWorkspace(workspace.alphaConfiguration, true);
  await workspace.inspectConnection();
  await workspace.inspectConnectionGuidance();
  await workspace.replaceConnectionConfiguration("{\"project\":");
  await workspace.inspectConnectionGuidance();
  await workspace.disposeConnectionController();
  await workspace.inspectConnectionGuidance();
  await workspace.expectGuidanceAvailability(1, true);
  await workspace.expectGuidanceAvailability(2, false);
  await workspace.expectGuidanceAvailability(3, false);
  await workspace.expectGuidanceNoEffects(1);
  await workspace.expectGuidanceNoEffects(2);
  await workspace.expectGuidanceNoEffects(3);
  await workspace.expectSaveRequests(0);
});
