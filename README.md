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

`generation/tooling/executable-specification-language-2fb9c5d.tgz` is a normally source-built development capture. It includes the existing foundation plus the reviewed EOF-location, completed-bookkeeping recovery and first-open declaration corrections from language PRs #95, #97 and #98. Its SHA256 is `979534504328e42e8472246b5a8046b153c7467f829808fb0c532627e7b7fb19`; `npm ci` also verifies lockfile integrity. This capture is not an official release; exact-merge package delivery remains a separate gate.

TypeScript preserves JSX for Vite's React plugin. Automatic-runtime declaration capture remains [language issue60](https://github.com/jreyno77/ExecutableSpecificationLanguage/issues/60); native freshness and writer guards remain enabled.
