import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryCache } from './cache/queryCache.ts';
import { ManifestStore } from './cache/manifestStore.ts';
import { mergeCacheHits } from './search/bodyScanner.ts';

test('warm cache entry stores hits without body', () => {
	const cache = new QueryCache({ mode: 'memory', maxBytes: 1024 * 1024 });
	const key = cache.makeKey('救急', false, 'scope-a');
	cache.set(key, {
		hits: [{ path: 'n.md', heading: 'H', offset: 1, excerpt: '…', mtime: 10 }],
		scopeFingerprint: 'scope-a',
		caseSensitive: false,
		scannedGeneration: 1,
	});
	const got = cache.get(key);
	assert.equal(got?.hits.length, 1);
	assert.equal(got?.hits[0]!.path, 'n.md');
});

test('get marks cache dirty in persistent mode for LRU', () => {
	const cache = new QueryCache({ mode: 'persistent', maxBytes: 1024 * 1024 });
	const key = cache.makeKey('a', false, 's');
	cache.set(key, {
		hits: [],
		scopeFingerprint: 's',
		caseSensitive: false,
		scannedGeneration: 1,
	});
	cache.markClean();
	assert.equal(cache.isDirty(), false);
	cache.get(key);
	assert.equal(cache.isDirty(), true);
});

test('get does not mark dirty in memory mode', () => {
	const cache = new QueryCache({ mode: 'memory', maxBytes: 1024 * 1024 });
	const key = cache.makeKey('a', false, 's');
	cache.set(key, {
		hits: [],
		scopeFingerprint: 's',
		caseSensitive: false,
		scannedGeneration: 1,
	});
	cache.markClean();
	cache.get(key);
	assert.equal(cache.isDirty(), false);
});

test('oversized entry stays in memory but excluded from export', () => {
	const cache = new QueryCache({ mode: 'persistent', maxBytes: 200 });
	const key = cache.makeKey('big', false, 's');
	cache.set(key, {
		hits: [{ path: 'x.md', heading: '', offset: 0, excerpt: 'z'.repeat(300), mtime: 1 }],
		scopeFingerprint: 's',
		caseSensitive: false,
		scannedGeneration: 1,
	});
	assert.ok(cache.get(key));
	assert.ok(cache.isNonPersistent(key));
	assert.equal(cache.exportPayload().entries.length, 0);
	assert.equal(cache.entryCount(), 1);
});

test('LRU evicts oldest persistent entries', () => {
	const cache = new QueryCache({ mode: 'memory', maxBytes: 500 });
	const keyA = cache.makeKey('a', false, 's');
	const keyB = cache.makeKey('b', false, 's');
	cache.set(keyA, {
		hits: [{ path: '1.md', heading: '', offset: 0, excerpt: 'x'.repeat(80), mtime: 1 }],
		scopeFingerprint: 's',
		caseSensitive: false,
		scannedGeneration: 1,
		lastAccess: 1,
	});
	cache.set(keyB, {
		hits: [{ path: '2.md', heading: '', offset: 0, excerpt: 'y'.repeat(80), mtime: 1 }],
		scopeFingerprint: 's',
		caseSensitive: false,
		scannedGeneration: 1,
		lastAccess: 2,
	});
	cache.evictLru(200, keyB);
	assert.ok(cache.get(keyA) === undefined);
	assert.ok(cache.get(keyB) !== undefined);
});

test('active key set pins multiple entries from LRU eviction', () => {
	const cache = new QueryCache({ mode: 'memory', maxBytes: 800 });
	const keys = ['k1', 'k2', 'k3'].map((q) => cache.makeKey(q, false, 's'));
	cache.pinActiveKeys(keys);
	for (const [i, key] of keys.entries()) {
		cache.set(key, {
			hits: [{ path: `${i}.md`, heading: '', offset: 0, excerpt: 'z'.repeat(120), mtime: 1 }],
			scopeFingerprint: 's',
			caseSensitive: false,
			scannedGeneration: 1,
			lastAccess: i + 1,
		});
	}
	for (let i = 0; i < 6; i++) {
		cache.set(cache.makeKey(`other${i}`, false, 's'), {
			hits: [{ path: `o${i}.md`, heading: '', offset: 0, excerpt: 'y'.repeat(120), mtime: 1 }],
			scopeFingerprint: 's',
			caseSensitive: false,
			scannedGeneration: 1,
		});
	}
	assert.ok(cache.get(keys[0]!));
	assert.ok(cache.get(keys[1]!));
	assert.ok(cache.get(keys[2]!));
	cache.unpinActiveKeys(keys);
	cache.evictLru(200);
	assert.ok(cache.get(keys[0]!) === undefined);
});

test('manifest rename and delete bump generation', () => {
	const m = new ManifestStore();
	m.reconcile([{ path: 'a.md', mtime: 1 }]);
	const g1 = m.getGeneration();
	m.noteRenamed('a.md', 'b.md', 2);
	m.reconcile([{ path: 'b.md', mtime: 2 }]);
	assert.ok(m.getGeneration() > g1);
	m.noteDeleted('b.md');
	m.reconcile([]);
	assert.ok(m.getGeneration() > g1);
});

test('mergeCacheHits replaces rescanned paths only', () => {
	const existing = [
		{ path: 'old.md', heading: '', offset: 0, excerpt: '', mtime: 1 },
		{ path: 'keep.md', heading: '', offset: 0, excerpt: '', mtime: 1 },
	];
	const rescanned = [
		{ path: 'keep.md', heading: 'H', offset: 5, excerpt: 'e', mtime: 2 },
	];
	const merged = mergeCacheHits(existing, rescanned, new Set(['keep.md']));
	assert.equal(merged.length, 2);
	assert.equal(merged.find((h) => h.path === 'keep.md')?.heading, 'H');
	assert.ok(merged.some((h) => h.path === 'old.md'));
});

test('old cache version is discarded safely', () => {
	const cache = new QueryCache({ mode: 'persistent', maxBytes: 1024 });
	cache.load({
		version: 1,
		manifest: { generation: 5, files: {} },
		entries: [
			{
				key: 'k',
				hits: [],
				lastAccess: 1,
				scopeFingerprint: 's',
				caseSensitive: false,
				scannedGeneration: 1,
			},
		],
	});
	assert.equal(cache.entryCount(), 0);
	assert.equal(cache.manifest.getGeneration(), 0);
});
