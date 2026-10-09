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

Open **.expec Project Connection** in the Explorer and use **Choose Project** to select a local directory. Its status follows saved configuration changes and directory disappearance or restoration automatically. Save or revert unsaved configuration edits before choosing another project. `expec.configurationFile` selects the workspace manifest and defaults to `expec.json`; multiple workspace folders require a folder choice.

A connected status verifies the directory is available. Compilation, dependencies and generated outputs have their own checks. Creating a new manifest sets `src/main.expec` as its initial build entry; configure your actual source entry before compilation.
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

`generation/tooling/executable-specification-language-2734178.tgz` is a normally source-built development capture from independently reviewed language commit `27341780d7722648be32fb2d160aa8e7a4327ce5` (OUT-25 / PR #102), based on merged OUT-24 commit `3ca467477992f8c4f234b9df76453a780cc5314d`. It includes authored-output preview and distinguishes literal optional-method punctuation from genuine native diagram globs. Full build, 87 affected output checks, type-check and independent review passed; current Windows/Linux PR CI and exact-merge package delivery remain pending. Its SHA256 is `ea16598acb7002d8bbb75b370b86a392abafb15ce8b8c1b2a7bd0a12c5c41e9a`; `npm ci` also verifies lockfile integrity. This is a development capture, not an official release. PROJECT-40 safe numeric-array scope proof is not included yet.

TypeScript preserves JSX for Vite's React plugin. Automatic-runtime declaration capture remains [language issue60](https://github.com/jreyno77/ExecutableSpecificationLanguage/issues/60); native freshness and writer guards remain enabled.
