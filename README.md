# .expec for VS Code

Install the extension to get `.expec` language recognition, theme-compatible highlighting and syntax and semantic feedback while you type. Diagnostics use the current unsaved text and clear when you fix the problem or close its editor. File and untitled documents are supported.

Build with Node 24.19+ (24.x) and npm 11.20+ (11.x):

```sh
npm ci
npm run spec:check
npm run build
npm run package:vsix
```

Use VS Code's **Extensions: Install from VSIX** command with `dist/expec-vscode-extension.vsix`. Open a `.expec` file containing:

```expec
concept Library {
}
```

Remove its closing brace without saving to see the syntax diagnostic; restore it to clear the problem.

An unknown type such as `type Basket { book: Boook }` receives a located semantic diagnostic. Fixing it to `Text` clears the problem. Source imports resolve relative to their owning file; unsaved imported text takes precedence, and saved imports update dependent diagnostics through VS Code’s native file watching. Unavailable modules and packages remain explicit findings. See the [language reference](https://github.com/jreyno77/ExecutableSpecificationLanguage/wiki) for authoring syntax and examples.

Use **Go to Definition** on a source reference to select its declaration, including one in an imported file with unsaved edits. Unresolved, ambiguous and external references have no invented destination. For qualified names, select the final identifier.

Open **.expec Project Connection** in the Explorer and use **Choose Project** to select a local directory. Its status follows saved configuration changes and directory disappearance or restoration automatically. Save or revert unsaved configuration edits before choosing another project. `expec.configurationFile` selects the workspace manifest and defaults to `expec.json`; multiple workspace folders require a folder choice.

A connected status verifies the directory is available. Compilation, dependencies and generated outputs have their own checks. Creating a new manifest sets `src/main.expec` as its initial build entry; configure your actual source entry before compilation.
## Output previews

Run **.expec: Show Output Previews** from the Command Palette. Add the desired outputs to your saved `expec.json`, for example:

```json
{
  "formatVersion": 1,
  "version": "0.1.0",
  "build": { "entries": ["src/library.expec"] },
  "outputs": [
    { "id": "uml", "options": { "directory": "draft/uml" } },
    { "id": "typescript", "options": { "directory": "draft/types" } },
    { "id": "markdown", "options": { "directory": "draft/docs" } }
  ]
}
```

Select an output tab and then a document. Previews follow the selected `.expec` editor's unsaved text and saved output configuration. Each output shows its own progress or explanation. Diagrams start at their natural size, with scrolling, zoom and reset controls. Previewing leaves project files untouched; generated-file updates have a separate save policy.
## Generate on save

Run **.expec: Enable Generation on Save** for the selected saved project configuration. Saving a valid `.expec` source then builds all configured saved entries and outputs, preserving handwritten implementation. Typing continues to update previews without writing generated files. Use **.expec: Disable Generation on Save** to stop automatic generation; each selected configuration retains its own choice.

Generation uses Node 24.19+ (24.x). Set `expec.nodeExecutable` to its executable path if `node` does not select that runtime. The **.expec Generation** status item opens the actual generation log, including the runtime version, build result and any failure or partial effects.

Save or revert dirty configuration, source dependencies and target buffers before generating. Hidden dirty buffers are protected too. A blocked or refused build explains the conflict; it does not overwrite those buffers. A newer eligible save cancels the active run and queues the latest saved change until that run settles.

## Develop from the specification

Core owns application behavior; `src/vscode` and `src/ui` adapt native host events and presentation into core. Authored contracts and scenarios live in `generation/expec/src/`, whose folder layout maps to the connected project's `src/`. Scenarios generate acceptance tests, DSL and driver seams under `test/`; diagrams go to `generation/uml`.

1. **Specifying:** edit and independently review the `.expec` APIs and literal examples.
2. **Generating:** run `npm run generate`, inspect outputs and verify preservation.
3. **Implementing:** observe behavioral failure, then fill preserved handwritten bodies and private helpers.

During implementation, authored `.expec`, managed declarations/imports/signatures, generated assertions and diagrams are read-only. A required contract or dependency change returns the task to Specifying with its learning recorded, followed by review and regeneration. Package requirements belong to the owning `.expec` components and `generation/expec/expec.json`; align `package.json` and its lockfile.

Generation works in the originating connected checkout. A fresh clone can check, build and test committed outputs; reconnecting it for regeneration remains [language issue61](https://github.com/jreyno77/ExecutableSpecificationLanguage/issues/61). Private connection state belongs to its original location.

## Test

```sh
npx playwright install chromium
npm test
npm run test:collect
```

Core checks run in-process. React/browser checks share Chromium and isolate mutable contexts. Installed-editor checks share one VSIX installation and owned VS Code host, with fresh document URIs and owned listeners/files per case. Runtime collection lists imported suites without executing their tests.

PR CI selects affected components on Windows and Ubuntu; main runs the full extension suite. Linux CI installs browser libraries and runs native editor checks under Xvfb. CI retains platform VSIX artifacts.

## Captured language build

`generation/tooling/executable-specification-language-ba88eb7.tgz` is a development capture from exact language commit `ba88eb75`, built and packed through the ordinary build. It adds the guarded `CliHost` boundary used by save generation to the existing previews and preserving outputs. Its SHA256 is `ae10d2f55870671a5c90c6586d13ed298546de1a18dbc16a19ae2c6e2339a99c`; `npm ci` also verifies lockfile integrity. This pinned archive is a development capture, distinct from the official [PR107 package release](https://github.com/jreyno77/ExecutableSpecificationLanguage/releases/tag/pr-107).

TypeScript preserves JSX for Vite's React plugin. Automatic-runtime declaration capture remains [language issue60](https://github.com/jreyno77/ExecutableSpecificationLanguage/issues/60); native freshness and writer guards remain enabled.
