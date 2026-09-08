import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { formatSha256Sums, sha256Hex } from './releaseIntegrity.mjs';
import { parseReleaseTag, stageRelease } from './stage-release.mjs';

test('sha256Hex matches the FIPS 180-2 abc vector', () => {
	assert.equal(
		sha256Hex(Buffer.from('abc')),
		'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
	);
});

test('formatSha256Sums writes coreutils-compatible two-space lines', () => {
	assert.equal(
		formatSha256Sums([
			{ hash: 'abc', name: 'main.js' },
			{ hash: 'def', name: 'styles.css' },
		]),
		'abc  main.js\ndef  styles.css\n',
	);
});

test('parseReleaseTag distinguishes stable and prerelease tags', () => {
	assert.equal(parseReleaseTag('1.0.6').prerelease, false);
	assert.equal(parseReleaseTag('1.0.6-beta.1').prerelease, true);
});

test('parseReleaseTag rejects non-semver release tags', () => {
	assert.throws(() => parseReleaseTag('v1.0.6'), /Invalid release tag/);
	assert.throws(() => parseReleaseTag('1.0'), /Invalid release tag/);
});

test('stageRelease creates beta assets without changing source versions', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'detailsearch-release-'));
	const manifest = {
		id: 'detailsearch-linker',
		name: 'DetailSearch Linker',
		version: '1.0.5',
		minAppVersion: '1.13.0',
	};
	await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.5' }));
	await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
	await writeFile(path.join(root, 'versions.json'), JSON.stringify({ '1.0.5': '1.13.0' }));
	await writeFile(path.join(root, 'main.js'), 'DSL: Find body candidates DSL: Search copied text search-clipboard');
	await writeFile(path.join(root, 'styles.css'), '.dsl {}');

	const result = await stageRelease(root, '1.0.6-beta.1');
	assert.equal(result.prerelease, true);
	assert.deepEqual((await readdir(path.join(root, 'release-assets'))).sort(), [
		'SHA256SUMS',
		'main.js',
		'manifest.json',
		'styles.css',
	]);
	assert.equal(JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')).version, '1.0.5');
	assert.equal(JSON.parse(await readFile(path.join(root, 'release-assets/manifest.json'), 'utf8')).version, '1.0.6-beta.1');
});

test('stageRelease rejects a stable tag that does not match source versions', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'detailsearch-release-'));
	await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.5' }));
	await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ version: '1.0.5', minAppVersion: '1.13.0' }));
	await writeFile(path.join(root, 'versions.json'), JSON.stringify({ '1.0.5': '1.13.0' }));
	await assert.rejects(() => stageRelease(root, '1.0.6'), /Stable tag 1\.0\.6 must match/);
});
