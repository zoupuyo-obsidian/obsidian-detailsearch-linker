import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryCache } from '../cache/queryCache.ts';
import { MultiSearchCoordinator } from './multiSearchCoordinator.ts';
import { scopeFingerprint, type ScopedFile } from './scopeFilter.ts';

const SCOPE = {
	includeFolders: [] as string[],
	excludeFolders: [] as string[],
	scopeMode: 'all' as const,
	recentDays: 0,
	worksetPaths: [] as string[],
	maxFiles: 500,
	maxFileBytes: 2_000_000,
};

type FileRecord = { content: string; mtime: number };

function makeHarness(initial: Record<string, FileRecord>) {
	const files = new Map(Object.entries(initial));
	const readCountByPath = new Map<string, number>();
	const cache = new QueryCache({ mode: 'persistent', maxBytes: 1024 * 1024 });
	const coordinator = new MultiSearchCoordinator(cache, async (path) => {
		readCountByPath.set(path, (readCountByPath.get(path) ?? 0) + 1);
		const rec = files.get(path);
		if (!rec) {
			return null;
		}
		return { content: rec.content, mtime: rec.mtime };
	});

	const scoped = (paths: string[]): ScopedFile[] =>
		paths.map((path) => {
			const rec = files.get(path)!;
			return { path, statMtime: rec.mtime, size: rec.content.length };
		});

	const run = async (terms: { key: string; query: string; caseSensitive: boolean }[], paths: string[]) =>
		coordinator.execute({
			terms,
			scopeSettings: SCOPE,
			scopedFiles: scoped(paths),
			scanOptions: {
				excerptLength: 80,
				maxHitsPerNote: 10,
				maxCandidateNotes: 50,
				readConcurrency: 1,
				yieldFn: async () => undefined,
			},
		});

	return {
		cache,
		coordinator,
		files,
		readCountByPath,
		scoped,
		run,
		set(path: string, content: string, mtime: number) {
			files.set(path, { content, mtime });
		},
	};
}

function manyTerms(prefix: string, count: number) {
	return Array.from({ length: count }, (_, i) => ({
		key: `${prefix}${i}`,
		query: `${prefix}${i}`,
		caseSensitive: false,
	}));
}

test('50 terms read each target file at most once', async () => {
	const h = makeHarness({
		'a.md': { content: 'term0 term1 term49 alpha', mtime: 1 },
		'b.md': { content: 'term0 beta', mtime: 1 },
	});
	const terms = manyTerms('term', 50);
	const result = await h.run(terms, ['a.md', 'b.md']);
	assert.equal(result.filesRead, 2);
	assert.equal(h.readCountByPath.get('a.md'), 1);
	assert.equal(h.readCountByPath.get('b.md'), 1);
	assert.equal(result.byTerm.get('term0')!.hits.length, 2);
});

test('mixed warm and cold terms batch reads per path', async () => {
	const h = makeHarness({
		'a.md': { content: 'alpha beta', mtime: 1 },
		'b.md': { content: 'gamma delta', mtime: 1 },
	});
	await h.run([{ key: 'alpha', query: 'alpha', caseSensitive: false }], ['a.md', 'b.md']);
	h.readCountByPath.clear();
	h.set('b.md', 'gamma delta epsilon', 2);
	const result = await h.run(
		[
			{ key: 'alpha', query: 'alpha', caseSensitive: false },
			{ key: 'epsilon', query: 'epsilon', caseSensitive: false },
		],
		['a.md', 'b.md'],
	);
	// Cold term epsilon scans all scope paths; warm alpha rescans only stale b.md.
	assert.equal(h.readCountByPath.get('a.md'), 1);
	assert.equal(h.readCountByPath.get('b.md'), 1);
	assert.equal(result.byTerm.get('alpha')!.warm, false);
	assert.equal(result.byTerm.get('epsilon')!.hits.length, 1);
});

test('single changed file triggers one read for multiple stale terms', async () => {
	const h = makeHarness({
		'x.md': { content: 'foo bar', mtime: 1 },
	});
	await h.run(
		[
			{ key: 'foo', query: 'foo', caseSensitive: false },
			{ key: 'bar', query: 'bar', caseSensitive: false },
		],
		['x.md'],
	);
	h.readCountByPath.clear();
	h.set('x.md', 'foo bar baz', 2);
	const result = await h.run(
		[
			{ key: 'foo', query: 'foo', caseSensitive: false },
			{ key: 'bar', query: 'bar', caseSensitive: false },
			{ key: 'baz', query: 'baz', caseSensitive: false },
		],
		['x.md'],
	);
	assert.equal(h.readCountByPath.get('x.md'), 1);
	assert.equal(result.byTerm.get('baz')!.hits.length, 1);
});

test('cancel does not write cache as fully scanned', async () => {
	const h = makeHarness({
		'a.md': { content: 'term here', mtime: 1 },
		'b.md': { content: 'term there', mtime: 1 },
	});
	const token = { cancelled: false, cancel() { this.cancelled = true; } };
	const terms = [{ key: 'term', query: 'term', caseSensitive: false }];
	await h.coordinator.execute({
		terms,
		scopeSettings: SCOPE,
		scopedFiles: h.scoped(['a.md', 'b.md']),
		scanOptions: {
			excerptLength: 80,
			maxHitsPerNote: 10,
			maxCandidateNotes: 50,
			readConcurrency: 1,
			token,
			yieldFn: async () => {
				token.cancel();
			},
		},
	});
	const scopeFp = scopeFingerprint(SCOPE);
	const key = h.cache.makeKey('term', false, scopeFp);
	assert.ok(!h.cache.get(key));
});

test('per-term cache updated independently after shared read', async () => {
	const h = makeHarness({
		'only.md': { content: 'alpha beta', mtime: 1 },
	});
	const result = await h.run(
		[
			{ key: 'alpha', query: 'alpha', caseSensitive: false },
			{ key: 'beta', query: 'beta', caseSensitive: false },
		],
		['only.md'],
	);
	assert.equal(result.byTerm.get('alpha')!.hits.length, 1);
	assert.equal(result.byTerm.get('beta')!.hits.length, 1);
	assert.ok(h.cache.entryCount() >= 2);
});

test('readFile throw always unpins active keys', async () => {
	const cache = new QueryCache({ mode: 'memory', maxBytes: 8192 });
	const coordinator = new MultiSearchCoordinator(cache, async () => {
		throw new Error('read failed');
	});
	const terms = [{ key: 'term', query: 'term', caseSensitive: false }];
	await assert.rejects(
		() =>
			coordinator.execute({
				terms,
				scopeSettings: SCOPE,
				scopedFiles: [{ path: 'a.md', statMtime: 1, size: 10 }],
				scanOptions: {
					excerptLength: 80,
					maxHitsPerNote: 10,
					maxCandidateNotes: 50,
					readConcurrency: 1,
				},
			}),
		/read failed/,
	);
	assert.equal(cache.getActiveKeys().size, 0);
	const keyA = cache.makeKey('old', false, scopeFingerprint(SCOPE));
	cache.set(keyA, {
		hits: [{ path: '1.md', heading: '', offset: 0, excerpt: 'x'.repeat(120), mtime: 1 }],
		scopeFingerprint: scopeFingerprint(SCOPE),
		caseSensitive: false,
		scannedGeneration: 1,
	});
	assert.ok(cache.get(keyA));
	cache.evictLru(100);
	assert.ok(cache.get(keyA) === undefined);
});
