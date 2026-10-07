# .expec for VS Code

Extension structure specified in `.expec`, with TypeScript and UML generated into the connected project. Core owns application behavior; UI and VS Code adapt presentation and host events into core.

## Setup

Use Node 24.19+ (24.x) and npm 11.20+ (11.x).

```sh
npm ci
npm run spec:check
npm run build
npm run test:collect
npm test
```

`generation/expec/src/` is the authored specification. Its folder layout maps to `src/core`, `src/ui`, and `src/vscode`. Scenarios in those same sources produce `test/acceptance`, `test/dsl`, and `test/driver`. Diagrams are generated in `generation/uml`.

This first delivery is scaffolding. The generated drivers and operations throw until implemented. `npm test` reports those unfinished scenarios as failures; successful typechecking, collection and Vite bundling do not establish working extension behavior. No installable VSIX, language server or rendered React interface exists yet. Vite is configured for the three generated module entries; React and Vitest tooling are installed for subsequent work.

## Work from the specification

`npm run generate` updates TypeScript, tests and UML in the originating connected checkout. The current language CLI cannot yet reconnect a fresh clone to existing generated files ([language issue #61](https://github.com/jreyno77/ExecutableSpecificationLanguage/issues/61)): its ignored `.expec/` state belongs to the original project location. A fresh checkout can check, build and test the committed outputs using the commands above. Do not copy private connection state, remove existing output, or edit managed files to bypass that limitation.

1. **Specifying:** edit and review `.expec` contracts and examples.
2. **Generating:** run the generator, inspect its outputs and verify them.
3. **Implementing:** fill only the handwritten areas the generator preserves.

During implementation, do not edit `.expec`, generated declarations, imports, signatures, assertions or diagrams. If one must change, record the finding on the task, return to Specifying, review, and regenerate before continuing implementation.

## Development language build

For this bootstrap, `generation/tooling/executable-specification-language-ac7be28.tgz` pins a captured development build of [language PR #58](https://github.com/jreyno77/ExecutableSpecificationLanguage/pull/58), source `ac7be28b1c9453ddbc79a9c6ba46db80d575f0fa`. It supplies source-folder mirroring. The local dependency and lockfile let `npm ci` reproduce this tool without rebuilding native language resources. This is not a released language version; replace it with a verified release dependency when available.

SHA-512 integrity: `sha512-8ggNLaFwzsLf52pPhmRVEVg0O1lT2RW7iC2DBH8ug9pj0aKkjAmz/V2IdRoJmG1ta/0HAsbNFM32KvljzLfQVw==`.

TypeScript preserves JSX for the Vite React plugin to transform. The captured language tool currently rejects a relative directory import in React automatic-runtime declarations ([language issue #60](https://github.com/jreyno77/ExecutableSpecificationLanguage/issues/60)); no native-input or writer check is disabled.
