import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { onTestFinished } from 'vitest';
import type { DeliveryInput, WorkflowGithub } from '../../../.github/ci/vsix-delivery.js';

type RecordValue = Record<string, any>;
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const platforms = { windows: 'windows-latest', linux: 'ubuntu-latest' } as const;
const names = { windows: 'expec-vscode-windows.vsix', linux: 'expec-vscode-linux.vsix' };
const commit = 'a'.repeat(40);

export async function deliveredPair(windows: string, linux: string, options: {
  runId?: number; runAttempt?: number; windowsAttempt?: number; linuxAttempt?: number;
  windowsArtifactId?: number; linuxArtifactId?: number;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'expec-delivery-unit-'));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const runId = options.runId ?? 700, runAttempt = options.runAttempt ?? 3;
  const run: RecordValue = { id: runId, run_attempt: runAttempt, head_sha: commit, head_branch: 'main',
    event: 'push', path: '.github/workflows/build.yml', status: 'completed', conclusion: 'success',
    head_repository: { full_name: 'jreyno77/ExecutableSpecificationLanguageVsCodeExtension' } };
  const jobs = new Map<number, RecordValue[]>();
  const artifact = async (platform: keyof typeof platforms, text: string, attempt: number, id: number) => {
    const directory = join(root, platform); await mkdir(directory);
    const bytes = Buffer.from(text), sha256 = digest(bytes);
    await writeFile(join(directory, 'expec-vscode-extension.vsix'), bytes);
    await writeFile(join(directory, 'provenance.json'), JSON.stringify({
      kind: 'tested-vsix', commit, run: runId, attempt, platform: platforms[platform], package: 'expec-vscode-extension.vsix',
      suppliedSha256: sha256, copiedSha256: sha256, postNativeSha256: sha256, finalSha256: sha256,
    }));
    const job: RecordValue = { id: id + 1000, name: 'Node 24 / ' + platforms[platform],
      status: 'completed', conclusion: 'success', head_sha: commit,
      steps: ['Test affected components', 'Verify tested VSIX', 'Upload verified VSIX']
        .map((name, index) => ({ name, number: index + 4, status: 'completed', conclusion: 'success' })) };
    jobs.set(attempt, [...jobs.get(attempt) ?? [], job]);
    return { artifactId: id, directory, attempt, sha256, job, metadata: {
      id, name: 'expec-vsix-' + platforms[platform] + '-' + runId + '-' + attempt, expired: false,
      created_at: new Date(Date.UTC(2026, 9, 10, 0, 0, attempt)).toISOString(),
      workflow_run: { id: runId, head_sha: commit, head_branch: 'main' },
    } };
  };
  const win = await artifact('windows', windows, options.windowsAttempt ?? 2, options.windowsArtifactId ?? 12002);
  const lin = await artifact('linux', linux, options.linuxAttempt ?? 3, options.linuxArtifactId ?? 13003);
  const input: DeliveryInput = { repository: { owner: 'jreyno77', repo: 'ExecutableSpecificationLanguageVsCodeExtension' },
    buildRunId: runId, windows: { artifactId: win.artifactId, directory: win.directory },
    linux: { artifactId: lin.artifactId, directory: lin.directory } };
  return { commit, run, jobs, windows: win, linux: lin, input,
    replaceWindowsArchive: (text: string) => writeFile(join(win.directory, 'expec-vscode-extension.vsix'), text),
    patchWindowsProvenance: async (changes: RecordValue, remove: readonly string[] = []) => {
      const path = join(win.directory, 'provenance.json');
      const value = JSON.parse(await readFile(path, 'utf8')); Object.assign(value, changes);
      for (const field of remove) delete value[field];
      await writeFile(path, JSON.stringify(value));
    },
    newSuccessfulAttempt: (attempt: number, windowsBytes: string, linuxBytes: string) => deliveredPair(windowsBytes, linuxBytes, {
      runId, runAttempt: attempt, windowsAttempt: attempt, linuxAttempt: attempt,
      windowsArtifactId: attempt * 1000 + 2, linuxArtifactId: attempt * 1000 + 3,
    }),
  };
}
type Pair = Awaited<ReturnType<typeof deliveredPair>>;

/** Recorded native GitHub ports; effects/bytes come from the requests, never an expected delivery answer. */
export function recordedGithub(pair: Pair) {
  const artifacts: RecordValue[] = [pair.windows.metadata, pair.linux.metadata];
  const jobs = new Map(pair.jobs), history: { route: string; parameters: RecordValue }[] = [];
  const tags = new Map<string, RecordValue>(), annotated = new Map<string, RecordValue>();
  let release: RecordValue | undefined, nextAssetId = 501;
  const assets = new Map<number, { metadata: RecordValue; bytes: Buffer }>();
  const deployments: RecordValue[] = [], statuses = new Map<number, RecordValue[]>();
  let failDeployment = false, failStatus = false, finalWindowsBytes: Buffer | undefined;
  const tag = 'expec-' + pair.commit;
  const url = 'https://github.com/jreyno77/ExecutableSpecificationLanguageVsCodeExtension/releases/tag/' + tag;
  const error404 = () => Object.assign(new Error('Native GitHub resource absent.'), { status: 404 });
  const addAsset = (name: string, bytes: Buffer, id = nextAssetId++) => {
    const metadata = { id, name, state: 'uploaded', size: bytes.length };
    assets.set(id, { metadata, bytes: Buffer.from(bytes) }); nextAssetId = Math.max(nextAssetId, id + 1);
    return metadata;
  };
  const installRelease = (draft: boolean, releaseId: number) => {
    tags.set(tag, { type: 'commit', sha: pair.commit });
    release = { id: releaseId, tag_name: tag, draft, html_url: url,
      upload_url: 'https://uploads.github.com/repos/jreyno77/ExecutableSpecificationLanguageVsCodeExtension/releases/' + releaseId + '/assets{?name,label}' };
  };
  const github: WorkflowGithub = {
    async request(route, parameters = {}) {
      const p = parameters as RecordValue; history.push({ route, parameters: p });
      if (route.includes('/actions/runs/{run_id}') && !route.includes('/attempts/')) return { data: pair.run };
      if (route === 'GET /repos/{owner}/{repo}/git/ref/{ref}') {
        const object = tags.get(String(p.ref).replace(/^tags\//, '')); if (!object) throw error404();
        return { data: { object } };
      }
      if (route === 'GET /repos/{owner}/{repo}/git/tags/{tag_sha}') return { data: { object: annotated.get(p.tag_sha) } };
      if (route === 'POST /repos/{owner}/{repo}/git/refs') {
        const object = { type: 'commit', sha: p.sha }; tags.set(String(p.ref).replace(/^refs\/tags\//, ''), object); return { data: { object } };
      }
      if (route === 'GET /repos/{owner}/{repo}/releases/tags/{tag}') {
        if (!release) throw error404(); return { data: { ...release } };
      }
      if (route === 'POST /repos/{owner}/{repo}/releases') { installRelease(true, 500); return { data: { ...release } }; }
      if (route.startsWith('POST https://uploads.github.com/')) {
        if (!release || p.release_id !== release.id) throw new Error('Wrong native release upload identity.');
        return { data: addAsset(p.name, Buffer.from(p.data)) };
      }
      if (route === 'GET /repos/{owner}/{repo}/releases/assets/{asset_id}') {
        if (p.headers?.accept !== 'application/octet-stream') throw new Error('Native binary asset request must ask for bytes.');
        const asset = assets.get(p.asset_id); if (!asset) throw error404();
        return { data: Buffer.from(!release?.draft && asset.metadata.name === names.windows && finalWindowsBytes ? finalWindowsBytes : asset.bytes) };
      }
      if (route === 'PATCH /repos/{owner}/{repo}/releases/{release_id}') {
        if (!release || release.id !== p.release_id) throw new Error('Wrong native release update identity.');
        release.draft = p.draft; return { data: { ...release } };
      }
      if (route === 'POST /repos/{owner}/{repo}/deployments') {
        if (failDeployment) { failDeployment = false; throw new Error('Actual native deployment creation failed.'); }
        const deployment = { id: 900 + deployments.length, sha: p.ref, environment: p.environment, payload: structuredClone(p.payload) };
        deployments.push(deployment); return { data: deployment };
      }
      if (route === 'POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses') {
        if (failStatus) { failStatus = false; throw new Error('Actual native status recording failed.'); }
        const status = { id: 1000 + [...statuses.values()].flat().length, state: p.state, environment_url: p.environment_url };
        statuses.set(p.deployment_id, [...statuses.get(p.deployment_id) ?? [], status]); return { data: status };
      }
      throw new Error('Unexpected native GitHub request: ' + route);
    },
    async paginate(route, parameters = {}) {
      const p = parameters as RecordValue; history.push({ route, parameters: p });
      if (route.endsWith('/artifacts')) return artifacts;
      if (route.endsWith('/attempts/{attempt_number}/jobs')) return jobs.get(p.attempt_number) ?? [];
      if (route.endsWith('/releases/{release_id}/assets')) return [...assets.values()].map(asset => asset.metadata);
      if (route.endsWith('/deployments')) return deployments;
      if (route.endsWith('/deployments/{deployment_id}/statuses')) return statuses.get(p.deployment_id) ?? [];
      throw new Error('Unexpected native GitHub pagination: ' + route);
    },
  };
  return { github, run: pair.run, windowsProducerJob: pair.windows.job,
    expireArtifact: (id: number) => { const artifact = artifacts.find(item => item.id === id); if (!artifact) throw new Error('Native artifact absent.'); artifact.expired = true; },
    removeArtifact: (id: number) => { const index = artifacts.findIndex(item => item.id === id); if (index >= 0) artifacts.splice(index, 1); },
    existingAnnotatedTag: ({ tagObjectSha, commit }: { tagObjectSha: string; commit: string }) => {
      tags.set(tag, { type: 'tag', sha: tagObjectSha }); annotated.set(tagObjectSha, { type: 'commit', sha: commit });
    },
    existingDraft: ({ releaseId, windowsAssetId, windowsBytes }: { releaseId: number; windowsAssetId: number; windowsBytes: Buffer }) => {
      installRelease(true, releaseId); addAsset(names.windows, windowsBytes, windowsAssetId);
    },
    existingPublishedPair: ({ releaseId, windowsAssetId, linuxAssetId }: { releaseId: number; windowsAssetId: number; linuxAssetId: number }) => {
      installRelease(false, releaseId);
      addAsset(names.windows, Buffer.from('Windows tested bytes'), windowsAssetId);
      addAsset(names.linux, Buffer.from('Linux tested bytes'), linuxAssetId);
    },
    existingSuccessfulDeployment: (value: RecordValue) => {
      const { id, sha, environment, ...payload } = value; deployments.push({ id, sha, environment, payload });
      statuses.set(id, [{ id: 999, state: 'success', environment_url: url }]);
    },
    failNextDeploymentCreate: () => { failDeployment = true; }, failNextSuccessStatus: () => { failStatus = true; },
    replaceWindowsDownloadAfterPublication: (bytes: Buffer) => { finalWindowsBytes = bytes; },
    addSuccessfulPair: (next: Pair) => {
      pair.run.run_attempt = next.run.run_attempt; artifacts.push(next.windows.metadata, next.linux.metadata);
      for (const [attempt, list] of next.jobs) jobs.set(attempt, list);
    },
    publishedTagCommit: () => {
      let object = tags.get(tag); while (object?.type === 'tag') object = annotated.get(object.sha); return object?.sha;
    },
    releaseUrl: () => release?.html_url, releaseIsDraft: () => release?.draft,
    assetBytes: (platform: keyof typeof names) => [...assets.values()].find(asset => asset.metadata.name === names[platform])?.bytes,
    actualReleaseIdentity: () => ({ releaseId: release?.id,
      windowsAssetId: [...assets.values()].find(asset => asset.metadata.name === names.windows)?.metadata.id,
      linuxAssetId: [...assets.values()].find(asset => asset.metadata.name === names.linux)?.metadata.id }),
    actualDeploymentIdentity: () => deployments.map(item => ({ id: item.id, sha: item.sha, payload: item.payload })),
    createdReleases: () => history.filter(item => item.route === 'POST /repos/{owner}/{repo}/releases'),
    uploadedAssets: () => history.filter(item => item.route.startsWith('POST https://uploads.github.com/')).map(item => ({
      platform: item.parameters.name === names.windows ? 'windows' : 'linux', bytes: item.parameters.data,
    })),
    createdDeployments: () => history.filter(item => item.route === 'POST /repos/{owner}/{repo}/deployments'),
    successStatuses: () => [...statuses.values()].flat().filter(item => item.state === 'success'),
    successfulDeployments: () => deployments.filter(item => statuses.get(item.id)?.some(status => status.state === 'success'))
      .map(item => ({ sha: item.sha, environment: item.environment, ...item.payload })),
    requests: history,
  };
}
