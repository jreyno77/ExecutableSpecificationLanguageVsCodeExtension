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

The first components implement preview routing, opt-in generation on save, editor-event forwarding and React tabs for supplied outputs. Eleven generated scenarios exercise these contracts; focused UI tests cover mounting and disposal. Core/editor tests run in-process. UI tests use real Chromium, sharing browser setup while isolating each test in its own context. The installable VSIX provides native `.expec` language recognition and theme-compatible highlighting from the language's grammar. Six additional generated scenarios verify the real installed extension and its TextMate scopes. Language-server diagnostics and activation are subsequent work.

## Work from the specification

`npm run generate` updates TypeScript, tests and UML in the originating connected checkout. The current language CLI cannot yet reconnect a fresh clone to existing generated files ([language issue #61](https://github.com/jreyno77/ExecutableSpecificationLanguage/issues/61)): its ignored `.expec/` state belongs to the original project location. A fresh checkout can check, build and test the committed outputs using the commands above. The captured tool includes the optional Electron capture repair. EXT-08 initial generation emitted all six highlighting scenarios and preserved the prior implementation. A later preservation run kept all 19 checked public files byte-identical but stopped at a final freshness/recovery check; its pending intent is retained and that run is not a successful complete regeneration. Do not copy private connection state, remove existing output, or edit managed files to bypass that limitation.

The acceptance output explicitly retains its established `source` parameter-name mappings for the two editor notifications. The TypeScript adapter uses `document: TextDocument`; the configured acceptance names are deliberate mappings, not a replay of an earlier rename.

1. **Specifying:** edit and review `.expec` contracts and examples.
2. **Generating:** run the generator, inspect its outputs and verify them.
3. **Implementing:** fill only the handwritten areas the generator preserves.

During implementation, do not edit `.expec`, generated declarations, imports, signatures, assertions or diagrams. Bodies, unassociated private state/helpers and separate handwritten imports are preserved implementation areas. If a managed part or dependency must change, record the finding on the task, return to Specifying, review, and regenerate before continuing implementation. Package requirements belong in the owning `.expec` components and `generation/expec/expec.json`; keep `package.json` and its lockfile aligned. Preserve the captured language archive dependency described below.

Build an installable package with `npm run package:vsix` after `npm run build`, then use VS Code's **Extensions: Install from VSIX** command with `dist/expec-vscode-extension.vsix`. CI retains the VSIX from each platform.

PR CI tests affected components on Windows and Ubuntu; main runs the complete extension suite. Browser installation is needed only for UI tests. On Linux CI, Playwright also installs its required system libraries, and the native VS Code tests run under Xvfb. The native syntax suite shares one VSIX installation and one owned VS Code host; each example uses a fresh document URI and token stack. The SDK download cache is keyed by its pinned version and platform. Extra isolated native test files will need project-level session ownership.

## Development language build

For this bootstrap, `generation/tooling/executable-specification-language-a69ceca.tgz` pins a normally source-built development generator at [a69ceca](https://github.com/jreyno77/ExecutableSpecificationLanguage/commit/a69ceca4382cb91ff28174ceb6c3ed73a5a6eae2). It combines [PR #68](https://github.com/jreyno77/ExecutableSpecificationLanguage/pull/68)'s captured analysis, [PR #85](https://github.com/jreyno77/ExecutableSpecificationLanguage/pull/85)'s initial package confirmation, merged [PR #91](https://github.com/jreyno77/ExecutableSpecificationLanguage/pull/91)'s initial source/project confirmation, merged [PR #88](https://github.com/jreyno77/ExecutableSpecificationLanguage/pull/88)'s existing-grammar highlighting asset, and merged [PR #92](https://github.com/jreyno77/ExecutableSpecificationLanguage/pull/92)'s actual Node builtin declaration selection. Source-folder mirroring and relocation already exist on language main. Later freshness and writer checks remain strict. The normal source build and pack pass; the archive includes the exported syntax asset. Current Windows/Linux CI passed for PRs #88, #91 and #92; their exact-merge releases remain unverified. This captured composition is not an official release; replace it with a verified release dependency when available.

SHA-512 integrity: `sha512-YLdLm0O5hcqtQQl17RV96t55AXtWKZ2GGxiSAGEAww1w+Ynyf1Z5d5W1diR5MkuvGJXT3N0W918OaZ6RRc164g==`.

TypeScript preserves JSX for the Vite React plugin to transform. The captured language tool currently rejects a relative directory import in React automatic-runtime declarations ([language issue #60](https://github.com/jreyno77/ExecutableSpecificationLanguage/issues/60)); no native-input or writer check is disabled.
