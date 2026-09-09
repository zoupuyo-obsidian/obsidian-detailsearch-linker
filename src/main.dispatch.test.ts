import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { EditorState } from '@codemirror/state';
import { DEFAULT_SETTINGS } from './core/settings/settingsSchema.ts';
import { SessionController } from './sessionController.ts';

// Exercise the real registered callbacks, extraction and dispatch from main.ts.
// Only host UI APIs and the final vault scan are replaced by test doubles.
const bundled = await build({
	entryPoints: ['src/main.ts'], bundle: true, write: false,
	format: 'cjs', platform: 'node', packages: 'external',
});
const requireDependency = createRequire(import.meta.url);

function harness(selection: { anchor: number; head?: number }, isMobile = false) {
	const text = '**alpha** and **beta**';
	const cm = {
		state: EditorState.create({ doc: text, selection }),
		dispatch(spec: Parameters<EditorState['update']>[0]) {
			this.state = this.state.update(spec).state;
		},
	};
	let activeView: unknown = {
		file: { path: 'source.md' },
		editor: { cm },
		getMode: () => mode,
	};
	let mode: 'source' | 'preview' = 'source';
	let sourceFlag = false;
	let failNextModeChange = false;
	const viewStates: { active?: boolean; state?: { mode?: 'source' | 'preview'; source?: boolean } }[] = [];
	let copiedText = 'alpha';
	let clipboardReads = 0;
	const notices: string[] = [];
	const exports: Record<string, any> = {};
	const module = { exports };
	const host = {
		Plugin: class {}, MarkdownView: class {}, TFile: class {},
		Modal: class {}, PluginSettingTab: class {}, getLanguage: () => 'ja',
		Platform: { isMobile },
		Notice: class { constructor(message: string) { notices.push(message); } },
	};
	runInNewContext(bundled.outputFiles[0]!.text, {
		module, exports,
		require: (name: string) => name === 'obsidian' ? host : requireDependency(name),
		navigator: { clipboard: { readText: async () => { clipboardReads++; return copiedText; } } },
	});
	const plugin = Object.create(module.exports.default.prototype);
	plugin.settings = { ...DEFAULT_SETTINGS, uiLanguage: 'ja' };
	const activeLeaf = {
		get view() { return activeView; },
		getViewState: () => ({ type: 'markdown', state: { file: 'source.md', mode, source: sourceFlag } }),
		setViewState: async (next: { active?: boolean; state?: { mode?: 'source' | 'preview'; source?: boolean } }) => {
			viewStates.push(next);
			if (failNextModeChange) {
				failNextModeChange = false;
				throw new Error('mode change failed');
			}
			mode = next.state?.mode ?? 'source';
			sourceFlag = next.state?.source ?? sourceFlag;
		},
	};
	plugin.app = {
		workspace: {
			getActiveViewOfType: () => activeView,
			getLeavesOfType: () => [activeLeaf],
		},
	};
	plugin.sessions = new SessionController();
	plugin.pendingSourceModeLease = null;
	plugin.paintedSourceModeLease = null;
	plugin.sourceModeRevision = 0;
	plugin.sourceModeTransition = Promise.resolve();
	plugin.sourceModePreparing = false;
	plugin.localizedCommands = [];
	plugin.ribbonItems = new Map();
	const commands = new Map<string, () => void>();
	const ribbons = new Map<string, () => void>();
	plugin.addCommand = (command: any) => { commands.set(command.id, command.callback); return command; };
	plugin.addRibbonIcon = (icon: string, _title: string, callback: () => void) => {
		ribbons.set(icon, callback);
		return { setAttr: () => {} };
	};
	const events: { kind: string; queries?: string[] }[] = [];
	plugin.clearSession = () => {
		events.push({ kind: 'clear' });
		plugin.sessions.clear();
		plugin.restoreSourceModeIfOwned();
	};
	plugin.runAutoSearch = async (_file: unknown, _cm: unknown, _text: string, extracted: any[]) => {
		events.push({ kind: 'auto', queries: extracted.map(c => c.query) });
		plugin.sessions.replace({ ...plugin.sessions.get(), filePath: 'source.md', mode: 'auto', anchors: [{}] });
	};
	plugin.runSelectionSearch = async (_file: unknown, _cm: unknown, _text: string, request: any) => {
		events.push({ kind: 'selection', queries: [request.query] });
		plugin.sessions.replace({ ...plugin.sessions.get(), filePath: 'source.md', mode: 'selection',
			anchors: [{}], groups: [{ key: request.query.toLowerCase() }] });
	};
	plugin.registerCommands();
	plugin.registerRibbonItems();
	return { events, notices, commands, ribbons, plugin,
		clipboardReads: () => clipboardReads,
		setClipboard: (text: string) => { copiedText = text; },
		setActiveView: (view: unknown) => { activeView = view; },
		setMode: (next: 'source' | 'preview') => { mode = next; },
		setSourceFlag: (next: boolean) => { sourceFlag = next; },
		failNextModeChange: () => { failNextModeChange = true; },
		setSelection: (anchor: number, head?: number) => cm.dispatch({ selection: { anchor, head } }),
		viewStates,
		mode: () => mode,
		selection: () => cm.state.selection.main,
	};
}

for (const entry of ['ribbon', 'command'] as const) {
	test(`${entry}: retained selection never changes body search into one-term search`, async () => {
		const h = harness({ anchor: 2, head: 7 }); // alpha remains selected after copying.
		const invoke = entry === 'ribbon' ? h.ribbons.get('search')! : h.commands.get('search-current-note')!;
		h.setClipboard('a completely different copied phrase');
		invoke(); await setImmediate();
		assert.equal(h.events[0]?.kind, 'auto');
		assert.ok(h.events[0]?.queries?.includes('alpha'));
		assert.ok(h.events[0]?.queries?.includes('beta'));
		invoke(); await setImmediate();
		invoke(); await setImmediate();
		assert.deepEqual(h.events.map(e => e.kind), ['auto', 'clear', 'auto']);
		assert.equal(h.clipboardReads(), 0);
	});
}

test('copy search toggles, then body search independently extracts multiple terms', async () => {
	const h = harness({ anchor: 2, head: 7 }, true);
	const copy = h.ribbons.get('clipboard')!;
	copy(); await setImmediate();
	copy(); await setImmediate();
	copy(); await setImmediate();
	h.ribbons.get('search')!(); await setImmediate(); // Clear current copied-term highlights.
	h.commands.get('search-current-note')!(); await setImmediate();
	assert.deepEqual(h.events.map(e => e.kind), ['selection', 'clear', 'selection', 'clear', 'auto']);
	assert.deepEqual(h.events[0]?.queries, ['alpha']);
	assert.ok(h.events[4]?.queries?.includes('beta'));
	assert.equal(h.clipboardReads(), 3);
});

test('explicit selection command still searches the selected term only', async () => {
	const h = harness({ anchor: 2, head: 7 });
	h.commands.get('search-selection')!(); await setImmediate();
	assert.deepEqual(h.events, [{ kind: 'selection', queries: ['alpha'] }]);
	assert.equal(h.clipboardReads(), 0);
});

test('desktop term ribbon searches the selected text without clipboard access', async () => {
	const h = harness({ anchor: 2, head: 7 });
	h.ribbons.get('text-select')!(); await setImmediate();
	assert.deepEqual(h.events, [{ kind: 'selection', queries: ['alpha'] }]);
	assert.equal(h.clipboardReads(), 0);
});

test('mobile term ribbon reads copied text and collapses a retained selection', async () => {
	const h = harness({ anchor: 2, head: 7 }, true);
	h.ribbons.get('clipboard')!(); await setImmediate();
	assert.deepEqual(h.events, [{ kind: 'selection', queries: ['alpha'] }]);
	assert.equal(h.clipboardReads(), 1);
	assert.equal(h.selection().empty, true);
	assert.equal(h.selection().head, 7);
});

test('repeated mobile copied-text toggle also collapses a retained selection', async () => {
	const h = harness({ anchor: 2, head: 7 }, true);
	h.ribbons.get('clipboard')!(); await setImmediate();
	h.setSelection(2, 7);
	h.ribbons.get('clipboard')!(); await setImmediate();
	assert.equal(h.selection().empty, true);
	assert.equal(h.events.at(-1)?.kind, 'clear');
});

test('body search does not clear highlights retained for another note', async () => {
	const h = harness({ anchor: 2, head: 7 });
	h.plugin.sessions.replace({ ...h.plugin.sessions.get(), filePath: 'other.md', anchors: [{}] });
	h.ribbons.get('search')!(); await setImmediate();
	assert.equal(h.events[0]?.kind, 'auto');
});

test('body search switches preview mode to a visible source editor before scanning', async () => {
	const h = harness({ anchor: 2, head: 7 });
	h.setMode('preview');
	h.commands.get('search-current-note')!(); await setImmediate();
	assert.equal(h.mode(), 'source');
	assert.equal(h.events[0]?.kind, 'auto');
});

test('copy search switches preview mode to a visible source editor before painting', async () => {
	const h = harness({ anchor: 2, head: 7 });
	h.setMode('preview');
	h.commands.get('search-clipboard')!(); await setImmediate();
	assert.equal(h.mode(), 'source');
	assert.equal(h.events[0]?.kind, 'selection');
	assert.deepEqual(h.events[0]?.queries, ['alpha']);
});

test('clearing candidates restores the preview mode changed by the plugin', async () => {
	const h = harness({ anchor: 0 });
	h.setMode('preview');
	h.commands.get('search-current-note')!(); await setImmediate();
	assert.equal(h.mode(), 'source');
	h.commands.get('search-current-note')!(); await setImmediate();
	await setImmediate();
	assert.equal(h.mode(), 'preview');
	assert.equal(h.viewStates.at(-1)?.active, undefined);
});

test('clearing candidates never changes an editor that started in source mode', async () => {
	const h = harness({ anchor: 0 });
	h.commands.get('search-current-note')!(); await setImmediate();
	h.commands.get('search-current-note')!(); await setImmediate();
	await setImmediate();
	assert.equal(h.mode(), 'source');
});

test('clear respects a user change between source and live preview', async () => {
	const h = harness({ anchor: 0 });
	h.setMode('preview');
	h.commands.get('search-current-note')!(); await setImmediate();
	h.setSourceFlag(true);
	h.commands.get('search-current-note')!(); await setImmediate();
	await setImmediate();
	assert.equal(h.mode(), 'source');
});

test('a failed mode restoration does not block the next search', async () => {
	const h = harness({ anchor: 0 });
	h.setMode('preview');
	h.commands.get('search-current-note')!(); await setImmediate();
	h.failNextModeChange();
	h.commands.get('search-current-note')!(); await setImmediate();
	await setImmediate();
	h.commands.get('search-current-note')!(); await setImmediate();
	assert.equal(h.events.at(-1)?.kind, 'auto');
});

test('body search with no active editor reports it without clipboard access or scanning', async () => {
	const h = harness({ anchor: 0 });
	h.setActiveView(null);
	h.commands.get('search-current-note')!(); await setImmediate();
	assert.deepEqual(h.events, []);
	assert.equal(h.notices.length, 1);
	assert.equal(h.clipboardReads(), 0);
});
