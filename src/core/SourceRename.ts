import type { RenameWorkspace } from "./RenameWorkspace.js";
import type { DocumentSources } from "./DocumentSources.js";
import type { RenameTarget } from "./RenameTarget.js";
import type { RenameDocumentEdit } from "./RenameDocumentEdit.js";
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Compiler, ConfigurationReader, LangiumModel, LangiumReader, SourceComposer,
    acceptanceOutput, contractListOutput, javaAcceptanceOutput, javaOutput, kotlinAcceptanceOutput, kotlinOutput,
    markdownOutput, pythonAcceptanceOutput, pythonOutput, requirementsFor, structureListOutput, typescriptOutput, umlOutput,
    type Check, type CheckedSourceName, type Configuration, type Item, type ModuleModel, type NodeId,
    type Origin, type SourceRange, type Specification } from 'executable-specification-language';
import type { ConnectionConfiguration } from './ConnectionConfiguration.js';
import type { RenameBuffer } from './RenameBuffer.js';
import type { RenameTextEdit } from './RenameTextEdit.js';
import type { SourceDocument } from './SourceDocument.js';
import type { SourceIdentities } from "./SourceIdentities.js";


type RenameCapture = {
    configuration: ConnectionConfiguration;
    configured: Configuration;
    open: Map<string, RenameBuffer>;
    sources: Map<string, SourceDocument>;
    saved: Map<string, SourceDocument>;
    localPaths: Map<string, string | undefined>;
    identityKeys: Map<string, string | undefined>;
    identityUris: Set<string>;
    entries: string[];
    routes: Map<string, string>;
};
type RenameAnalysis = {
    specification: Specification;
    names: readonly CheckedSourceName[];
    byRange: ReadonlyMap<string, CheckedSourceName>;
    qualifiers: ReadonlySet<string>;
    aliases: ReadonlySet<NodeId>;
};
type RenameSelection = { capture: RenameCapture; analysis: RenameAnalysis; selected: CheckedSourceName; target: RenameTarget };
/** Number profile: JavaScript binary64. */




/**
 * Unverified implementation obligation.
 * Requires package: expec (runtime)
 * Depends on: RenameWorkspace
 * Depends on: DocumentSources
 * Depends on: SourceIdentities
 */
export class SourceRename {
    private readonly workspace: RenameWorkspace;
    private readonly sources: DocumentSources;
    private readonly identities: SourceIdentities;
    private readonly reader = new LangiumReader();
    private readonly compiler = new Compiler();
    private readonly configurationReader = new ConfigurationReader([typescriptOutput, markdownOutput, umlOutput,
        contractListOutput, structureListOutput, acceptanceOutput, javaOutput, javaAcceptanceOutput, kotlinOutput,
        kotlinAcceptanceOutput, pythonOutput, pythonAcceptanceOutput]);
    constructor(workspace: RenameWorkspace, sources: DocumentSources, identities: SourceIdentities) {
        this.workspace = workspace;
        this.sources = sources;
        this.identities = identities;
    }
    /**
     * Unverified implementation obligation.
     * Check one explicit rename request against the selected manifest's actual build.entries and every transitive use/include/examples attachment reached from those entries, including reverse users reached from another entry. This is configured-build scope, not arbitrary workspace files or other projects. Read validated configuration through the public ConfigurationReader; a generated-output connection is not required. Use current open text before saved DocumentSources text, including new unsaved import locators. Capture each exact URI/text once per analysis and terminate cycles; never reuse an accepted model after rejected text. Ask SourceIdentities.keyOf for actual physical equality independently of DocumentSources.localPath, which remains literal requirement-scope metadata. A resolved route may use one current open buffer only when both its verified primary manifest-relative path and its known physical key agree with that buffer. Preserve the exact open URI/text/version in captured sources, models and returned edits. Refuse multiple open identities for one physical file, an equal path with different or unknown physical keys, or distinct effective acquired URIs sharing one physical key. Different paths with the same key, including native case aliases and hardlinks, refuse rather than merge requirement scopes. Unknown identities of unrelated uncaptured foreign open buffers do not match and do not block an otherwise complete rename. Never infer physical equality from URI or path spelling, case-folding, percent decoding or equal text. Use public LangiumReader, LangiumModel, SourceComposer and Compiler for one shared batch of all configured entries, with the same captured module objects and supplied package aliases/phases. Resolve configured entry paths relative to the selected manifest URI or absolute native filename, never the generated project.root. Do not create another parser or resolver. Ordinary live diagnostics and bounded references remain unchanged; only explicit prepare/rename can acquire this configured source set. Never use native project capture, SourceLoader's saved-only snapshots, package installation, JVMs, output generation or writes.
     * Require the requesting exact URI/version to be open in this captured configured scope. Require finite nonnegative integer version/offset, otherwise throw RangeError. Select the actual named source declaration or checked source-name use (including a record field label or bound final reference segment) containing the zero-based Unicode-scalar cursor; return its whole authored token range in the requesting source and decoded target name. Comments, punctuation, qualified-reference prefix segments, builtin/external/unnamed targets, unresolved/ambiguous targets and foreign source ownership refuse with an explained Error. Every acquired configured source must have a verified primary manifest-relative path from DocumentSources.localPath and a known physical key from SourceIdentities.keyOf. An unknown acquired identity refuses with the actual URI; explain save first when a new native file has no identity. A selected alias-use cursor or a same-spelled explicit alias to this target refuses rather than guessing which introduction supplied that spelling. A direct declaration or import source-name remains eligible beside a distinct explicit alias.
     * Refuse incomplete or invalid checked analysis: missing required source, rejected syntax, actual compiler problems, deferred compilation prerequisites or invalid requirementsFor findings remain explained, never repaired by scanning. Use Specification.names.at, inSource and occurrencesOf for the actual checked spelling owner, not raw contextual Inspection.resolution. Require complete finding-free source-name queries even after compilation succeeds; ambiguous-source-name and source-name-selection findings refuse. Structurally empty-name captured input models need no invented query source identity. Contextual resolver deferrals already discharged by Compiler are not independent failures. Before returning, require the selected configuration and all captured open URI/text/version facts to remain equal and freshly re-read saved-only captures to match exactly. After the final saved-only rereads, requery every acquired URI and every resolved alias route that was mapped to an open buffer through SourceIdentities.keyOf using the same captured manifest; each known physical key must still agree with its captured key. Recheck current configuration and open facts after identity-provider callbacks. A changed, missing or contradictory identity refuses instead of returning an older routing plan. Explain changed input instead of returning older facts. There is no cross-call target handle: rename performs fresh capture and selection. Expected refusals use ordinary Error messages naming the actual unavailable URI, declined alias/name or changed/conflicting input; do not fabricate an empty successful edit. Unexpected provider/SDK errors surface.
     */
    prepare(uri: string, version: number, offset: number): RenameTarget {
        const selected = this.select(uri, version, offset);
        this.current(selected.capture, true);
        return { name: selected.target.name, location: { ...selected.target.location, source: { ...selected.target.location.source } } };
    }
    /**
     * Unverified implementation obligation.
     * Apply prepare's same source-scope, selection, validity and final-currentness rules to fresh inputs. newName is the decoded name, not source syntax. Reject empty names, control characters and unpaired surrogates with an explained Error; do not trim or normalize Unicode or whitespace. Use the real reader to admit an ordinary single-name spelling consuming the entire candidate token; otherwise render a backtick name escaping backticks/backslashes and validate that complete token with the reader. A temporary inert synthetic source may validate spelling only: require exactly one declaration, its whole nameOrigin consuming the candidate token and its decoded name equal to newName. Reject injected trailing declarations/tokens. Never accept unchecked interpolation or use a second keyword/identifier grammar. An unchanged decoded name returns an empty edit list after validation.
     * Plan the declaration name and all safely identified bound occurrences of that same declaration across the captured configured entries. Edit import source-name tokens, keeping distinct explicit aliases and their uses unchanged. Do not replace every location from bounded reference search, edit strings/comments, rename an unrelated same-named declaration, alter manifest metadata, generate files or execute a save. Same-spelled explicit alias routing refuses; selected qualifier renames and any other unproven routing refuse rather than dropping affected occurrences. Return only affected documents in URI code-unit order, each with exact captured source, its actual open version or absence for saved-only text, and distinct nonoverlapping scalar edits in descending start order. Return caller-isolated facts.
     * Check the hypothetical edited source snapshots through the same real language pipeline before returning. Clean compilation alone is insufficient: match source declarations by their mapped authored provenance/kind and every actual checked source-name token's spelling-owner declaration by mapped source/name ranges, including unchanged references that a new name could capture. Require a full two-way correspondence of complete before/after name sets: compare actual source owner kind and mapped nameOrigin (actual Name origin for aliases/captures), and stable builtin/external provenance where applicable. Unchanged tokens retain spelling/owner, while edited target-owned tokens have the decoded newName and mapped owner. Opaque NodeIds are valid only inside their own analysis and must not be compared across reparses. Refuse duplicate declarations, changed binding, lost qualified uses, new ambiguity or any new/retained prerequisite; expose the conflicting newName or actual finding. No partial plan escapes a refusal. This promises a complete intended edit against captured sources and detects supersession while computing; the ordinary editor owns later preview/apply, optional edit selection and undo. It does not promise filesystem/editor atomicity after the response.
     */
    rename(uri: string, version: number, offset: number, newName: string): Array<RenameDocumentEdit> {
        const selected = this.select(uri, version, offset);
        const token = this.spelling(newName);
        if (newName === selected.target.name) { this.current(selected.capture, true); return []; }
        const plan = this.plan(selected, token);
        this.prove(selected, plan, newName);
        this.current(selected.capture, true);
        return plan;
    }
    private select(uri: string, version: number, offset: number): RenameSelection {
        this.integer(version, 'Document version');
        this.integer(offset, 'Cursor offset');
        const configuration = this.configuration();
        if (!configuration || configuration.text === undefined) throw Error('Choose an available saved configuration before renaming.');
        const configured = this.checked(this.configurationReader.read({ sourceId: configuration.file, text: configuration.text }), 'Configuration');
        const open = this.openDocuments();
        const requesting = open.get(uri);
        if (!requesting || requesting.version !== version) throw Error('The requesting document is not the current open version: ' + uri);
        const capture: RenameCapture = { configuration, configured, open, sources: new Map(), saved: new Map(), localPaths: new Map(),
            identityKeys: new Map(), identityUris: new Set(), entries: [], routes: new Map() };
        const openPaths = new Map<string, string>();
        const openIdentities = new Map<string, string>();
        for (const sourceUri of open.keys()) {
            const path = this.localPath(capture, sourceUri);
            const identity = this.identityKey(capture, sourceUri);
            if (path !== undefined) {
                const previous = openPaths.get(path);
                if (previous !== undefined && previous !== sourceUri)
                    throw Error('Ambiguous open source identity for verified path ' + path + ': ' + previous + ' and ' + sourceUri);
                openPaths.set(path, sourceUri);
            }
            if (identity !== undefined) {
                const previous = openIdentities.get(identity);
                if (previous !== undefined && previous !== sourceUri)
                    throw Error('Ambiguous open physical source identity: ' + previous + ' and ' + sourceUri);
                openIdentities.set(identity, sourceUri);
            }
        }
        const routed = (located: string): string => {
            const previous = capture.routes.get(located);
            if (previous !== undefined) return previous;
            const path = this.localPath(capture, located);
            if (path === undefined) throw Error('Unverified primary source identity: ' + located);
            const identity = this.identityKey(capture, located);
            if (identity === undefined) throw Error('Physical source identity is unavailable: ' + located + '. Save the source first.');
            const matchingPath = openPaths.get(path);
            const matchingIdentity = openIdentities.get(identity);
            if (matchingPath !== undefined && this.identityKey(capture, matchingPath) !== identity)
                throw Error('Conflicting physical source identity for verified path ' + path + ': ' + located + ' and ' + matchingPath);
            if (matchingIdentity !== undefined && matchingIdentity !== matchingPath)
                throw Error('Conflicting physical source identity across requirement paths: ' + located + ' and ' + matchingIdentity);
            const sourceUri = matchingPath ?? located;
            capture.identityUris.add(located);
            capture.identityUris.add(sourceUri);
            capture.routes.set(located, sourceUri);
            capture.routes.set(sourceUri, sourceUri);
            return sourceUri;
        };
        const models = new Map<string, ModuleModel>();
        const capturedPaths = new Map<string, string>();
        const capturedIdentities = new Map<string, string>();
        const visit = (located: string): string => {
            const sourceUri = routed(located);
            if (models.has(sourceUri)) return sourceUri;
            const path = this.localPath(capture, sourceUri);
            if (path === undefined) throw Error('Unverified primary source identity: ' + sourceUri);
            const previous = capturedPaths.get(path);
            if (previous !== undefined && previous !== sourceUri)
                throw Error('Uncertain source identity for verified path ' + path + ': ' + previous + ' and ' + sourceUri);
            capturedPaths.set(path, sourceUri);
            const identity = capture.identityKeys.get(sourceUri)!;
            const previousIdentity = capturedIdentities.get(identity);
            if (previousIdentity !== undefined && previousIdentity !== sourceUri)
                throw Error('Uncertain physical source identity: ' + previousIdentity + ' and ' + sourceUri);
            capturedIdentities.set(identity, sourceUri);
            const supplied = open.get(sourceUri)?.source ?? this.sources.read(sourceUri);
            this.current(capture);
            if (supplied === undefined) throw Error('Unavailable source: ' + sourceUri);
            if (supplied.uri !== sourceUri) throw new TypeError('DocumentSources returned a different source URI: ' + sourceUri);
            const source = { uri: supplied.uri, text: supplied.text };
            capture.sources.set(sourceUri, source);
            if (!open.has(sourceUri)) capture.saved.set(sourceUri, source);
            const model = this.parse(source);
            models.set(sourceUri, model);
            for (const authored of this.locators(model)) {
                const located = this.locate(sourceUri, authored);
                if (located === undefined) throw Error('Unavailable source locator ' + authored + ' from ' + sourceUri);
                visit(located);
            }
            return sourceUri;
        };
        const manifest = this.manifestUri(configuration.file);
        for (const entry of configured.build.entries) {
            const located = this.locate(manifest, entry);
            if (located === undefined) throw Error('Unavailable configured source: ' + entry);
            capture.entries.push(visit(located));
        }
        if (!capture.sources.has(uri)) throw Error('The requesting source is outside the configured build: ' + uri);
        for (const sourceId of capture.sources.keys()) this.localPath(capture, sourceId);
        this.checked(requirementsFor(configured, [...capture.sources.keys()].map(sourceId => ({ sourceId,
            ...(capture.localPaths.get(sourceId) === undefined ? {} : { localPath: capture.localPaths.get(sourceId)! }) }))), 'Source requirements');
        const analysis = this.analyze(capture, [...models.values()]);
        if (!models.get(uri)!.nodes('name').length || offset >= Array.from(requesting.source.text).length)
            throw Error('There is no editable source name at this position in ' + uri);
        const selected = this.checked(analysis.specification.names.at(uri, offset), 'Rename source name');
        const key = this.rangeKey(selected.range);
        if (analysis.qualifiers.has(key)) throw Error('A qualified-reference prefix cannot be renamed safely.');
        const owner = analysis.specification.inspection.read(selected.declaration);
        if (analysis.aliases.has(owner.id)) throw Error('An import alias use cannot be renamed as its source declaration.');
        const origin = this.nameOrigin(owner);
        const name = this.name(owner);
        if (origin.kind !== 'source' || !capture.sources.has(origin.range.sourceId))
            throw Error('The selected name has no captured authored declaration: ' + name);
        this.validRange(origin.range, capture.sources);
        this.requireLocal(capture, origin.range.sourceId);
        for (const imported of analysis.specification.inspection.query('import-item')) {
            if (!imported.alias || imported.alias.decoded !== name) continue;
            const importedOrigin = imported.imported.segmentOrigins.at(-1);
            if (importedOrigin?.kind !== 'source') throw Error('Import alias routing is unavailable for ' + name);
            const source = this.checked(analysis.specification.names.at(importedOrigin.range.sourceId, importedOrigin.range.start.offset), 'Import alias routing');
            if (source.declaration === owner.id) throw Error('A same-spelled explicit alias makes rename routing uncertain: ' + name);
        }
        const occurrences = this.checked(analysis.specification.names.occurrencesOf(owner.id), 'Rename occurrences');
        if (occurrences.some(occurrence => analysis.qualifiers.has(this.rangeKey(occurrence.range))))
            throw Error('A qualified-reference prefix use prevents a safe rename of ' + name);
        if (!occurrences.some(occurrence => this.rangeKey(occurrence.range) === this.rangeKey(origin.range)))
            throw Error('The authored introduction is unavailable for ' + name);
        for (const occurrence of occurrences) this.requireLocal(capture, occurrence.range.sourceId);
        return { capture, analysis, selected, target: { name,
            location: { source: { ...requesting.source }, startOffset: selected.range.start.offset, endOffset: selected.range.end.offset } } };
    }
    private analyze(capture: RenameCapture, models: readonly ModuleModel[], renamed?: string): RenameAnalysis {
        const byUri = new Map(models.map(model => [model.locator, model]));
        const packages = capture.configured.packages.map(({ alias, phases }) => ({ alias, phases }));
        // Acquisition fixes these verified routes once. Hypothetical checking uses the same identities without further IO.
        const composer = new SourceComposer((owner, authored) => {
            const located = this.locate(owner, authored);
            return located === undefined ? undefined : capture.routes.get(located);
        });
        const resolution = composer.compose(capture.entries.map(uri => {
            const entry = byUri.get(uri)!;
            return { entry, dependencies: { modules: models.filter(model => model !== entry), packages } };
        }));
        const compilation = this.compiler.compile({ resolution });
        if (compilation.syntax.length) throw Error('Rejected source: ' + compilation.syntax.map(problem => problem.primaryRange.sourceId + ': ' + problem.explanation).join('; '));
        const specification = this.checked(compilation, renamed === undefined ? 'Rename analysis' : 'Cannot rename to ' + renamed);
        const names: CheckedSourceName[] = [];
        for (const model of models) {
            // An empty input model has no invented source identity in the compiler's name index.
            if (!model.nodes('name').length) continue;
            names.push(...this.checked(specification.names.inSource(model.locator), 'Checked source names in ' + model.locator));
        }
        const byRange = new Map<string, CheckedSourceName>();
        for (const name of names) {
            this.validRange(name.range, capture.sources);
            const key = this.rangeKey(name.range);
            if (byRange.has(key)) throw Error('Checked source names overlap at ' + key);
            byRange.set(key, name);
        }
        const qualifiers = new Set<string>();
        for (const model of models) {
            for (const reference of model.nodes('reference')) for (const id of reference.segments.slice(0, -1)) {
                const origin = model.node(id, 'name').origin;
                if (origin.kind === 'source') qualifiers.add(this.rangeKey(origin.range));
            }
            for (const member of model.nodes('member-expression')) {
                let receiver = model.node(member.receiver);
                while (receiver.kind === 'grouped-expression') receiver = model.node(receiver.inner);
                if (receiver.kind !== 'name-expression') continue;
                const reference = model.node(receiver.reference, 'reference');
                const origin = reference.segments.length ? model.node(reference.segments.at(-1)!, 'name').origin : undefined;
                if (origin?.kind !== 'source') continue;
                const name = byRange.get(this.rangeKey(origin.range));
                if (name && ['concept', 'component', 'class', 'interface'].includes(specification.inspection.read(name.declaration).kind))
                    qualifiers.add(this.rangeKey(origin.range));
            }
        }
        const aliases = new Set([...specification.inspection.query('import-item')].flatMap(item => item.alias ? [item.alias.id] : []));
        return { specification, names, byRange, qualifiers, aliases };
    }
    private parse(source: SourceDocument): ModuleModel {
        const read = this.reader.read({ sourceId: source.uri, text: source.text });
        if (read.status === 'rejected') throw Error('Rejected source: ' + source.uri + ': ' + read.diagnostics.map(problem => problem.explanation).join('; '));
        return new LangiumModel(source.uri, read.document);
    }
    private locators(model: ModuleModel): string[] {
        return [...model.nodes('use').map(node => model.node(node.locator, 'string-literal').value),
            ...model.nodes('include').map(node => model.node(node.locator, 'string-literal').value),
            ...model.nodes('examples-attachment').map(node => model.node(node.locator, 'string-literal').value),
            ...model.nodes('reference').flatMap(node => node.lookup?.kind === 'module' ? [node.lookup.locator] : [])];
    }
    private spelling(name: string): string {
        if (!name.length) throw Error('A rename cannot use an empty name.');
        for (const scalar of name) {
            const value = scalar.codePointAt(0)!;
            if (value <= 0x1f || value >= 0x7f && value <= 0x9f || value >= 0xd800 && value <= 0xdfff)
                throw Error('A rename name cannot contain control characters or unpaired surrogates.');
        }
        const accepted = (token: string): boolean => {
            const result = this.reader.read({ sourceId: 'expec-rename:spelling', text: 'type ' + token + ' {}' });
            if (result.status !== 'accepted') return false;
            const model = new LangiumModel('expec-rename:spelling', result.document);
            const roots = model.roots();
            if (roots.length !== 1) return false;
            const declaration = model.node(roots[0]);
            if (declaration.kind !== 'record-type-declaration') return false;
            const candidate = model.node(declaration.name, 'name'), origin = candidate.origin;
            return candidate.decoded === name && origin.kind === 'source' && origin.range.start.offset === 5
                && origin.range.end.offset === 5 + Array.from(token).length;
        };
        if (accepted(name)) return name;
        const quoted = '`' + name.replaceAll('\\', '\\\\').replaceAll('`', '\\`') + '`';
        if (accepted(quoted)) return quoted;
        throw Error('The language cannot represent this rename name: ' + name);
    }
    private plan(selection: RenameSelection, token: string): RenameDocumentEdit[] {
        const { capture, analysis, selected } = selection;
        const occurrences = this.checked(analysis.specification.names.occurrencesOf(selected.declaration), 'Rename occurrences');
        const documents = new Map<string, Map<string, RenameTextEdit>>();
        for (const occurrence of occurrences) {
            this.validRange(occurrence.range, capture.sources);
            this.requireLocal(capture, occurrence.range.sourceId);
            const changes = documents.get(occurrence.range.sourceId) ?? new Map();
            changes.set(this.rangeKey(occurrence.range), { startOffset: occurrence.range.start.offset,
                endOffset: occurrence.range.end.offset, newText: token });
            documents.set(occurrence.range.sourceId, changes);
        }
        return [...documents].sort(([left], [right]) => this.compare(left, right)).map(([uri, changes]) => {
            const edits = [...changes.values()].sort((left, right) => right.startOffset - left.startOffset || right.endOffset - left.endOffset);
            for (let index = 1; index < edits.length; index++) if (edits[index].endOffset > edits[index - 1].startOffset)
                throw Error('Rename edits overlap in ' + uri);
            const open = capture.open.get(uri);
            return { source: { ...capture.sources.get(uri)! }, ...(open ? { version: open.version } : {}), edits };
        });
    }
    private prove(selection: RenameSelection, plan: readonly RenameDocumentEdit[], newName: string): void {
        const { capture, analysis } = selection;
        const changes = new Map(plan.map(document => [document.source.uri, document.edits]));
        const edited = new Map([...capture.sources].map(([uri, source]) => {
            let scalars = Array.from(source.text);
            for (const edit of changes.get(uri) ?? []) scalars = scalars.slice(0, edit.startOffset).concat(Array.from(edit.newText), scalars.slice(edit.endOffset));
            return [uri, { uri, text: scalars.join('') }] as const;
        }));
        const hypothetical: RenameCapture = { ...capture, sources: edited };
        const next = this.analyze(hypothetical, [...edited.values()].map(source => this.parse(source)), newName);
        const expected = new Map<string, string>();
        for (const name of analysis.names) {
            const range = this.mappedRange(name.range, changes);
            const key = this.rangeKey(range);
            if (expected.has(key)) throw Error('Cannot rename to ' + newName + ': mapped names overlap.');
            const spelling = name.declaration === selection.selected.declaration ? newName : name.spelling;
            expected.set(key, JSON.stringify([spelling, this.ownerKey(analysis.specification.inspection.read(name.declaration), changes)]));
        }
        if (next.names.length !== expected.size) throw Error('Cannot rename to ' + newName + ': checked source names changed.');
        for (const name of next.names) {
            const fact = JSON.stringify([name.spelling, this.ownerKey(next.specification.inspection.read(name.declaration))]);
            if (expected.get(this.rangeKey(name.range)) !== fact)
                throw Error('Cannot rename to ' + newName + ': a source name would change its binding in ' + name.range.sourceId);
            expected.delete(this.rangeKey(name.range));
        }
        if (expected.size) throw Error('Cannot rename to ' + newName + ': a checked source name disappeared.');
    }
    private ownerKey(owner: Item, changes: ReadonlyMap<string, readonly RenameTextEdit[]> = new Map()): string {
        const origin = this.nameOrigin(owner);
        if (origin.kind === 'builtin') return JSON.stringify(['builtin', owner.kind, origin.name]);
        if (origin.kind === 'external') return JSON.stringify(['external', owner.kind, origin.module, origin.path]);
        const range = this.mappedRange(origin.range, changes);
        return JSON.stringify(['source', owner.kind, range.sourceId, range.start.offset, range.end.offset]);
    }
    private nameOrigin(owner: Item): Origin {
        if (owner.kind === 'name') return owner.origin;
        if ('nameOrigin' in owner) return owner.nameOrigin;
        throw Error('The selected declaration has no authored name.');
    }
    private name(owner: Item): string {
        if (owner.kind === 'name') return owner.decoded;
        if ('name' in owner && typeof owner.name === 'string') return owner.name;
        throw Error('The selected declaration has no decoded name.');
    }
    private mappedRange(range: SourceRange, changes: ReadonlyMap<string, readonly RenameTextEdit[]>): SourceRange {
        const edits = [...(changes.get(range.sourceId) ?? [])].sort((left, right) => left.startOffset - right.startOffset);
        const position = (offset: number): number => {
            let delta = 0;
            for (const edit of edits) {
                if (offset <= edit.startOffset) break;
                if (offset < edit.endOffset) throw Error('A rename would split another source-name range.');
                delta += Array.from(edit.newText).length - (edit.endOffset - edit.startOffset);
            }
            return offset + delta;
        };
        return { sourceId: range.sourceId, start: { ...range.start, offset: position(range.start.offset) },
            end: { ...range.end, offset: position(range.end.offset) } };
    }
    private configuration(): ConnectionConfiguration | undefined {
        const configuration = this.workspace.configuration();
        return configuration === undefined ? undefined : { file: configuration.file, text: configuration.text, writable: configuration.writable };
    }
    private openDocuments(): Map<string, RenameBuffer> {
        const result = new Map<string, RenameBuffer>();
        for (const document of this.workspace.openDocuments()) {
            this.integer(document.version, 'Open document version');
            if (result.has(document.source.uri)) throw Error('Duplicate open document URI: ' + document.source.uri);
            result.set(document.source.uri, { source: { uri: document.source.uri, text: document.source.text }, version: document.version });
        }
        return result;
    }
    private current(capture: RenameCapture, rereadSaved = false): void {
        const openKey = (documents: ReadonlyMap<string, RenameBuffer>): string => JSON.stringify([...documents.values()]
            .sort((left, right) => this.compare(left.source.uri, right.source.uri)).map(document => [document.source.uri, document.source.text, document.version]));
        const check = (): void => {
            if (JSON.stringify(this.configuration()) !== JSON.stringify(capture.configuration) || openKey(this.openDocuments()) !== openKey(capture.open))
                throw Error('Rename input changed while checking the configured sources.');
        };
        check();
        if (rereadSaved) {
            for (const [uri, source] of capture.saved) {
                const current = this.sources.read(uri);
                check();
                if (current === undefined || current.uri !== uri || current.text !== source.text) throw Error('Saved rename input changed: ' + uri);
            }
            for (const uri of capture.identityUris) {
                const identity = this.identities.keyOf(uri, capture.configuration.file);
                check();
                if (identity === undefined || identity !== capture.identityKeys.get(uri)) throw Error('Rename source identity changed: ' + uri);
            }
        }
        check();
    }
    private identityKey(capture: RenameCapture, uri: string): string | undefined {
        if (!capture.identityKeys.has(uri)) {
            const identity = this.identities.keyOf(uri, capture.configuration.file);
            this.current(capture);
            capture.identityKeys.set(uri, identity);
        }
        return capture.identityKeys.get(uri);
    }
    private localPath(capture: RenameCapture, uri: string): string | undefined {
        if (!capture.localPaths.has(uri)) {
            const path = this.sources.localPath(uri, capture.configuration.file);
            this.current(capture);
            capture.localPaths.set(uri, path);
        }
        return capture.localPaths.get(uri);
    }
    private requireLocal(capture: RenameCapture, uri: string): void {
        if (capture.localPaths.get(uri) === undefined) throw Error('The authored source has no verified primary manifest-relative path: ' + uri);
    }
    private checked<T>(check: Check<T>, context: string): T {
        const findings = [...check.problems.map(problem => problem.code + ': ' + problem.message),
            ...check.deferred.map(requirement => 'Deferred: ' + requirement.requires)];
        if (findings.length || check.value === undefined) throw Error(context + ': ' + (findings.join('; ') || 'No editable source name is available.'));
        return check.value;
    }
    private validRange(range: SourceRange, sources: ReadonlyMap<string, SourceDocument>): void {
        const source = sources.get(range.sourceId);
        if (!source || !Number.isInteger(range.start.offset) || !Number.isInteger(range.end.offset) || range.start.offset < 0
            || range.end.offset <= range.start.offset || range.end.offset > Array.from(source.text).length)
            throw Error('A checked name has no valid captured source range: ' + range.sourceId);
    }
    private manifestUri(file: string): string {
        if (isAbsolute(file)) return pathToFileURL(file).href;
        try { return new URL(file).href; }
        catch (error) { if (error instanceof TypeError) throw Error('Choose an absolute saved manifest filename or URI: ' + file); throw error; }
    }
    private locate(owner: string, authored: string): string | undefined {
        try { return new URL(authored, owner).href; }
        catch (error) { if (error instanceof TypeError) return undefined; throw error; }
    }
    private rangeKey(range: SourceRange): string { return JSON.stringify([range.sourceId, range.start.offset, range.end.offset]); }
    private compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
    private integer(value: number, name: string): void {
        if (!Number.isInteger(value) || value < 0) throw new RangeError(name + ' must be a finite nonnegative integer.');
    }
}
