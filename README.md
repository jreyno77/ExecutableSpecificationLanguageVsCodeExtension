# .expec for VS Code

Extension structure specified in `.expec`, with TypeScript and UML generated into the connected project. Core owns application behavior; UI and VS Code adapt presentation and host events into core.

## Setup

Use Node 24.19+ (24.x) and npm 11.20+ (11.x).

```sh
npm ci
npm run spec:check
npm run build
npx playwright install chromium
npm test
```

`generation/expec/src/` is the authored specification. Its folder layout maps to `src/core`, `src/ui`, and `src/vscode`. Scenarios in those same sources produce `test/acceptance`, `test/dsl`, and `test/driver`. Diagrams are generated in `generation/uml`.

The first components implement preview routing, opt-in generation on save, editor-event forwarding and React tabs for supplied outputs. Nine generated scenarios exercise these contracts; focused UI tests cover mounting and disposal. Core/editor tests run in-process. UI tests use real Chromium, sharing browser setup while isolating each test in its own context. This is the component foundation; VS Code activation, a language server and an installable VSIX are subsequent work.

## Work from the specification

`npm run generate` updates TypeScript, tests and UML in the originating connected checkout. The current language CLI cannot yet reconnect a fresh clone to existing generated files ([language issue #61](https://github.com/jreyno77/ExecutableSpecificationLanguage/issues/61)): its ignored `.expec/` state belongs to the original project location. A fresh checkout can check, build and test the committed outputs using the commands above. The captured tool includes the optional Electron capture repair; regeneration of the original implementation preserved all 25 source/test/generation files. Do not copy private connection state, remove existing output, or edit managed files to bypass that limitation.

1. **Specifying:** edit and review `.expec` contracts and examples.
2. **Generating:** run the generator, inspect its outputs and verify them.
3. **Implementing:** fill only the handwritten areas the generator preserves.

During implementation, do not edit `.expec`, generated declarations, imports, signatures, assertions or diagrams. Bodies, unassociated private state/helpers and separate handwritten imports are preserved implementation areas. If a managed part or dependency must change, record the finding on the task, return to Specifying, review, and regenerate before continuing implementation. Package requirements belong in the owning `.expec` components and `generation/expec/expec.json`; keep `package.json` and its lockfile aligned. Preserve the captured language archive dependency described below.

PR CI tests affected components on Windows and Ubuntu; main runs the complete extension suite. Browser installation is needed only for UI tests. On Linux CI, Playwright also installs its required system libraries.

## Development language build

For this bootstrap, `generation/tooling/executable-specification-language-5fd7805.tgz` pins a captured development build of [language PR #67](https://github.com/jreyno77/ExecutableSpecificationLanguage/pull/67), source `5fd78058fa798f3a6b0f8e7b7505fd36aa0854eb`. It includes source-folder mirroring, native dependency compatibility and portable ambient type bindings and byte-safe snapshot validation. Its upstream CI and release remain pending. The local dependency and lockfile let `npm ci` reproduce this tool without rebuilding native language resources. This is not a released language version; replace it with a verified release dependency when available.

SHA-512 integrity: `sha512-rV9NH+1fHUeAS4N4w0GPuuaBa6I9t3a4Qhau0znNNNPpVknSbyCdeflC+Xdmls+ziozPMa24CXyezcnSa/IKLQ==`.

TypeScript preserves JSX for the Vite React plugin to transform. The captured language tool currently rejects a relative directory import in React automatic-runtime declarations ([language issue #60](https://github.com/jreyno77/ExecutableSpecificationLanguage/issues/60)); no native-input or writer check is disabled.
