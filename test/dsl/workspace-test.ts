import { test as baseTest } from "vitest";
import { Workspace } from "./workspace.js";
import { WorkspaceDriver } from "../driver/workspace.js";
export const test = baseTest.extend("workspace", () => new Workspace(new WorkspaceDriver()));
