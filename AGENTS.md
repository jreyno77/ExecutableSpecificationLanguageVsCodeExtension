# Working on the extension

- Notion holds user stories, construction tasks, progress and learnings. Authored `generation/expec/` files hold specifications, APIs, examples and scenarios. Review those actual source changes in GitHub; do not create parallel Notion specifications or API/acceptance-review documents.
- Follow story -> task -> authored .expec contract/examples -> independent API and acceptance review -> generation -> behavioral red -> implementation/refactor -> independent final review and scoped CI -> verified delivery. Record discoveries back in the source contract and task.
- Keep one PR per construction task, its original task-start commit and Notion link. Generated scaffolding does not prove implemented extension behavior.
- Core owns application behavior and language integration. UI and VS Code contain presentation/host APIs and adapters into core. Do not put platform types or policies in core.
- Source folders below generation/expec map into the connected project's source folders. Tests derive from examples/scenarios in those same files, after compile/build and code synchronization. There is no authored generation/expec/test tree.
- Vitest tests express consumer behavior through test/acceptance, test/dsl, test/driver and test/unit. Preserve handwritten bodies and assertions. Keep setup proportional to each claim.
- PR CI checks affected components; main checks the full extension suite. Do not run the language repository's full suite as extension validation.
