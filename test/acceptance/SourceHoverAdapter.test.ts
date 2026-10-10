import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "f99104a2-7e1e-45a4-be2a-bf57d4e78a2c" */
test("a quoted type reference shows a readable declaration with its real editor range", async ({ workspace }) => {
  await workspace.localHoverEditor("type `📚Book` { title: Text }\ntype Basket { book: `📚Book` }");
  await workspace.requestNativeHover(2, 24);
  await workspace.expectNativeHover("```expec\ntype `📚Book`\n```", "`📚Book`", 2, 21, 29);
  await workspace.expectHoverFilesUnchanged();
});

/* @expec-test "c1e1a890-f465-46d4-b136-4f8509cb6ef9" */
test("an unsaved imported callable changes its signature and promises without saving the entry", async ({ workspace }) => {
  await workspace.importedHoverEditor("use publish from \"./book.expec\"\nexamples for publish {}", "function publish(title: Text) returns Boolean {\n  promises \"Publish the title.\"\n}");
  await workspace.editHoverImport("function publish(title: Text, copies: Number = 1) returns Text {\n  promises \"Publish current unsaved copies.\"\n}");
  await workspace.requestNativeHover(2, 15);
  await workspace.expectNativeHover("```expec\nfunction publish(title: Text, copies: Number = 1) returns Text\n```\n\nPublish current unsaved copies.", "publish", 2, 14, 21);
  await workspace.expectUnsavedHoverImport();
  await workspace.expectHoverFilesUnchanged();
});

/* @expec-test "a9069cc5-79a4-4e31-800b-ceec3cfffb3d" */
test("an unresolved name has no invented hover", async ({ workspace }) => {
  await workspace.localHoverEditor("type Basket { book: Missing }");
  await workspace.requestNativeHover(1, 21);
  await workspace.expectNoNativeHover();
  await workspace.expectHoverFilesUnchanged();
});

/* @expec-test "9a8d7035-abee-420f-84fe-e2e5cf9019ad" */
test("protocol conversion preserves astral characters and quoted names", async ({ workspace }) => {
  await workspace.hoverConversion("type `📚Book` { title: Text }\ntype Basket { book: `📚Book` }");
  await workspace.requestConvertedHover(1, 23);
  await workspace.expectConvertedHover(1, "```expec\ntype `📚Book`\n```", "`📚Book`", 20, 28);
});

/* @expec-test "6081d602-58e9-4870-bf5c-863f2c7a9e2f" */
test("malformed protocol positions do not clamp into an existing hover", async ({ workspace }) => {
  await workspace.hoverConversion("type `📚Book` { title: Text }\ntype Basket { book: `📚Book` }");
  await workspace.requestConvertedHover((-finiteNumber(1, "unary operand")), 23);
  await workspace.requestConvertedHover(1, 999);
  await workspace.requestConvertedHover(1, 23.5);
  await workspace.requestConvertedHover(1, 22);
  await workspace.expectNoConvertedHover(1);
  await workspace.expectNoConvertedHover(2);
  await workspace.expectNoConvertedHover(3);
  await workspace.expectNoConvertedHover(4);
});

/* @expec-test "884efdba-b33a-4d0b-8937-8d19fca1eeb3" */
test("authored promises stay literal text rather than HTML or a command link", async ({ workspace }) => {
  await workspace.hoverConversion("function echo(text: Text) returns Text { promises \"<b>raw</b> and [run](command:unsafe)\" }");
  await workspace.requestConvertedHover(0, 10);
  await workspace.expectConvertedHover(1, "```expec\nfunction echo(text: Text) returns Text\n```\n\n&lt;b&gt;raw&lt;/b&gt; and \\[run\\]\\(command:unsafe\\)", "echo", 9, 13);
});
