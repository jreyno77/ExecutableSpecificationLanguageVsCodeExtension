import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

/** The ordinary Octokit ports supplied by actions/github-script. */
export interface WorkflowGithub {
  request(route: string, parameters?: Record<string, unknown>): Promise<{ data: unknown }>;
  paginate(route: string, parameters?: Record<string, unknown>): Promise<unknown[]>;
}
export interface DeliveryInput {
  repository: { owner: string; repo: string };
  buildRunId: number;
  windows: { artifactId: number; directory: string };
  linux: { artifactId: number; directory: string };
}
const platforms = { windows: 'windows-latest', linux: 'ubuntu-latest' } as const;
const assetNames = { windows: 'expec-vscode-windows.vsix', linux: 'expec-vscode-linux.vsix' } as const;
const archiveName = 'expec-vscode-extension.vsix';
const platformKeys = ['windows', 'linux'] as const;
type Platform = typeof platformKeys[number];
type NativeRecord = Record<string, unknown>;

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function record(value: unknown, description: string): NativeRecord {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), 'Invalid ' + description + '.');
  return value as NativeRecord;
}
function id(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function absent(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'status' in error && error.status === 404;
}
async function find(github: WorkflowGithub, route: string, parameters: NativeRecord): Promise<NativeRecord | undefined> {
  try { return record((await github.request(route, parameters)).data, 'GitHub response'); }
  catch (error) { if (absent(error)) return undefined; throw error; }
}

/** Select immutable artifact IDs; Actions downloads these exact IDs before publication. */
export async function selectVsixArtifacts(github: WorkflowGithub, input: Pick<DeliveryInput, 'repository' | 'buildRunId'>) {
  const { repository, buildRunId } = input;
  requireValue(id(buildRunId) && /^[A-Za-z0-9_.-]+$/.test(repository.owner) && /^[A-Za-z0-9_.-]+$/.test(repository.repo), 'Invalid producing repository/run.');
  const run = record((await github.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}', {
    ...repository, run_id: buildRunId,
  })).data, 'build run');
  const headRepository = record(run.head_repository, 'build head repository');
  requireValue(run.id === buildRunId && id(run.run_attempt) && typeof run.head_sha === 'string' && /^[a-f0-9]{40}$/.test(run.head_sha)
    && run.event === 'push' && run.head_branch === 'main' && run.path === '.github/workflows/build.yml'
    && run.status === 'completed' && run.conclusion === 'success'
    && typeof headRepository.full_name === 'string'
    && headRepository.full_name.toLowerCase() === (repository.owner + '/' + repository.repo).toLowerCase(), 'Producing run is not a successful repository main build.');
  const commit = run.head_sha, runAttempt = run.run_attempt;
  const artifacts = (await github.paginate('GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts', {
    ...repository, run_id: buildRunId, per_page: 100,
  })).map(value => record(value, 'build artifact'));
  const jobs = new Map<number, NativeRecord[]>();
  async function select(platform: Platform) {
    const prefix = 'expec-vsix-' + platforms[platform] + '-' + buildRunId + '-';
    const candidates = artifacts.filter(artifact => typeof artifact.name === 'string' && artifact.name.startsWith(prefix));
    requireValue(candidates.length > 0, 'Missing ' + platform + ' tested archive.');
    for (const candidate of candidates) {
      requireValue(id(candidate.id) && typeof candidate.created_at === 'string' && Number.isFinite(Date.parse(candidate.created_at)), 'Invalid artifact identity/date.');
    }
    candidates.sort((left, right) => Date.parse(String(right.created_at)) - Date.parse(String(left.created_at)) || Number(right.id) - Number(left.id));
    const artifact = candidates[0];
    const suffix = String(artifact.name).slice(prefix.length), attempt = Number(suffix);
    const provenance = record(artifact.workflow_run, 'artifact build provenance');
    requireValue(/^[1-9][0-9]*$/.test(suffix) && id(attempt) && attempt <= runAttempt
      && artifact.expired === false && provenance.id === buildRunId && provenance.head_sha === commit
      && provenance.head_branch === 'main' && candidates.filter(candidate => candidate.name === artifact.name).length === 1,
      'Invalid latest ' + platform + ' artifact provenance.');
    let attemptJobs = jobs.get(attempt);
    if (!attemptJobs) {
      attemptJobs = (await github.paginate('GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs', {
        ...repository, run_id: buildRunId, attempt_number: attempt, per_page: 100,
      })).map(value => record(value, 'producer job'));
      jobs.set(attempt, attemptJobs);
    }
    const matching = attemptJobs.filter(job => typeof job.name === 'string' && job.name.split(/[^a-z0-9-]+/i).includes(platforms[platform]));
    requireValue(matching.length === 1, 'Missing or ambiguous ' + platform + ' producer job.');
    const job = matching[0];
    requireValue(id(job.id) && job.head_sha === commit && job.status === 'completed' && job.conclusion === 'success' && Array.isArray(job.steps), 'Platform producer did not succeed.');
    const steps = job.steps.map(value => record(value, 'producer step'));
    let previousNumber = 0, previousIndex = -1;
    for (const name of ['Test affected components', 'Verify tested VSIX', 'Upload verified VSIX']) {
      const matchingSteps = steps.filter(step => step.name === name);
      requireValue(matchingSteps.length === 1, 'Missing or ambiguous producer step: ' + name);
      const step = matchingSteps[0], index = steps.indexOf(step);
      requireValue(id(step.number) && step.number > previousNumber && index > previousIndex
        && step.status === 'completed' && step.conclusion === 'success', 'Producer test/verification/upload did not succeed in order.');
      previousNumber = step.number; previousIndex = index;
    }
    return { artifactId: artifact.id as number, attempt, jobId: job.id as number };
  }
  const windows = await select('windows'), linux = await select('linux');
  requireValue(windows.artifactId !== linux.artifactId, 'Platform artifacts are not distinct.');
  return { commit, run: buildRunId, attempt: runAttempt, windows, linux };
}

async function readArchive(input: DeliveryInput[Platform], platform: Platform, selected: Awaited<ReturnType<typeof selectVsixArtifacts>>) {
  requireValue(isAbsolute(input.directory) && (await lstat(input.directory)).isDirectory(), 'Archive download must be an owned absolute directory.');
  const directory = await realpath(input.directory), names = (await readdir(directory)).sort();
  requireValue(names.length === 2 && names[0] === archiveName && names[1] === 'provenance.json', 'Archive download must contain exactly the package and provenance.');
  for (const name of names) requireValue((await lstat(join(directory, name))).isFile(), 'Archive/provenance must be ordinary files.');
  const bytes = await readFile(join(directory, archiveName)), digest = sha256(bytes);
  const provenance = record(JSON.parse(await readFile(join(directory, 'provenance.json'), 'utf8')), 'archive provenance');
  requireValue(bytes.length > 0 && provenance.kind === 'tested-vsix' && provenance.package === archiveName
    && provenance.commit === selected.commit && provenance.run === selected.run && provenance.attempt === selected[platform].attempt
    && provenance.platform === platforms[platform]
    && ['suppliedSha256', 'copiedSha256', 'postNativeSha256', 'finalSha256'].every(field => provenance[field] === digest), 'Downloaded package differs from its installed/tested producer evidence.');
  return { directory, bytes, sha256: digest };
}
async function checkTag(github: WorkflowGithub, repository: DeliveryInput['repository'], tag: string, commit: string) {
  let reference = await find(github, 'GET /repos/{owner}/{repo}/git/ref/{ref}', { ...repository, ref: 'tags/' + tag });
  if (!reference) {
    reference = record((await github.request('POST /repos/{owner}/{repo}/git/refs', { ...repository, ref: 'refs/tags/' + tag, sha: commit })).data, 'created tag');
  }
  let object = record(reference.object, 'tag object');
  const seen = new Set<unknown>();
  while (object.type === 'tag') {
    requireValue(typeof object.sha === 'string' && /^[a-f0-9]{40}$/.test(object.sha) && !seen.has(object.sha), 'Invalid annotated tag chain.');
    seen.add(object.sha);
    const annotated = record((await github.request('GET /repos/{owner}/{repo}/git/tags/{tag_sha}', { ...repository, tag_sha: object.sha })).data, 'annotated tag');
    object = record(annotated.object, 'peeled tag object');
  }
  requireValue(object.type === 'commit' && object.sha === commit, 'Release tag does not peel to the tested main commit.');
}
function checkRelease(value: NativeRecord, tag: string) {
  requireValue(id(value.id) && value.tag_name === tag && typeof value.draft === 'boolean'
    && typeof value.html_url === 'string' && value.html_url.startsWith('https://github.com/'), 'Invalid release identity.');
  return { id: value.id, draft: value.draft, url: value.html_url };
}
async function releaseAssets(github: WorkflowGithub, repository: DeliveryInput['repository'], releaseId: number) {
  const assets = (await github.paginate('GET /repos/{owner}/{repo}/releases/{release_id}/assets', { ...repository, release_id: releaseId, per_page: 100 }))
    .map(value => record(value, 'release asset'));
  requireValue(assets.every(asset => id(asset.id) && asset.state === 'uploaded' && Object.values(assetNames).some(name => name === asset.name))
    && new Set(assets.map(asset => asset.id)).size === assets.length && new Set(assets.map(asset => asset.name)).size === assets.length, 'Release has unexpected or conflicting assets.');
  return assets;
}
async function verifyAsset(github: WorkflowGithub, repository: DeliveryInput['repository'], asset: NativeRecord, bytes: Buffer) {
  requireValue(asset.size === bytes.length, 'Release asset size differs from tested bytes.');
  const data = (await github.request('GET /repos/{owner}/{repo}/releases/assets/{asset_id}', {
    ...repository, asset_id: asset.id, headers: { accept: 'application/octet-stream' },
  })).data;
  requireValue(data instanceof ArrayBuffer || data instanceof Uint8Array, 'Release asset response is not binary.');
  const downloaded = data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from(data);
  requireValue(downloaded.equals(bytes), 'Release asset download differs from tested bytes.');
}

/** Publish only the downloaded, installed-and-tested pair; retries retain matching native identities. */
export async function publishVsixDelivery(github: WorkflowGithub, input: DeliveryInput) {
  const selected = await selectVsixArtifacts(github, input), { repository } = input;
  requireValue(platformKeys.every(platform => input[platform].artifactId === selected[platform].artifactId), 'Downloaded artifacts are not the latest validated pair.');
  const windows = await readArchive(input.windows, 'windows', selected), linux = await readArchive(input.linux, 'linux', selected);
  requireValue(windows.directory !== linux.directory, 'Platform downloads are not isolated.');
  const archives = { windows, linux }, tag = 'expec-' + selected.commit;
  await checkTag(github, repository, tag, selected.commit);
  let release = await find(github, 'GET /repos/{owner}/{repo}/releases/tags/{tag}', { ...repository, tag });
  if (!release) release = record((await github.request('POST /repos/{owner}/{repo}/releases', {
    ...repository, tag_name: tag, target_commitish: selected.commit, name: 'expec VS Code ' + selected.commit, draft: true, prerelease: false,
  })).data, 'created draft release');
  const initial = checkRelease(release, tag), existing = await releaseAssets(github, repository, initial.id);
  // Refuse any existing mismatch before uploading a missing partner.
  for (const platform of platformKeys) {
    const asset = existing.find(value => value.name === assetNames[platform]);
    if (asset) await verifyAsset(github, repository, asset, archives[platform].bytes);
  }
  const assetIds = { windows: 0, linux: 0 };
  for (const platform of platformKeys) {
    let asset = existing.find(value => value.name === assetNames[platform]);
    if (!asset) {
      const bytes = archives[platform].bytes;
      asset = record((await github.request('POST https://uploads.github.com/repos/{owner}/{repo}/releases/{release_id}/assets{?name}', {
        ...repository, release_id: initial.id, name: assetNames[platform], data: bytes,
        headers: { 'content-type': 'application/octet-stream', 'content-length': bytes.length },
      })).data, 'uploaded release asset');
      requireValue(id(asset.id) && asset.name === assetNames[platform] && asset.state === 'uploaded', 'Uploaded asset identity differs.');
      await verifyAsset(github, repository, asset, bytes);
    }
    assetIds[platform] = asset.id as number;
  }
  const current = await selectVsixArtifacts(github, input);
  requireValue(JSON.stringify(current) === JSON.stringify(selected), 'Producing run/artifact pair changed before publication.');
  await checkTag(github, repository, tag, selected.commit);
  if (initial.draft) await github.request('PATCH /repos/{owner}/{repo}/releases/{release_id}', { ...repository, release_id: initial.id, draft: false });
  const published = checkRelease(record((await github.request('GET /repos/{owner}/{repo}/releases/tags/{tag}', { ...repository, tag })).data, 'published release'), tag);
  requireValue(published.id === initial.id && !published.draft, 'Release did not publish with the verified identity.');
  const finalAssets = await releaseAssets(github, repository, published.id);
  requireValue(finalAssets.length === 2, 'Published platform pair is incomplete.');
  for (const platform of platformKeys) {
    const asset = finalAssets.find(value => value.name === assetNames[platform]);
    requireValue(asset && asset.id === assetIds[platform], 'Published asset identity changed.');
    await verifyAsset(github, repository, asset, archives[platform].bytes);
  }
  const payload = { releaseId: published.id, windowsAssetId: assetIds.windows, windowsSha256: windows.sha256,
    linuxAssetId: assetIds.linux, linuxSha256: linux.sha256 };
  const deployments = (await github.paginate('GET /repos/{owner}/{repo}/deployments', {
    ...repository, sha: selected.commit, environment: 'package-delivery', per_page: 100,
  })).map(value => record(value, 'package deployment'));
  requireValue(deployments.length <= 1, 'Duplicate package deployments exist.');
  let deployment = deployments[0];
  function checkDeployment(value: NativeRecord) {
    const stored = record(typeof value.payload === 'string' ? JSON.parse(value.payload) : value.payload, 'deployment payload');
    requireValue(id(value.id) && value.sha === selected.commit && value.environment === 'package-delivery'
      && Object.entries(payload).every(([key, expected]) => stored[key] === expected), 'Existing deployment conflicts with the verified release/assets.');
  }
  if (!deployment) {
    deployment = record((await github.request('POST /repos/{owner}/{repo}/deployments', {
      ...repository, ref: selected.commit, environment: 'package-delivery', auto_merge: false, required_contexts: [],
      production_environment: true, transient_environment: false,
      payload,
    })).data, 'created package deployment');
  }
  checkDeployment(deployment);
  const statuses = (await github.paginate('GET /repos/{owner}/{repo}/deployments/{deployment_id}/statuses', {
    ...repository, deployment_id: deployment.id, per_page: 100,
  })).map(value => record(value, 'deployment status'));
  const successful = statuses.filter(status => status.state === 'success');
  requireValue(successful.length <= 1 && successful.every(status => status.environment_url === published.url), 'Successful deployment status conflicts with this release.');
  if (successful.length === 0) {
    const status = record((await github.request('POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses', {
      ...repository, deployment_id: deployment.id, state: 'success', environment_url: published.url, auto_inactive: false,
      log_url: 'https://github.com/' + repository.owner + '/' + repository.repo + '/actions/runs/' + selected.run,
      description: 'Installed/tested Windows and Linux VSIX assets verified.',
    })).data, 'successful package status');
    requireValue(status.state === 'success' && status.environment_url === published.url, 'Package success was not recorded.');
  }
  return { releaseUrl: published.url, releaseId: published.id, deploymentId: deployment.id as number,
    windows: { assetId: assetIds.windows, sha256: windows.sha256 }, linux: { assetId: assetIds.linux, sha256: linux.sha256 } };
}
