import { readFile, rm, mkdir, copyFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { hashReleaseFiles, writeReleaseChecksums } from './releaseIntegrity.mjs';

export const RELEASE_ASSET_DIR = 'release-assets';
const SEMVER_TAG = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const REQUIRED_ASSETS = ['main.js', 'manifest.json', 'styles.css', 'SHA256SUMS'];

export function parseReleaseTag(tag) {
	const match = SEMVER_TAG.exec(tag);
	if (!match) throw new Error(`Invalid release tag: ${tag}`);
	return { tag, prerelease: match[4] !== undefined };
}

function readJson(rootDir, name) {
	return readFile(path.join(rootDir, name), 'utf8').then(JSON.parse);
}

async function assertSourceConsistency(rootDir) {
	const [packageJson, manifest, versions] = await Promise.all([
		readJson(rootDir, 'package.json'),
		readJson(rootDir, 'manifest.json'),
		readJson(rootDir, 'versions.json'),
	]);
	if (packageJson.version !== manifest.version) {
		throw new Error(`Source version mismatch: package.json=${packageJson.version}, manifest.json=${manifest.version}`);
	}
	if (versions[manifest.version] !== manifest.minAppVersion) {
		throw new Error(`versions.json must map ${manifest.version} to ${manifest.minAppVersion}`);
	}
	return { packageJson, manifest, versions };
}

export async function validateReleaseAssets(rootDir, tag) {
	const release = parseReleaseTag(tag);
	const assetDir = path.resolve(rootDir, RELEASE_ASSET_DIR);
	const names = (await readdir(assetDir)).sort();
	if (names.join('\0') !== [...REQUIRED_ASSETS].sort().join('\0')) {
		throw new Error(`Release assets must contain exactly: ${REQUIRED_ASSETS.join(', ')}`);
	}
	const manifest = await readJson(assetDir, 'manifest.json');
	if (manifest.version !== tag) {
		throw new Error(`Staged manifest version ${manifest.version} does not match tag ${tag}`);
	}
	const main = await readFile(path.join(assetDir, 'main.js'), 'utf8');
	if (!main.includes('DSL: Search all') || !main.includes('DSL: Search copied text') || !main.includes('search-clipboard')) {
		throw new Error('main.js is missing the search or clipboard command marker');
	}
	const entries = await hashReleaseFiles(assetDir);
	const checksum = await readFile(path.join(assetDir, 'SHA256SUMS'), 'utf8');
	const expected = `${entries.map(({ hash, name }) => `${hash}  ${name}`).join('\n')}\n`;
	if (checksum !== expected) throw new Error('SHA256SUMS does not match staged assets');
	return release;
}

export async function stageRelease(rootDir, tag) {
	const release = parseReleaseTag(tag);
	const { packageJson, manifest, versions } = await assertSourceConsistency(rootDir);
	if (!release.prerelease) {
		if (packageJson.version !== tag || manifest.version !== tag || versions[tag] !== manifest.minAppVersion) {
			throw new Error(`Stable tag ${tag} must match package.json, manifest.json, and versions.json`);
		}
	}

	const assetDir = path.resolve(rootDir, RELEASE_ASSET_DIR);
	await rm(assetDir, { recursive: true, force: true });
	await mkdir(assetDir, { recursive: true });
	await copyFile(path.join(rootDir, 'main.js'), path.join(assetDir, 'main.js'));
	await copyFile(path.join(rootDir, 'styles.css'), path.join(assetDir, 'styles.css'));
	await writeFile(path.join(assetDir, 'manifest.json'), `${JSON.stringify({ ...manifest, version: tag }, null, '\t')}\n`);
	await writeReleaseChecksums(assetDir);
	await validateReleaseAssets(rootDir, tag);
	console.log(`Staged ${release.prerelease ? 'prerelease' : 'stable'} assets for ${tag} in ${RELEASE_ASSET_DIR}`);
	return release;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
	if (!tag) throw new Error('Release tag is required');
	await stageRelease('.', tag);
}
