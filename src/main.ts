import { EditorView } from '@codemirror/view';
import {
	MarkdownView,
	Notice,
	Plugin,
	TFile,
	type Command,
	type Editor,
} from 'obsidian';
import { QueryCache, type PersistentCachePayload } from './core/cache/queryCache';
import {
	BUILD_ARTIFACT_MARKERS,
	COMMAND_DEFINITIONS,
} from './core/commands/commandRegistry';
import { resolveRibbonAction } from './core/commands/unifiedSearch';
import { addIgnoredTerm } from './core/ignore/ignoredTerms';
import { removeGroupFromSession, resolveIgnoreGroupKey } from './core/ignore/sessionIgnore';
import {
	extractQueryCandidates,
	groupKeyForQuery,
	type ExtractSettings,
} from './core/extract/queryExtractor';
import { formatHeadingWikilink } from './core/link/formatLink';
import { buildAnchorSpots, ModalQuerySource, SelectionQuerySource } from './core/query/selectionSource';
import type { SearchRequest } from './core/query/querySource';
import { validateQuery, MAX_QUERY_LENGTH, trimSelectionRange, type QueryValidationError } from './core/query/queryValidation';
import { MultiSearchCoordinator } from './core/search/multiSearchCoordinator';
import { SearchCoordinator } from './core/search/searchCoordinator';
import {
	dedupeOverlappingAnchors,
} from './core/extract/anchorDedupe';
import {
	filterScopeFiles,
	scopeFingerprint,
	type ScopedFile,
	WorksetTracker,
} from './core/search/scopeFilter';
import { anchorStillValid } from './core/search/termMatch';
import type { CancelToken } from './core/search/types';
import {
	detailsearchLinkerEditorExtension,
	detailSessionField,
	setDetailSessionEffect,
} from './editor/highlighter';
import { t, tf } from './i18n';
import { DetailHoverController, type PreviewHost } from './preview/hoverPreview';
import {
	buildAutoSession,
	buildSelectionSession,
	emptySession,
	getGroup,
	groupHitsToCandidates,
	sessionStats,
	type DetailSessionState,
	type ResultGroup,
	type SessionAnchor,
} from './session';
import {
	DetailSearchLinkerSettingTab,
	migrateSettings,
	type DetailSearchLinkerSettings,
} from './settings';
import { promptSearchQuery, noticeQueryValidation } from './ui/queryInputModal';

const CACHE_SAVE_DEBOUNCE_MS = 2000;
const SEARCH_PROGRESS_THRESHOLD = 50;

/** Ensures build markers stay in the bundle for post-build verification. */
void BUILD_ARTIFACT_MARKERS;

function editorView(editor: Editor | undefined): EditorView | null {
	if (!editor) {
		return null;
	}
	const cm = (editor as unknown as { cm?: EditorView }).cm;
	return cm ?? null;
}

class SearchCancelToken implements CancelToken {
	cancelled = false;
	cancel(): void {
		this.cancelled = true;
	}
}

export default class DetailSearchLinkerPlugin extends Plugin {
	settings!: DetailSearchLinkerSettings;
	private session: DetailSessionState = emptySession();
	private readonly cache: QueryCache;
	private readonly workset = new WorksetTracker(50);
	private statusEl: HTMLElement | null = null;
	private ribbonEl: HTMLElement | null = null;
	private readonly hover = new DetailHoverController();
	private hoverAttachedTo: HTMLElement | null = null;
	private searchBusy = false;
	private activeSearchToken: SearchCancelToken | null = null;
	private cacheSaveTimer: number | null = null;
	private readonly localizedCommands: {
		command: Command;
		key: Parameters<typeof t>[1];
	}[] = [];

	constructor(app: import('obsidian').App, manifest: import('obsidian').PluginManifest) {
		super(app, manifest);
		this.cache = new QueryCache({ mode: 'persistent', maxBytes: 8 * 1024 * 1024 });
	}

	async onload(): Promise<void> {
		const raw = (await this.loadData()) as
			| (Partial<DetailSearchLinkerSettings> & { cache?: PersistentCachePayload })
			| null;
		this.settings = migrateSettings(raw ?? {});
		if (raw?.cache && this.settings.cacheMode === 'persistent') {
			this.cache.load(raw.cache);
		}
		this.applyCacheOptions();

		this.registerEditorExtension([
			detailsearchLinkerEditorExtension(),
			EditorView.updateListener.of((update) => {
				if (!update.docChanged) {
					return;
				}
				const live = update.state.field(detailSessionField);
				if (live.filePath && live.filePath === this.session.filePath) {
					this.session = live;
				}
			}),
		]);

		this.addSettingTab(new DetailSearchLinkerSettingTab(this.app, this));
		this.statusEl = this.addStatusBarItem();
		this.statusEl.addClass('detailsearch-linker-status');
		this.statusEl.hide();

		this.ribbonEl = this.addRibbonIcon(
			'search',
			t(this.settings.uiLanguage, 'ribbonTooltip'),
			() => {
				void this.onRibbonClick();
			},
		);
		this.statusEl.addClass('mod-clickable');
		this.statusEl.addEventListener('click', () => {
			if (this.hasActiveSession()) {
				this.clearSession(true);
			}
		});

		this.registerCommands();
		this.applyUiLanguage();

		this.registerVaultEvents();
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.workset.touch(file.path);
				}
				if (this.settings.clearOnFileChange && this.session.filePath) {
					if (!file || file.path !== this.session.filePath) {
						this.clearSession(false);
						return;
					}
				}
				this.applySessionToEditors();
				this.attachHoverToActive();
			}),
		);
		this.workset.setMaxSize(this.settings.worksetSize);
	}

	onunload(): void {
		if (this.cacheSaveTimer !== null) {
			window.clearTimeout(this.cacheSaveTimer);
			void this.flushCacheSave();
		}
		this.activeSearchToken?.cancel();
		this.hover.detach();
		this.hoverAttachedTo = null;
		this.session = emptySession();
		this.applySessionToEditors();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settingsPayload());
	}

	private settingsPayload(): DetailSearchLinkerSettings & { cache?: PersistentCachePayload } {
		const payload: DetailSearchLinkerSettings & { cache?: PersistentCachePayload } = {
			...this.settings,
		};
		if (this.settings.cacheMode === 'persistent') {
			payload.cache = this.cache.exportPayload();
		}
		return payload;
	}

	applyCacheOptions(): void {
		this.cache.setOptions({
			mode: this.settings.cacheMode,
			maxBytes: this.settings.cacheMaxMb * 1024 * 1024,
		});
		this.workset.setMaxSize(this.settings.worksetSize);
	}

	onScopeOrCacheSettingsChanged(): void {
		this.applyCacheOptions();
		this.scheduleCacheSave();
	}

	formatCacheSizeDescription(): string {
		const kb = Math.round(this.cache.estimateBytes() / 1024);
		return tf(this.settings.uiLanguage, 'noticeCacheSize', this.cache.entryCount(), kb);
	}

	async clearCache(notify: boolean): Promise<void> {
		this.cache.clear();
		this.cache.manifest.load(null);
		await this.saveSettings();
		if (notify) {
			new Notice(t(this.settings.uiLanguage, 'noticeCacheCleared'));
		}
	}

	applyUiLanguage(): void {
		this.updateCommandNames();
		this.refreshStatus();
		this.attachHoverToActive();
	}

	refreshHighlightAppearance(): void {
		if (!this.hasActiveSession()) {
			return;
		}
		this.session = {
			...this.session,
			style: this.settings.highlightStyle,
			showBadge: this.settings.showBadge,
		};
		this.applySessionToEditors();
	}

	private registerCommands(): void {
		for (const def of COMMAND_DEFINITIONS) {
			const command = this.addCommand({
				id: def.id,
				name: t(this.settings.uiLanguage, def.i18nKey),
				icon: def.icon,
				callback: () => {
					this.runCommand(def.id);
				},
			});
			this.localizedCommands.push({ command, key: def.i18nKey });
		}
	}

	private runCommand(id: string): void {
		switch (id) {
			case 'search-current-note':
				void this.searchCurrentNoteCommand();
				break;
			case 'search-selection':
				void this.searchSelectionCommand();
				break;
			case 'search-auto':
				void this.searchAutoCommand();
				break;
			case 'cancel-search':
				this.cancelSearch();
				break;
			case 'clear-highlights':
				this.clearSession(true);
				break;
			case 'clear-cache':
				void this.clearCache(true);
				break;
			default:
				break;
		}
	}

	private updateCommandNames(): void {
		const lang = this.settings.uiLanguage;
		for (const { command, key } of this.localizedCommands) {
			command.name = t(lang, key);
		}
	}

	private registerVaultEvents(): void {
		const onUpsert = (file: TFile): void => {
			if (file.extension !== 'md') {
				return;
			}
			this.cache.manifest.noteChanged(file.path, file.stat.mtime);
			this.scheduleCacheSave();
		};
		this.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFile) {
					onUpsert(file);
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile) {
					onUpsert(file);
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.cache.manifest.noteDeleted(file.path);
					this.scheduleCacheSave();
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.cache.manifest.noteRenamed(oldPath, file.path, file.stat.mtime);
					this.scheduleCacheSave();
				}
			}),
		);
	}

	private scheduleCacheSave(): void {
		if (this.settings.cacheMode !== 'persistent') {
			return;
		}
		if (this.cacheSaveTimer !== null) {
			window.clearTimeout(this.cacheSaveTimer);
		}
		this.cacheSaveTimer = window.setTimeout(() => {
			this.cacheSaveTimer = null;
			void this.flushCacheSave();
		}, CACHE_SAVE_DEBOUNCE_MS);
	}

	private async flushCacheSave(): Promise<void> {
		if (this.settings.cacheMode !== 'persistent' || !this.cache.isDirty()) {
			return;
		}
		this.cache.markClean();
		await this.saveSettings();
	}

	private scopeInput() {
		return {
			includeFolders: this.settings.includeFolders,
			excludeFolders: this.settings.excludeFolders,
			scopeMode: this.settings.scopeMode,
			recentDays: this.settings.recentDays,
			worksetPaths: this.workset.pathsSnapshot(),
			maxFiles: this.settings.maxFiles,
			maxFileBytes: this.settings.maxFileBytes,
		};
	}

	private extractSettings(): ExtractSettings {
		return {
			focusedExtraction: this.settings.focusedExtraction,
			normalProsePhrases: this.settings.normalProsePhrases,
			broadNgram: this.settings.broadNgram,
			minTermLength: this.settings.autoMinTermLength,
			maxTermLength: this.settings.autoMaxTermLength,
			ngramMinLength: this.settings.ngramMinLength,
			ngramMaxLength: this.settings.ngramMaxLength,
			maxAutoQueries: this.settings.maxAutoQueries,
			ngramSpanLimit: this.settings.ngramSpanLimit,
			stopWords: this.settings.autoStopWords,
			ignoredTerms: this.settings.ignoredTerms,
			caseSensitive: this.settings.caseSensitive,
		};
	}

	private collectScopedFiles(selfPath: string): {
		files: ScopedFile[];
		skippedBySize: number;
		skippedByLimit: number;
	} {
		const candidates: ScopedFile[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			candidates.push({
				path: file.path,
				statMtime: file.stat.mtime,
				size: file.stat.size,
			});
		}
		return filterScopeFiles(candidates, this.scopeInput(), selfPath);
	}

	private resolveMeta(path: string): { stem: string; title: string } {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			return { stem: path.split('/').pop()?.replace(/\.md$/, '') ?? path, title: path };
		}
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const stem = file.basename;
		const title =
			typeof fm?.title === 'string' && fm.title.trim() ? fm.title.trim() : stem;
		return { stem, title };
	}

	private readFileFn() {
		return async (path: string) => {
			const tf = this.app.vault.getAbstractFileByPath(path);
			if (!(tf instanceof TFile)) {
				return null;
			}
			const content = await this.app.vault.cachedRead(tf);
			return { content, mtime: tf.stat.mtime };
		};
	}

	private scanOptions(token: SearchCancelToken, onProgress?: (done: number, total: number) => void) {
		return {
			excerptLength: this.settings.excerptLength,
			maxHitsPerNote: this.settings.maxHitsPerNote,
			maxCandidateNotes: this.settings.maxCandidateNotes,
			readConcurrency: 2,
			maxContentBytes: this.settings.maxFileBytes,
			token,
			onProgress,
		};
	}

	private async searchCurrentNoteCommand(): Promise<void> {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const file = view?.file;
		const cm = editorView(view?.editor);
		const lang = this.settings.uiLanguage;
		if (!view || !cm || !file) {
			new Notice(t(lang, 'noticeNoEditor'));
			return;
		}

		const text = cm.state.doc.toString();
		const range = cm.state.selection.main;
		const sel = text.slice(range.from, range.to);
		if (sel.trim()) {
			await this.runSelectionFromEditor(file, cm, text, range.from, range.to);
		} else {
			await this.searchAutoCommand();
		}
	}

	private onRibbonClick(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const file = view?.file;
		const cm = editorView(view?.editor);
		const lang = this.settings.uiLanguage;
		if (!view || !cm || !file) {
			new Notice(t(lang, 'noticeNoEditor'));
			return;
		}

		const text = cm.state.doc.toString();
		const range = cm.state.selection.main;
		const sel = text.slice(range.from, range.to);
		const action = resolveRibbonAction(sel, this.hasActiveSession());
		switch (action) {
			case 'clear':
				this.clearSession(true);
				break;
			case 'selection':
				void this.runSelectionFromEditor(file, cm, text, range.from, range.to);
				break;
			case 'auto':
				void this.searchAutoCommand();
				break;
		}
	}

	private async runSelectionFromEditor(
		file: TFile,
		cm: EditorView,
		text: string,
		selectionFrom: number,
		selectionTo: number,
	): Promise<void> {
		const lang = this.settings.uiLanguage;
		const sel = text.slice(selectionFrom, selectionTo);
		const selError = validateQuery(sel);
		if (selError) {
			this.showQueryValidationNotice(lang, selError);
			return;
		}
		const request = new SelectionQuerySource().resolve(
			text,
			selectionFrom,
			selectionTo,
			this.settings.caseSensitive,
		);
		if (!request) {
			const trimmed = trimSelectionRange(text, selectionFrom, selectionTo);
			if (trimmed && !validateQuery(trimmed.query)) {
				new Notice(t(lang, 'noticeSelectionProtected'));
			}
			return;
		}
		await this.runSelectionSearch(file, cm, text, request);
	}

	private async searchSelectionCommand(): Promise<void> {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const file = view?.file;
		const cm = editorView(view?.editor);
		const lang = this.settings.uiLanguage;
		if (!view || !cm || !file) {
			new Notice(t(lang, 'noticeNoEditor'));
			return;
		}

		const text = cm.state.doc.toString();
		const range = cm.state.selection.main;
		const selectionFrom = range.from;
		const selectionTo = range.to;
		const sel = text.slice(selectionFrom, selectionTo);

		let request: SearchRequest | null;
		if (selectionFrom !== selectionTo && sel.trim()) {
			const selError = validateQuery(sel);
			if (selError) {
				this.showQueryValidationNotice(lang, selError);
				return;
			}
			request = new SelectionQuerySource().resolve(
				text,
				selectionFrom,
				selectionTo,
				this.settings.caseSensitive,
			);
			if (!request) {
				const trimmed = trimSelectionRange(text, selectionFrom, selectionTo);
				if (trimmed && !validateQuery(trimmed.query)) {
					new Notice(t(lang, 'noticeSelectionProtected'));
				}
				return;
			}
		} else {
			const query = await promptSearchQuery(this.app, lang);
			if (!query) {
				return;
			}
			const modalError = validateQuery(query);
			if (modalError) {
				this.showQueryValidationNotice(lang, modalError);
				return;
			}
			request = new ModalQuerySource(query).resolve(
				text,
				selectionFrom,
				selectionTo,
				this.settings.caseSensitive,
			);
			if (!request) {
				new Notice(t(lang, 'noticeModalTermNotInNote'));
				return;
			}
		}

		await this.runSelectionSearch(file, cm, text, request);
	}

	private async searchAutoCommand(): Promise<void> {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const file = view?.file;
		const cm = editorView(view?.editor);
		const lang = this.settings.uiLanguage;
		if (!view || !cm || !file) {
			new Notice(t(lang, 'noticeNoEditor'));
			return;
		}

		const text = cm.state.doc.toString();
		const extracted = extractQueryCandidates(text, this.extractSettings());
		if (extracted.length === 0) {
			new Notice(t(lang, 'noticeAutoNoTerms'));
			return;
		}

		new Notice(tf(lang, 'noticeAutoExtracting', extracted.length));
		await this.runAutoSearch(file, cm, text, extracted);
	}

	private showQueryValidationNotice(lang: import('./settings').UiLanguage, error: QueryValidationError): void {
		switch (error) {
			case 'empty':
				new Notice(t(lang, 'noticeInvalidQueryEmpty'));
				break;
			case 'newline':
				new Notice(t(lang, 'noticeInvalidQueryNewline'));
				break;
			case 'too_long':
				new Notice(tf(lang, 'noticeInvalidQueryTooLong', MAX_QUERY_LENGTH));
				break;
			case 'link_syntax':
				new Notice(t(lang, 'noticeInvalidQueryLinkSyntax'));
				break;
			default:
				noticeQueryValidation(lang, error);
		}
	}

	private cancelSearch(): void {
		if (this.activeSearchToken) {
			this.activeSearchToken.cancel();
			new Notice(t(this.settings.uiLanguage, 'noticeCancelled'));
		}
	}

	private async runSelectionSearch(
		file: TFile,
		cm: EditorView,
		text: string,
		request: SearchRequest,
	): Promise<void> {
		if (this.searchBusy) {
			new Notice(t(this.settings.uiLanguage, 'noticeSearchBusy'));
			return;
		}

		const lang = this.settings.uiLanguage;
		const scoped = this.collectScopedFiles(file.path);
		const token = new SearchCancelToken();
		this.activeSearchToken = token;
		this.searchBusy = true;

		const progress =
			scoped.files.length >= SEARCH_PROGRESS_THRESHOLD
				? new Notice(tf(lang, 'noticeSearching', 0, scoped.files.length), 0)
				: null;

		try {
			const coordinator = new SearchCoordinator(this.cache, this.readFileFn());
			const cacheKey = this.cache.makeKey(
				request.query,
				request.caseSensitive,
				scopeFingerprint(this.scopeInput()),
			);
			this.cache.pinActive(cacheKey);

			const result = await coordinator.execute({
				request,
				scopeSettings: this.scopeInput(),
				scopedFiles: scoped.files,
				scanOptions: this.scanOptions(token, (done, total) => {
					progress?.setMessage(tf(lang, 'noticeSearching', done, total));
				}),
			});

			progress?.hide();

			if (token.cancelled) {
				return;
			}

			this.scheduleCacheSave();

			const hits = result.hits;
			const groupKey = groupKeyForQuery(request.query, request.caseSensitive);
			const spots = buildAnchorSpots(text, request);
			const anchors: SessionAnchor[] = spots.map((a, i) => ({
				id: `sel-${i}-${a.from}-${a.to}`,
				from: a.from,
				to: a.to,
				text: a.text,
				groupKey,
			}));
			const group: ResultGroup = {
				key: groupKey,
				query: request.query,
				displayText: request.displayText,
				canLink: request.canLink && anchors.length > 0,
				candidates: groupHitsToCandidates(hits, (p) => this.resolveMeta(p)),
			};

			this.session = buildSelectionSession({
				filePath: file.path,
				group,
				anchors,
				style: this.settings.highlightStyle,
				showBadge: this.settings.showBadge,
				caseSensitive: request.caseSensitive,
			});
			this.applySessionToEditors();
			this.attachHoverToActive();
			this.refreshStatus();

			if (scoped.skippedBySize > 0 || scoped.skippedByLimit > 0) {
				new Notice(
					tf(lang, 'noticeSkipped', scoped.skippedBySize, scoped.skippedByLimit),
				);
			}

			if (group.candidates.length === 0) {
				new Notice(t(lang, 'noticeNoHits'));
				return;
			}

			const totalHits = hits.length;
			if (result.warm && result.filesRead === 0) {
				new Notice(tf(lang, 'noticeSearchDoneWarm', group.candidates.length));
			} else {
				new Notice(tf(lang, 'noticeSearchDone', group.candidates.length, totalHits));
			}
		} finally {
			progress?.hide();
			this.searchBusy = false;
			this.activeSearchToken = null;
			const cacheKey = this.cache.makeKey(
				request.query,
				request.caseSensitive,
				scopeFingerprint(this.scopeInput()),
			);
			this.cache.unpinActive(cacheKey);
		}
	}

	private async runAutoSearch(
		file: TFile,
		cm: EditorView,
		text: string,
		extracted: ReturnType<typeof extractQueryCandidates>,
	): Promise<void> {
		if (this.searchBusy) {
			new Notice(t(this.settings.uiLanguage, 'noticeSearchBusy'));
			return;
		}

		const lang = this.settings.uiLanguage;
		const scoped = this.collectScopedFiles(file.path);
		const token = new SearchCancelToken();
		this.activeSearchToken = token;
		this.searchBusy = true;

		const progress =
			scoped.files.length >= SEARCH_PROGRESS_THRESHOLD
				? new Notice(tf(lang, 'noticeSearching', 0, scoped.files.length), 0)
				: null;

		try {
			const terms = extracted.map((c) => ({
				key: groupKeyForQuery(c.query, this.settings.caseSensitive),
				query: c.query,
				caseSensitive: this.settings.caseSensitive,
			}));

			const coordinator = new MultiSearchCoordinator(this.cache, this.readFileFn());
			const result = await coordinator.execute({
				terms,
				scopeSettings: this.scopeInput(),
				scopedFiles: scoped.files,
				scanOptions: this.scanOptions(token, (done, total) => {
					progress?.setMessage(tf(lang, 'noticeSearching', done, total));
				}),
			});

			progress?.hide();

			if (token.cancelled) {
				return;
			}

			this.scheduleCacheSave();

			const scoredInputs: {
				from: number;
				to: number;
				text: string;
				score: number;
				groupKey: string;
				source: import('./core/extract/queryExtractor').ExtractSource;
				stableIndex: number;
				candidate: (typeof extracted)[number];
			}[] = [];
			let stableIndex = 0;

			const groupMeta = new Map<
				string,
				{ candidate: (typeof extracted)[number]; noteCandidates: ReturnType<typeof groupHitsToCandidates> }
			>();

			for (const candidate of extracted) {
				const key = groupKeyForQuery(candidate.query, this.settings.caseSensitive);
				const outcome = result.byTerm.get(key);
				if (!outcome || outcome.hits.length === 0) {
					continue;
				}
				const noteCandidates = groupHitsToCandidates(outcome.hits, (p) => this.resolveMeta(p));
				groupMeta.set(key, { candidate, noteCandidates });
				for (const a of candidate.anchors) {
					scoredInputs.push({
						from: a.from,
						to: a.to,
						text: a.text,
						score: candidate.score,
						groupKey: key,
						source: candidate.source,
						stableIndex: stableIndex++,
						candidate,
					});
				}
			}

			const kept = dedupeOverlappingAnchors(scoredInputs);

			const groups: ResultGroup[] = [];
			const anchors: SessionAnchor[] = [];
			let anchorIdx = 0;

			for (const [key, meta] of groupMeta) {
				const groupAnchors = kept.filter((a) => a.groupKey === key);
				if (groupAnchors.length === 0) {
					continue;
				}
				groups.push({
					key,
					query: meta.candidate.query,
					displayText: meta.candidate.displayText,
					canLink: true,
					candidates: meta.noteCandidates,
				});
				for (const a of groupAnchors) {
					anchors.push({
						id: `auto-${anchorIdx++}-${a.from}-${a.to}`,
						from: a.from,
						to: a.to,
						text: a.text,
						groupKey: key,
					});
				}
			}

			if (groups.length === 0) {
				new Notice(t(lang, 'noticeAutoNoHits'));
				return;
			}

			this.session = buildAutoSession({
				filePath: file.path,
				groups,
				anchors,
				style: this.settings.highlightStyle,
				showBadge: this.settings.showBadge,
				caseSensitive: this.settings.caseSensitive,
			});
			this.applySessionToEditors();
			this.attachHoverToActive();
			this.refreshStatus();

			if (scoped.skippedBySize > 0 || scoped.skippedByLimit > 0) {
				new Notice(
					tf(lang, 'noticeSkipped', scoped.skippedBySize, scoped.skippedByLimit),
				);
			}

			const cacheLabel = result.allWarm
				? t(lang, 'noticeCacheWarm')
				: result.anyPartial
					? t(lang, 'noticeCachePartial')
					: t(lang, 'noticeCacheCold');
			new Notice(
				tf(lang, 'noticeAutoSearchDone', groups.length, extracted.length, cacheLabel),
			);
		} finally {
			progress?.hide();
			this.searchBusy = false;
			this.activeSearchToken = null;
		}
	}

	private hasActiveSession(): boolean {
		return !!this.session.filePath && this.session.anchors.length > 0;
	}

	clearSession(notify: boolean): void {
		this.session = emptySession();
		this.applySessionToEditors();
		this.hover.detach();
		this.hoverAttachedTo = null;
		this.refreshStatus();
		if (notify) {
			new Notice(t(this.settings.uiLanguage, 'noticeCleared'));
		}
	}

	private applySessionToEditors(): void {
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (!(leaf.view instanceof MarkdownView)) {
				return;
			}
			const cm = editorView(leaf.view.editor);
			if (!cm) {
				return;
			}
			const state =
				leaf.view.file?.path === this.session.filePath && this.session.filePath
					? this.session
					: emptySession();
			cm.dispatch({ effects: setDetailSessionEffect.of(state) });
		});
	}

	private attachHoverToActive(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const cm = editorView(view?.editor);
		if (!cm || !this.session.filePath || view?.file?.path !== this.session.filePath) {
			this.hover.detach();
			this.hoverAttachedTo = null;
			return;
		}
		const dom = cm.dom;
		if (this.hoverAttachedTo === dom) {
			return;
		}
		this.hover.attach(dom, this.previewHost());
		this.hoverAttachedTo = dom;
	}

	private previewHost(): PreviewHost {
		return {
			getLang: () => this.settings.uiLanguage,
			getSession: () => this.liveSession(),
			getAnchor: (id) => this.liveAnchor(id),
			createLink: (anchor, candidatePath, hitIndex) => {
				this.createLink(anchor, candidatePath, hitIndex);
			},
			openNote: (path, heading) => {
				const link = heading ? `${path}#${heading}` : path;
				void this.app.workspace.openLinkText(link, '', false);
			},
			clearSession: () => {
				this.clearSession(true);
			},
			hasActiveSession: () => this.hasActiveSession(),
			ignoreTerm: (query, groupKey) => {
				void this.ignoreTerm(query, groupKey);
			},
		};
	}

	async ignoreTerm(query: string, groupKey: string): Promise<void> {
		const lang = this.settings.uiLanguage;
		const trimmed = query.trim();
		if (!trimmed) {
			return;
		}
		const sessionGroupKey = resolveIgnoreGroupKey(
			trimmed,
			groupKey,
			this.settings.caseSensitive,
		);
		if (!sessionGroupKey) {
			return;
		}
		this.settings.ignoredTerms = addIgnoredTerm(
			this.settings.ignoredTerms,
			trimmed,
			this.settings.caseSensitive,
		);
		await this.saveSettings();
		this.session = removeGroupFromSession(this.session, sessionGroupKey);
		this.applySessionToEditors();
		this.hover.detach();
		this.hoverAttachedTo = null;
		if (this.hasActiveSession()) {
			this.attachHoverToActive();
		}
		this.refreshStatus();
		new Notice(t(lang, 'noticeTermIgnored'));
	}

	private liveSession(): DetailSessionState {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const cm = editorView(view?.editor);
		if (cm) {
			return cm.state.field(detailSessionField);
		}
		return this.session;
	}

	private liveAnchor(id: string): SessionAnchor | undefined {
		const session = this.liveSession();
		return session.anchors.find((a) => a.id === id);
	}

	private createLink(anchor: SessionAnchor, candidatePath: string, hitIndex: number): void {
		const lang = this.settings.uiLanguage;
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const cm = editorView(view?.editor);
		const sourcePath = view?.file?.path ?? '';
		const group = getGroup(this.session, anchor.groupKey);
		if (!cm || !group?.canLink) {
			return;
		}

		const live = this.liveAnchor(anchor.id);
		if (!live) {
			new Notice(t(lang, 'noticeAnchorChanged'));
			return;
		}

		const docText = cm.state.doc.toString();
		if (
			!anchorStillValid(
				docText,
				live.from,
				live.to,
				group.displayText,
				this.settings.caseSensitive,
			)
		) {
			new Notice(t(lang, 'noticeAnchorChanged'));
			return;
		}

		const candidate = group.candidates.find((c) => c.path === candidatePath);
		const hit = candidate?.hits[hitIndex] ?? candidate?.hits[0];
		if (!hit) {
			return;
		}

		const targetFile = this.app.vault.getAbstractFileByPath(candidatePath);
		if (!(targetFile instanceof TFile)) {
			return;
		}

		const linktext = this.app.metadataCache.fileToLinktext(
			targetFile,
			sourcePath,
			true,
		);
		const insert = formatHeadingWikilink(linktext, live.text, hit.heading);

		cm.dispatch({
			changes: { from: live.from, to: live.to, insert },
		});

		this.session = {
			...cm.state.field(detailSessionField),
			anchors: cm.state.field(detailSessionField).anchors.filter((a) => a.id !== anchor.id),
		};
		cm.dispatch({ effects: setDetailSessionEffect.of(this.session) });
		this.refreshStatus();
		if (this.session.anchors.length === 0) {
			this.hover.detach();
			this.hoverAttachedTo = null;
		}
	}

	private refreshStatus(): void {
		const lang = this.settings.uiLanguage;
		this.refreshRibbonTooltip();
		if (!this.statusEl) {
			return;
		}
		if (!this.hasActiveSession()) {
			this.statusEl.hide();
			return;
		}
		this.statusEl.setText(tf(lang, 'statusHits', sessionStats(this.session).candidateNoteCount));
		this.statusEl.setAttr('title', t(lang, 'statusClearHint'));
		this.statusEl.show();
	}

	private refreshRibbonTooltip(): void {
		if (!this.ribbonEl) {
			return;
		}
		const lang = this.settings.uiLanguage;
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const cm = editorView(view?.editor);
		let hasSelection = false;
		if (cm) {
			const range = cm.state.selection.main;
			const text = cm.state.doc.toString();
			hasSelection = text.slice(range.from, range.to).trim().length > 0;
		}
		const label =
			!hasSelection && this.hasActiveSession()
				? t(lang, 'ribbonTooltipClear')
				: t(lang, 'ribbonTooltip');
		this.ribbonEl.setAttr('aria-label', label);
	}
}
