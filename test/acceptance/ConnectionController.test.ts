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
