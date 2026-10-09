import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ConfigurationReader, LibraryLoader, SourceLoader, SourceComposer,
    acceptanceOutput, contractListOutput, javaAcceptanceOutput, javaOutput, kotlinAcceptanceOutput, kotlinOutput,
    markdownOutput, pythonAcceptanceOutput, pythonOutput, structureListOutput, typescriptOutput, umlOutput,
    type Configuration, type ModuleModel } from 'executable-specification-language';
import type { GenerationFiles } from './GenerationFiles.js';
import type { GenerationRequest } from './GenerationRequest.js';
import type { GenerationWriteProblem } from './GenerationWriteProblem.js';

/** Saved-input admission only. The SDK worker owns compilation, native capture, planning and effects. */
export class GenerationInputs {
    private readonly reader = new ConfigurationReader([typescriptOutput, markdownOutput, umlOutput, contractListOutput, structureListOutput,
        acceptanceOutput, javaOutput, javaAcceptanceOutput, kotlinOutput, kotlinAcceptanceOutput, pythonOutput, pythonAcceptanceOutput]);
    constructor(private readonly files: GenerationFiles) {}
    configuration(request: GenerationRequest): Configuration {
        if (!isAbsolute(request.configuration.file) || request.configuration.text === undefined) throw Error('Choose an available saved absolute configuration.');
        const checked = this.reader.read({ sourceId: pathToFileURL(request.configuration.file).href, text: request.configuration.text });
        if (!checked.value) throw Error(checked.problems.map(problem => problem.code + ': ' + problem.message).join('; ') || 'Configuration is unavailable.');
        if (!checked.value.project) throw Error('Choose a connected project before enabling generation.');
        return checked.value;
    }
    problems(request: GenerationRequest, configuration: Configuration, suppliedRoot?: string): GenerationWriteProblem[] {
        const problems: GenerationWriteProblem[] = [];
        const refuse = (code: string, path: string, message: string) => problems.push({ code, path, message });
        try {
            const source = filename(request.source.uri);
            if (extname(source).toLowerCase() !== '.expec') throw Error('Only ordinary local .expec saves can request generation.');
            const manifest = request.configuration.file, logicalRoot = resolve(dirname(manifest), configuration.project!.root);
            const buffers = this.files.buffers().map(buffer => ({ uri: buffer.uri, version: buffer.version, text: buffer.text, dirty: buffer.dirty }));
            const sourceBuffer = buffers.find(buffer => buffer.uri === request.source.uri);
            if (!sourceBuffer || sourceBuffer.dirty || sourceBuffer.version !== request.version || sourceBuffer.text !== request.source.text)
                refuse('source-not-current', source, 'The saved source is no longer the same current clean editor buffer.');
            if (savedText(source) !== request.source.text) refuse('source-not-saved', source, 'The save notification does not match actual saved source bytes.');
            if (savedText(manifest) !== request.configuration.text) refuse('configuration-not-saved', manifest, 'The selected configuration no longer matches actual saved bytes.');
            const canonicalRoot = realpathSync(logicalRoot);
            if (!statSync(canonicalRoot).isDirectory()) throw Error('The configured project root is not a directory.');
            if (suppliedRoot !== undefined && (!isAbsolute(suppliedRoot) || key(suppliedRoot) !== key(canonicalRoot)))
                refuse('root-not-current', suppliedRoot, 'The SDK root no longer matches the selected configured project.');
            const canonicalManifest = realpathSync(manifest);
            for (const buffer of buffers) {
                if (!buffer.dirty) continue;
                const path = filename(buffer.uri);
                if (extname(path).toLowerCase() === '.expec') {
                    refuse('dirty-authored-buffer', path, 'Save or revert this authored buffer before generating.'); continue;
                }
                if (key(path) === key(manifest)) {
                    refuse('dirty-configuration-buffer', path, 'Save or revert the selected configuration before generating.'); continue;
                }
                if (inside(logicalRoot, path) || inside(canonicalRoot, path)) {
                    refuse('dirty-editor-buffer', path, 'Save or revert this target buffer before generating.'); continue;
                }
                const actual = canonicalCandidate(path);
                if (key(actual) === key(canonicalManifest)) refuse('dirty-configuration-buffer', path, 'A dirty buffer aliases the selected configuration.');
                else if (inside(canonicalRoot, actual)) refuse('dirty-editor-buffer', path, 'A dirty buffer aliases this target project.');
            }
        } catch (error) { refuse('generation-input-unavailable', request.configuration.file, explanation(error)); }
        return problems;
    }
    async member(request: GenerationRequest, configuration: Configuration): Promise<boolean> {
        const libraries = configuration.libraries.length ? await new LibraryLoader(request.configuration.file).load(configuration) : undefined;
        const dependencies = { modules: libraries?.value?.modules ?? [], packages: [] };
        const loaded = await new SourceLoader(request.configuration.file).load(configuration, dependencies, libraries?.value);
        const canonicalSource = realpathSync(filename(request.source.uri));
        if (loaded.value) new SourceComposer(loaded.value.locate).compose(loaded.value.entries);
        // Captures include reached rejected source as well, so the full SDK can report its actual syntax findings.
        if (loaded.captures.some(capture => key(filename(capture.source.sourceId)) === key(canonicalSource))) return true;
        if (loaded.value && libraries) {
            const models = new Map<string, ModuleModel>();
            for (const entry of loaded.value.entries) for (const model of [entry.entry, ...entry.dependencies.modules]) models.set(model.locator, model);
            const reached = new Set<string>();
            const visit = (model: ModuleModel): void => {
                if (reached.has(model.locator)) return;
                reached.add(model.locator);
                for (const authored of locators(model)) {
                    const target = loaded.value!.locate(model.locator, authored), next = target === undefined ? undefined : models.get(target);
                    if (next) visit(next);
                }
            };
            for (const entry of loaded.value.entries) visit(entry.entry);
            for (const model of models.values()) if (reached.has(model.locator)) {
                const sourceIds = new Set(model.roots().flatMap(id => { const origin = model.node(id).origin; return origin.kind === 'source' ? [origin.range.sourceId] : []; }));
                if (libraries.captures.some(capture => sourceIds.has(capture.source.sourceId) && key(filename(capture.source.sourceId)) === key(canonicalSource))) return true;
            }
        }
        if (libraries?.problems.length) throw Error(libraries.problems.map(problem => problem.code + ': ' + problem.message).join('; '));
        if (libraries?.syntax.length || libraries?.deferred.length) throw Error('Source membership is unavailable while configured library acquisition has unresolved findings.');
        if (loaded.problems.length) throw Error(loaded.problems.map(problem => problem.code + ': ' + problem.message).join('; '));
        if (loaded.syntax.length) throw Error('Source membership is unavailable while the configured import graph has syntax errors.');
        return false;
    }
}
function locators(model: ModuleModel): string[] {
    return [...model.nodes('use').map(node => model.node(node.locator, 'string-literal').value),
        ...model.nodes('include').map(node => model.node(node.locator, 'string-literal').value),
        ...model.nodes('examples-attachment').map(node => model.node(node.locator, 'string-literal').value),
        ...model.nodes('reference').flatMap(node => node.lookup?.kind === 'module' ? [node.lookup.locator] : [])];
}
function filename(uri: string): string {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'file:' || parsed.search || parsed.hash) throw Error('Use an ordinary local file URI.');
    return fileURLToPath(parsed);
}
function savedText(path: string): string {
    const before = lstatSync(path, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink()) throw Error('Saved input must be an ordinary file: ' + path);
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(path));
    const after = lstatSync(path, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.mtimeNs !== after.mtimeNs || before.size !== after.size) throw Error('Saved input changed while checking: ' + path);
    return text;
}
function canonicalCandidate(path: string): string {
    let ancestor = path;
    for (;;) {
        try { return resolve(realpathSync(ancestor), relative(ancestor, path)); }
        catch (error) {
            if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT' || dirname(ancestor) === ancestor) throw error;
            ancestor = dirname(ancestor);
        }
    }
}
function key(path: string): string { const normalized = resolve(path); return process.platform === 'win32' ? normalized.toLowerCase() : normalized; }
function inside(root: string, path: string): boolean { const local = relative(key(root), key(path)); return local === '' || !isAbsolute(local) && local !== '..' && !local.startsWith('..' + sep); }
export function explanation(error: unknown): string { try { return error instanceof Error ? error.message : String(error); } catch { return 'Generation input check failed.'; } }
