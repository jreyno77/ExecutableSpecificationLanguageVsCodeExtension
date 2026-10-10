import { describe, expect, it } from 'vitest';
import { publishVsixDelivery, selectVsixArtifacts } from '../../../.github/ci/vsix-delivery.js';
import { deliveredPair, recordedGithub } from '../../driver/ci/vsix-delivery.js';

describe('delivery of the installed and tested platform archives', () => {
  it('admits each actual successful platform producer from the same completed run', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes', {
      runId: 700, runAttempt: 3, windowsAttempt: 2, linuxAttempt: 3, windowsArtifactId: 12002, linuxArtifactId: 13003,
    });
    const host = recordedGithub(pair); const result = await publishVsixDelivery(host.github, pair.input);
    expect(host.publishedTagCommit()).toBe(pair.commit);
    expect(host.assetBytes('windows')).toEqual(Buffer.from('Windows tested bytes'));
    expect(host.assetBytes('linux')).toEqual(Buffer.from('Linux tested bytes'));
    expect(result.releaseUrl).toBe(host.releaseUrl());
    expect(host.successfulDeployments()).toEqual([{ sha: pair.commit, environment: 'package-delivery',
      releaseId: result.releaseId, windowsAssetId: result.windows.assetId, windowsSha256: pair.windows.sha256,
      linuxAssetId: result.linux.assetId, linuxSha256: pair.linux.sha256 }]);
  });
  it('refuses a PR even when its archived bytes are available', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes');
    const host = recordedGithub(pair); host.run.event = 'pull_request';
    await expect(publishVsixDelivery(host.github, pair.input)).rejects.toThrow();
    expect(host.createdReleases()).toEqual([]); expect(host.successfulDeployments()).toEqual([]);
  });
  it('refuses a failed main run despite available uploaded archives', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes');
    const host = recordedGithub(pair); host.run.conclusion = 'failure';
    await expect(publishVsixDelivery(host.github, pair.input)).rejects.toThrow();
    expect(host.createdReleases()).toEqual([]); expect(host.successfulDeployments()).toEqual([]);
  });
  it('refuses provenance without a successful matching platform producer', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes');
    const host = recordedGithub(pair); host.windowsProducerJob.conclusion = 'cancelled';
    await expect(publishVsixDelivery(host.github, pair.input)).rejects.toThrow();
    expect(host.createdReleases()).toEqual([]); expect(host.successfulDeployments()).toEqual([]);
  });
  it('refuses a missing platform artifact', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes');
    const host = recordedGithub(pair); host.removeArtifact(pair.linux.artifactId);
    await expect(publishVsixDelivery(host.github, pair.input)).rejects.toThrow();
    expect(host.createdReleases()).toEqual([]); expect(host.successfulDeployments()).toEqual([]);
  });
  it('refuses real downloaded bytes that differ from installed and final evidence', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes'); const host = recordedGithub(pair);
    await pair.replaceWindowsArchive('Changed after native checks');
    await expect(publishVsixDelivery(host.github, pair.input)).rejects.toThrow();
    expect(host.createdReleases()).toEqual([]); expect(host.successfulDeployments()).toEqual([]);
  });
  it('accepts an annotated tag only when its peeled commit is the verified main SHA', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes'); const host = recordedGithub(pair);
    host.existingAnnotatedTag({ tagObjectSha: 'b'.repeat(40), commit: pair.commit });
    await publishVsixDelivery(host.github, pair.input);
    expect(host.publishedTagCommit()).toBe(pair.commit); expect(host.successfulDeployments()).toHaveLength(1);
  });
  it('refuses a tag whose peeled commit differs', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes'); const host = recordedGithub(pair);
    host.existingAnnotatedTag({ tagObjectSha: 'b'.repeat(40), commit: 'c'.repeat(40) });
    await expect(publishVsixDelivery(host.github, pair.input)).rejects.toThrow();
    expect(host.uploadedAssets()).toEqual([]); expect(host.successfulDeployments()).toEqual([]);
  });
  it('finishes a partial draft while retaining its verified platform asset', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes'); const host = recordedGithub(pair);
    host.existingDraft({ releaseId: 500, windowsAssetId: 501, windowsBytes: Buffer.from('Windows tested bytes') });
    const result = await publishVsixDelivery(host.github, pair.input);
    expect(result.releaseId).toBe(500); expect(result.windows.assetId).toBe(501);
    expect(host.uploadedAssets().map(asset => asset.platform)).toEqual(['linux']);
    expect(host.assetBytes('windows')).toEqual(Buffer.from('Windows tested bytes'));
    expect(host.assetBytes('linux')).toEqual(Buffer.from('Linux tested bytes'));
    expect(host.releaseIsDraft()).toBe(false); expect(host.successfulDeployments()).toHaveLength(1);
  });
  it('records a published release after deployment recording failed', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes'); const host = recordedGithub(pair);
    host.failNextDeploymentCreate();
    await expect(publishVsixDelivery(host.github, pair.input)).rejects.toThrow();
    const published = host.actualReleaseIdentity(); expect(host.releaseIsDraft()).toBe(false);
    expect(host.successfulDeployments()).toEqual([]);
    const result = await publishVsixDelivery(host.github, pair.input);
    expect(host.actualReleaseIdentity()).toEqual(published); expect(result.releaseId).toBe(published.releaseId);
    expect(host.successfulDeployments()).toHaveLength(1);
  });
  it('replays an identical pair without new assets deployment or success', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes'); const host = recordedGithub(pair);
    const first = await publishVsixDelivery(host.github, pair.input);
    const repeated = await publishVsixDelivery(host.github, pair.input);
    expect(repeated).toEqual(first);
    expect(host.assetBytes('windows')).toEqual(Buffer.from('Windows tested bytes'));
    expect(host.assetBytes('linux')).toEqual(Buffer.from('Linux tested bytes'));
    expect(host.createdDeployments()).toHaveLength(1); expect(host.successStatuses()).toHaveLength(1);
  });
  it('refuses a newer validated pair with different bytes instead of an older match', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes'); const host = recordedGithub(pair);
    await publishVsixDelivery(host.github, pair.input); const original = host.actualReleaseIdentity();
    const newer = await pair.newSuccessfulAttempt(4, 'New Windows tested bytes', 'Linux tested bytes'); host.addSuccessfulPair(newer);
    await expect(publishVsixDelivery(host.github, newer.input)).rejects.toThrow();
    expect(host.actualReleaseIdentity()).toEqual(original);
    expect(host.assetBytes('windows')).toEqual(Buffer.from('Windows tested bytes'));
    expect(host.createdDeployments()).toHaveLength(1); expect(host.successStatuses()).toHaveLength(1);
  });
  it('refuses a successful deployment with conflicting stored evidence', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes'); const host = recordedGithub(pair);
    host.existingPublishedPair({ releaseId: 500, windowsAssetId: 501, linuxAssetId: 502 });
    host.existingSuccessfulDeployment({ id: 900, sha: pair.commit, environment: 'package-delivery',
      releaseId: 499, windowsAssetId: 501, windowsSha256: pair.windows.sha256,
      linuxAssetId: 502, linuxSha256: pair.linux.sha256 });
    await expect(publishVsixDelivery(host.github, pair.input)).rejects.toThrow();
    expect(host.createdDeployments()).toEqual([]); expect(host.successStatuses()).toHaveLength(1);
    expect(host.actualReleaseIdentity()).toEqual({ releaseId: 500, windowsAssetId: 501, linuxAssetId: 502 });
  });
  it('preserves delivery IDs for a newer validated producer with identical bytes', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes'); const host = recordedGithub(pair);
    const first = await publishVsixDelivery(host.github, pair.input);
    const newer = await pair.newSuccessfulAttempt(4, 'Windows tested bytes', 'Linux tested bytes'); host.addSuccessfulPair(newer);
    const repeated = await publishVsixDelivery(host.github, newer.input);
    expect(repeated).toEqual(first); expect(host.createdDeployments()).toHaveLength(1); expect(host.successStatuses()).toHaveLength(1);
  });
  it('retains a created deployment after its first success recording fails', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes'); const host = recordedGithub(pair); host.failNextSuccessStatus();
    await expect(publishVsixDelivery(host.github, pair.input)).rejects.toThrow();
    const deployment = host.actualDeploymentIdentity(), published = host.actualReleaseIdentity();
    expect(host.successStatuses()).toEqual([]);
    await publishVsixDelivery(host.github, pair.input);
    expect(host.actualDeploymentIdentity()).toEqual(deployment); expect(host.actualReleaseIdentity()).toEqual(published);
    expect(host.createdDeployments()).toHaveLength(1); expect(host.successStatuses()).toHaveLength(1);
  });
  it('withholds successful deployment when the final published asset download differs', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes'); const host = recordedGithub(pair);
    host.replaceWindowsDownloadAfterPublication(Buffer.from('Different published bytes'));
    await expect(publishVsixDelivery(host.github, pair.input)).rejects.toThrow();
    expect(host.releaseIsDraft()).toBe(false); expect(host.successfulDeployments()).toEqual([]);
  });
  it('refuses an in-progress main build despite its available archives', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes'); const host = recordedGithub(pair);
    host.run.status = 'in_progress'; host.run.conclusion = null;
    await expect(publishVsixDelivery(host.github, pair.input)).rejects.toThrow();
    expect(host.createdReleases()).toEqual([]); expect(host.uploadedAssets()).toEqual([]);
    expect(host.createdDeployments()).toEqual([]); expect(host.successStatuses()).toEqual([]);
  });
  it('refuses two matching deployments without creating another or recording another success', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes'); const host = recordedGithub(pair);
    const first = await publishVsixDelivery(host.github, pair.input);
    host.existingSuccessfulDeployment({ id: 901, sha: pair.commit, environment: 'package-delivery',
      releaseId: first.releaseId, windowsAssetId: first.windows.assetId, windowsSha256: pair.windows.sha256,
      linuxAssetId: first.linux.assetId, linuxSha256: pair.linux.sha256 });
    const existing = host.actualDeploymentIdentity(), release = host.actualReleaseIdentity();
    await expect(publishVsixDelivery(host.github, pair.input)).rejects.toThrow();
    expect(host.actualDeploymentIdentity()).toEqual(existing); expect(host.actualReleaseIdentity()).toEqual(release);
    expect(host.createdDeployments()).toHaveLength(1); expect(host.successStatuses()).toHaveLength(2);
  });
  it('refuses a real validation-only receipt without native-delivery effects', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes'); const host = recordedGithub(pair);
    await pair.patchWindowsProvenance({ kind: 'validation-only' });
    await expect(publishVsixDelivery(host.github, pair.input)).rejects.toThrow();
    expect(host.createdReleases()).toEqual([]); expect(host.uploadedAssets()).toEqual([]);
    expect(host.createdDeployments()).toEqual([]); expect(host.successStatuses()).toEqual([]);
  });
  it('refuses a tested receipt missing its actual post-native proof', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes'); const host = recordedGithub(pair);
    await pair.patchWindowsProvenance({}, ['postNativeSha256']);
    await expect(publishVsixDelivery(host.github, pair.input)).rejects.toThrow();
    expect(host.createdReleases()).toEqual([]); expect(host.uploadedAssets()).toEqual([]);
    expect(host.createdDeployments()).toEqual([]); expect(host.successStatuses()).toEqual([]);
  });
  it('refuses an expired latest artifact rather than reusing an earlier matching pair', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes'); const host = recordedGithub(pair);
    await publishVsixDelivery(host.github, pair.input); const original = host.actualReleaseIdentity();
    const newer = await pair.newSuccessfulAttempt(4, 'Windows tested bytes', 'Linux tested bytes');
    host.addSuccessfulPair(newer); host.expireArtifact(newer.windows.artifactId);
    await expect(selectVsixArtifacts(host.github, newer.input)).rejects.toThrow();
    await expect(publishVsixDelivery(host.github, newer.input)).rejects.toThrow();
    expect(host.actualReleaseIdentity()).toEqual(original);
    expect(host.assetBytes('windows')).toEqual(Buffer.from('Windows tested bytes'));
    expect(host.assetBytes('linux')).toEqual(Buffer.from('Linux tested bytes'));
    expect(host.createdDeployments()).toHaveLength(1); expect(host.successStatuses()).toHaveLength(1);
  });
  it('refuses a producer whose successful upload preceded its tests and verification', async () => {
    const pair = await deliveredPair('Windows tested bytes', 'Linux tested bytes'); const host = recordedGithub(pair);
    host.windowsProducerJob.steps.reverse();
    await expect(publishVsixDelivery(host.github, pair.input)).rejects.toThrow();
    expect(host.createdReleases()).toEqual([]); expect(host.uploadedAssets()).toEqual([]);
    expect(host.createdDeployments()).toEqual([]); expect(host.successStatuses()).toEqual([]);
  });
});
