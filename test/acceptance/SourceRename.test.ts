import { test } from "../dsl/workspace-test.js";
import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "../dsl/comparison.js";

/* @expec-test "1862035b-7c55-4767-9536-222d6fa78db9" */
test("rename changes the declaration and its bound use but preserves comments and strings", async ({ workspace }) => {
  await workspace.renameProject(["book.expec"]);
  await workspace.openRenameSource({ ["uri"]: (workspace.renameBook)["uri"], ["text"]: "type Book {}\n// Book stays in this comment\ntype Basket { book: Book\n  title: Text = \"Book\" }" }, 7);
  await workspace.prepareSourceRename((workspace.renameBook)["uri"], 7, 1, 6);
  await workspace.requestSourceRename((workspace.renameBook)["uri"], 7, 1, 6, "Publication");
  await workspace.expectRenamePrepared("Book");
  await workspace.expectPreparedRenameRange(5, 9);
  await workspace.expectRenameDocuments([(workspace.renameBook)["uri"]]);
  await workspace.expectRenameText((workspace.renameBook)["uri"], "type Publication {}\n// Book stays in this comment\ntype Basket { book: Publication\n  title: Text = \"Book\" }");
  await workspace.expectRenameVersion((workspace.renameBook)["uri"], 7);
  await workspace.expectRenameInputsUnchanged();
});

/* @expec-test "3bfa3ac5-47d0-4552-9661-42e3590a02eb" */
test("all configured entries include a closed reverse importer and its current unsaved target", async ({ workspace }) => {
  await workspace.renameProject(["book.expec", "basket.expec"]);
  await workspace.saveRenameSource(workspace.renameBook);
  await workspace.saveRenameSource(workspace.renameBasket);
  await workspace.openRenameSource({ ["uri"]: (workspace.renameBook)["uri"], ["text"]: "// unsaved 📚\ntype Book {}" }, 2);
  await workspace.requestSourceRename((workspace.renameBook)["uri"], 2, 2, 6, "Publication");
  await workspace.expectRenameDocuments([(workspace.renameBasket)["uri"], (workspace.renameBook)["uri"]]);
  await workspace.expectRenameText((workspace.renameBook)["uri"], "// unsaved 📚\ntype Publication {}");
  await workspace.expectRenameText((workspace.renameBasket)["uri"], "use Publication from \"./book.expec\"\ntype Basket { book: Publication }");
  await workspace.expectRenameVersion((workspace.renameBook)["uri"], 2);
  await workspace.expectSavedOnlyRename((workspace.renameBasket)["uri"]);
  await workspace.expectRenameInputsUnchanged();
});

/* @expec-test "327a3286-ac11-404a-83dc-0d3657c0463e" */
test("declaration rename preserves a distinct import alias and its uses", async ({ workspace }) => {
  await workspace.renameProject(["basket.expec"]);
  await workspace.saveRenameSource(workspace.renameBook);
  await workspace.openRenameSource({ ["uri"]: (workspace.renameBasket)["uri"], ["text"]: "use Book as Novel from \"./book.expec\"\ntype Basket { book: Novel }" }, 1);
  await workspace.requestSourceRename((workspace.renameBasket)["uri"], 1, 1, 6, "Publication");
  await workspace.expectRenameText((workspace.renameBook)["uri"], "type Publication {}");
  await workspace.expectRenameText((workspace.renameBasket)["uri"], "use Publication as Novel from \"./book.expec\"\ntype Basket { book: Novel }");
  await workspace.expectRenameInputsUnchanged();
});

/* @expec-test "da3a7ae9-11e1-47e6-96e5-e33e7f807152" */
test("same-spelled explicit alias routing is refused without guessing", async ({ workspace }) => {
  await workspace.renameProject(["basket.expec"]);
  await workspace.saveRenameSource(workspace.renameBook);
  await workspace.openRenameSource({ ["uri"]: (workspace.renameBasket)["uri"], ["text"]: "use Book as Book from \"./book.expec\"\ntype Basket { book: Book }" }, 1);
  await workspace.requestSourceRename((workspace.renameBasket)["uri"], 1, 1, 6, "Publication");
  await workspace.expectRenameRefused("alias");
  await workspace.expectRenameInputsUnchanged();
});

/* @expec-test "6de2fe28-267a-4b48-afca-30260258c7b5" */
test("an unrelated local Book keeps its declaration and bound use", async ({ workspace }) => {
  await workspace.renameProject(["book.expec"]);
  await workspace.openRenameSource({ ["uri"]: (workspace.renameBook)["uri"], ["text"]: "type Book {}\ncomponent Store {\n  local type Book {}\n  capability stock(book: Book)\n}\ntype Basket { book: Book }" }, 1);
  await workspace.requestSourceRename((workspace.renameBook)["uri"], 1, 1, 6, "Publication");
  await workspace.expectRenameText((workspace.renameBook)["uri"], "type Publication {}\ncomponent Store {\n  local type Book {}\n  capability stock(book: Book)\n}\ntype Basket { book: Publication }");
  await workspace.expectRenameInputsUnchanged();
});

/* @expec-test "b2425ddc-c467-4eb8-9af6-f06e1b20c32e" */
test("a syntactically valid rename that would capture a binding is refused", async ({ workspace }) => {
  await workspace.renameProject(["book.expec"]);
  await workspace.openRenameSource({ ["uri"]: (workspace.renameBook)["uri"], ["text"]: "type Book {}\ncomponent Store {\n  local type Publication {}\n  capability stock(book: Book)\n}" }, 1);
  await workspace.requestSourceRename((workspace.renameBook)["uri"], 1, 1, 6, "Publication");
  await workspace.expectRenameRefused("Publication");
  await workspace.expectRenameInputsUnchanged();
});

/* @expec-test "f9e557e1-20a9-4861-aa43-a601def4366d" */
test("a decoded Unicode name is quoted through the real language spelling rules", async ({ workspace }) => {
  await workspace.renameProject(["book.expec"]);
  await workspace.openRenameSource({ ["uri"]: (workspace.renameBook)["uri"], ["text"]: "type Book {}\ntype Basket { book: Book }" }, 1);
  await workspace.requestSourceRename((workspace.renameBook)["uri"], 1, 1, 6, "Publication 📚");
  await workspace.expectRenameText((workspace.renameBook)["uri"], "type `Publication 📚` {}\ntype Basket { book: `Publication 📚` }");
  await workspace.expectRenameInputsUnchanged();
});

/* @expec-test "05e5d65c-9b86-4232-87f2-efad1a377d36" */
test("a missing required configured entry refuses an otherwise valid local edit", async ({ workspace }) => {
  await workspace.renameProject(["book.expec", "missing.expec"]);
  await workspace.openRenameSource(workspace.renameBook, 1);
  await workspace.requestSourceRename((workspace.renameBook)["uri"], 1, 1, 6, "Publication");
  await workspace.expectRenameRefused("file:///workspace/missing.expec");
  await workspace.expectRenameInputsUnchanged();
});

/* @expec-test "efc302d9-8c42-4154-bbe2-e750d3e2b772" */
test("a source changed during acquisition cannot produce an older edit", async ({ workspace }) => {
  await workspace.renameProject(["book.expec", "basket.expec"]);
  await workspace.openRenameSource(workspace.renameBook, 1);
  await workspace.saveRenameSource(workspace.renameBasket);
  await workspace.changeRenameSourceDuringNextRead({ ["uri"]: (workspace.renameBook)["uri"], ["text"]: "type Magazine {}" }, 2);
  await workspace.requestSourceRename((workspace.renameBook)["uri"], 1, 1, 6, "Publication");
  await workspace.expectRenameRefused("changed");
  await workspace.expectCurrentRenameText((workspace.renameBook)["uri"], "type Magazine {}");
});

/* @expec-test "4119cf1d-aeaa-4f8f-9f10-86564acc0fc6" */
test("an ambiguous use refuses instead of choosing one imported declaration", async ({ workspace }) => {
  await workspace.renameProject(["basket.expec"]);
  await workspace.saveRenameSource({ ["uri"]: "file:///workspace/first.expec", ["text"]: "type Book {}" });
  await workspace.saveRenameSource({ ["uri"]: "file:///workspace/second.expec", ["text"]: "type Book {}" });
  await workspace.openRenameSource({ ["uri"]: (workspace.renameBasket)["uri"], ["text"]: "use Book from \"./first.expec\"\nuse Book from \"./second.expec\"\ntype Basket { book: Book }" }, 1);
  await workspace.requestSourceRename((workspace.renameBasket)["uri"], 1, 3, 22, "Publication");
  await workspace.expectRenameRefused("ambiguous");
  await workspace.expectRenameInputsUnchanged();
});

/* @expec-test "3bdec551-290d-4132-ab1c-7dfdb14eaf92" */
test("an empty new name refuses without returning an edit", async ({ workspace }) => {
  await workspace.renameProject(["book.expec"]);
  await workspace.openRenameSource(workspace.renameBook, 1);
  await workspace.requestSourceRename((workspace.renameBook)["uri"], 1, 1, 6, "");
  await workspace.expectRenameRefused("empty");
  await workspace.expectRenameInputsUnchanged();
});

/* @expec-test "e880bd1a-29d7-41b4-bf45-5221360453f0" */
test("field rename includes checked record labels and contextual member access", async ({ workspace }) => {
  await workspace.renameProject(["book.expec"]);
  await workspace.openRenameSource({ ["uri"]: (workspace.renameBook)["uri"], ["text"]: "type Book { title: Text }\nexamples for Book {\n  fixture book: Book = { title: \"A\" }\n  fixture copied: Text = book.title\n}" }, 1);
  await workspace.requestSourceRename((workspace.renameBook)["uri"], 1, 1, 13, "name");
  await workspace.expectRenameText((workspace.renameBook)["uri"], "type Book { name: Text }\nexamples for Book {\n  fixture book: Book = { name: \"A\" }\n  fixture copied: Text = book.name\n}");
  await workspace.expectRenameInputsUnchanged();
});

/* @expec-test "966cfbc4-cd87-4be2-8ad1-21c5c143dfe8" */
test("composition target names are renamed even after effective-model directives are omitted", async ({ workspace }) => {
  await workspace.renameProject(["store.expec"]);
  await workspace.saveRenameSource({ ["uri"]: "file:///workspace/saving.expec", ["text"]: "use Store from \"./store.expec\"\nextend Store { capability save() returns Nothing }" });
  await workspace.saveRenameSource({ ["uri"]: "file:///workspace/examples.expec", ["text"]: "examples {}" });
  await workspace.openRenameSource({ ["uri"]: "file:///workspace/store.expec", ["text"]: "include \"./saving.expec\"\nconcept Store {}\nexamples for Store from \"./examples.expec\"" }, 1);
  await workspace.requestSourceRename("file:///workspace/store.expec", 1, 2, 9, "Library");
  await workspace.expectRenameDocuments(["file:///workspace/saving.expec", "file:///workspace/store.expec"]);
  await workspace.expectRenameText("file:///workspace/store.expec", "include \"./saving.expec\"\nconcept Library {}\nexamples for Library from \"./examples.expec\"");
  await workspace.expectRenameText("file:///workspace/saving.expec", "use Library from \"./store.expec\"\nextend Library { capability save() returns Nothing }");
  await workspace.expectRenameInputsUnchanged();
});

/* @expec-test "3b92f3d7-fd38-48f3-93c8-a21ee5ec976b" */
test("an included source with no names does not prevent a valid rename", async ({ workspace }) => {
  await workspace.renameProject(["book.expec"]);
  await workspace.saveRenameSource({ ["uri"]: "file:///workspace/empty.expec", ["text"]: "" });
  await workspace.openRenameSource({ ["uri"]: (workspace.renameBook)["uri"], ["text"]: "include \"./empty.expec\"\ntype Book {}" }, 1);
  await workspace.requestSourceRename((workspace.renameBook)["uri"], 1, 2, 6, "Publication");
  await workspace.expectRenameDocuments([(workspace.renameBook)["uri"]]);
  await workspace.expectRenameText((workspace.renameBook)["uri"], "include \"./empty.expec\"\ntype Publication {}");
  await workspace.expectRenameInputsUnchanged();
});

/* @expec-test "19e75ae6-ff7b-4887-9452-48c00d6ececf" */
test("two closed routes to one physical file refuse instead of omitting an importer", async ({ workspace }) => {
  await workspace.renameProject(["basket.expec", "store.expec"]);
  await workspace.identifyRenameSource((workspace.renameBook)["uri"], "physical-book");
  await workspace.identifyRenameSource("file:///workspace/second.expec", "physical-book");
  await workspace.saveRenameSource(workspace.renameBook);
  await workspace.saveRenameSource({ ["uri"]: "file:///workspace/second.expec", ["text"]: "type Book {}" });
  await workspace.saveRenameSource({ ["uri"]: "file:///workspace/store.expec", ["text"]: "use Book from \"./second.expec\"\ntype Store { book: Book }" });
  await workspace.openRenameSource(workspace.renameBasket, 1);
  await workspace.requestSourceRename((workspace.renameBasket)["uri"], 1, 1, 6, "Publication");
  await workspace.expectRenameRefused("identity");
  await workspace.expectRenameInputsUnchanged();
});

/* @expec-test "32b7dd16-a4d3-4684-b14e-2132c89dfddb" */
test("an unknown acquired physical identity refuses and leaves the host unchanged", async ({ workspace }) => {
  await workspace.renameProject(["basket.expec"]);
  await workspace.withholdRenameSourceIdentity((workspace.renameBook)["uri"]);
  await workspace.saveRenameSource(workspace.renameBook);
  await workspace.openRenameSource(workspace.renameBasket, 1);
  await workspace.requestSourceRename((workspace.renameBasket)["uri"], 1, 1, 6, "Publication");
  await workspace.expectRenameRefused((workspace.renameBook)["uri"]);
  await workspace.expectRenameInputsUnchanged();
});

/* @expec-test "0afe440b-f592-4fd7-bfe7-61b88c1ca386" */
test("equal source text with distinct physical identities keeps the other declaration and importer unchanged", async ({ workspace }) => {
  await workspace.renameProject(["basket.expec", "store.expec"]);
  await workspace.identifyRenameSource((workspace.renameBook)["uri"], "physical-book");
  await workspace.identifyRenameSource("file:///workspace/second.expec", "physical-second");
  await workspace.saveRenameSource(workspace.renameBook);
  await workspace.saveRenameSource({ ["uri"]: "file:///workspace/second.expec", ["text"]: "type Book {}" });
  await workspace.saveRenameSource({ ["uri"]: "file:///workspace/store.expec", ["text"]: "use Book from \"./second.expec\"\ntype Store { book: Book }" });
  await workspace.openRenameSource(workspace.renameBasket, 1);
  await workspace.requestSourceRename((workspace.renameBasket)["uri"], 1, 1, 6, "Publication");
  await workspace.expectRenameDocuments([(workspace.renameBasket)["uri"], (workspace.renameBook)["uri"]]);
  await workspace.expectRenameText((workspace.renameBook)["uri"], "type Publication {}");
  await workspace.expectRenameText((workspace.renameBasket)["uri"], "use Publication from \"./book.expec\"\ntype Basket { book: Publication }");
  await workspace.expectRenameText("file:///workspace/second.expec", "type Book {}");
  await workspace.expectRenameText("file:///workspace/store.expec", "use Book from \"./second.expec\"\ntype Store { book: Book }");
  await workspace.expectSavedOnlyRename((workspace.renameBook)["uri"]);
  await workspace.expectRenameInputsUnchanged();
});

/* @expec-test "195d50d8-776b-499e-baa8-ea984b0fe211" */
test("physical identity replaced during acquisition refuses even when URI text and version stay unchanged", async ({ workspace }) => {
  await workspace.renameProject(["book.expec", "basket.expec"]);
  await workspace.identifyRenameSource((workspace.renameBook)["uri"], "physical-book-before");
  await workspace.changeRenameIdentityDuringNextRead((workspace.renameBook)["uri"], "physical-book-after");
  await workspace.saveRenameSource(workspace.renameBasket);
  await workspace.openRenameSource(workspace.renameBook, 1);
  await workspace.requestSourceRename((workspace.renameBook)["uri"], 1, 1, 6, "Publication");
  await workspace.expectRenameRefused("changed");
  await workspace.expectCurrentRenameText((workspace.renameBook)["uri"], (workspace.renameBook)["text"]);
});
