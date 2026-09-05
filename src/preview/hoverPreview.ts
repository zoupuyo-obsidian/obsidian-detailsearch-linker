import { Platform } from 'obsidian';
import { getGroup, type DetailSessionState, type NoteCandidate, type ResultGroup, type SessionAnchor } from '../session';
import { t } from '../i18n';
import type { UiLanguage } from '../settings';
import { fillHighlightedExcerpt } from './splitHighlightedText';
import { findAnchorIdFromEventTarget } from '../editor/highlighter';

export interface PreviewHost {
	getLang: () => UiLanguage;
	getSession: () => DetailSessionState;
	getAnchor(id: string): SessionAnchor | undefined;
	createLink(anchor: SessionAnchor, candidatePath: string, hitIndex: number): void;
	openNote(path: string, heading: string): void;
	clearSession(): void;
	hasActiveSession(): boolean;
	ignoreTerm(query: string, groupKey: string): void;
}

const SHOW_DELAY_MS = 280;
const HIDE_DELAY_MS = 200;

export class DetailHoverController {
	private popover: HTMLElement | null = null;
	private host: PreviewHost | null = null;
	private showTimer: number | null = null;
	private hideTimer: number | null = null;
	private activeAnchorId: string | null = null;
	private focusedPath = '';
	private focusedHitIndex = 0;
	private cleanupDom: (() => void) | null = null;
	private suppressMouseUntil = 0;

	attach(editorDom: HTMLElement, host: PreviewHost): void {
		this.detach();
		this.host = host;

		const onMove = (evt: MouseEvent): void => {
			if (Date.now() < this.suppressMouseUntil) {
				return;
			}
			if (Platform.isMobile) {
				return;
			}
			const id = findAnchorIdFromEventTarget(evt.target);
			if (!id) {
				if (this.popover && evt.target instanceof Node && this.popover.contains(evt.target)) {
					this.clearHide();
					return;
				}
				this.scheduleHide();
				return;
			}
			this.scheduleShow(id, evt.clientX, evt.clientY);
		};

		const onClick = (evt: MouseEvent): void => {
			const id = findAnchorIdFromEventTarget(evt.target);
			if (!id) {
				return;
			}
			const badge =
				evt.target instanceof Element && evt.target.closest('.cm-detailsearch-linker-badge');
			if (!Platform.isMobile && !badge) {
				return;
			}
			evt.preventDefault();
			evt.stopPropagation();
			this.suppressMouseUntil = Date.now() + 500;
			void this.show(id, evt.clientX, evt.clientY);
		};

		editorDom.addEventListener('mousemove', onMove);
		editorDom.addEventListener('click', onClick, true);

		this.cleanupDom = () => {
			editorDom.removeEventListener('mousemove', onMove);
			editorDom.removeEventListener('click', onClick, true);
		};
	}

	detach(): void {
		this.hide();
		this.cleanupDom?.();
		this.cleanupDom = null;
		this.host = null;
	}

	hide(): void {
		this.clearShow();
		this.clearHide();
		this.popover?.remove();
		this.popover = null;
		this.activeAnchorId = null;
		this.focusedPath = '';
		this.focusedHitIndex = 0;
	}

	private scheduleShow(id: string, x: number, y: number): void {
		this.clearHide();
		if (this.activeAnchorId === id && this.popover) {
			return;
		}
		this.clearShow();
		this.showTimer = window.setTimeout(() => {
			void this.show(id, x, y);
		}, SHOW_DELAY_MS);
	}

	private scheduleHide(): void {
		this.clearShow();
		this.clearHide();
		this.hideTimer = window.setTimeout(() => this.hide(), HIDE_DELAY_MS);
	}

	private clearShow(): void {
		if (this.showTimer !== null) {
			window.clearTimeout(this.showTimer);
			this.showTimer = null;
		}
	}

	private clearHide(): void {
		if (this.hideTimer !== null) {
			window.clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}
	}

	private async show(id: string, x: number, y: number): Promise<void> {
		const host = this.host;
		const anchor = host?.getAnchor(id);
		const session = host?.getSession();
		if (!host || !anchor || !session) {
			return;
		}
		const group = getGroup(session, anchor.groupKey);
		if (!group) {
			return;
		}
		this.clearShow();
		this.clearHide();
		this.activeAnchorId = id;
		if (!this.focusedPath && group.candidates[0]) {
			this.focusedPath = group.candidates[0].path;
			this.focusedHitIndex = 0;
		}
		await this.render(anchor, group, session, host, x, y);
	}

	private async render(
		anchor: SessionAnchor,
		group: ResultGroup,
		session: DetailSessionState,
		host: PreviewHost,
		x: number,
		y: number,
	): Promise<void> {
		this.popover?.remove();
		const doc = activeDocument;
		const pop = doc.body.createDiv({ cls: 'detailsearch-linker-popover' });
		this.popover = pop;

		pop.addEventListener('mouseenter', () => this.clearHide());
		pop.addEventListener('mouseleave', () => this.scheduleHide());

		const lang = host.getLang();
		pop.createDiv({ cls: 'detailsearch-linker-popover__match', text: anchor.text });

		if (!group.canLink) {
			pop.createDiv({
				cls: 'detailsearch-linker-popover__warn',
				text: t(lang, 'popoverNoAnchor'),
			});
		}

		const list = pop.createDiv({ cls: 'detailsearch-linker-popover__list' });
		for (const candidate of group.candidates) {
			const row = list.createEl('button', {
				cls: 'detailsearch-linker-popover__row',
				type: 'button',
			});
			if (candidate.path === this.focusedPath) {
				row.addClass('is-focused');
			}
			row.createSpan({
				cls: 'detailsearch-linker-popover__name',
				text: candidate.title || candidate.stem,
			});
			if (candidate.hits.length > 1) {
				row.createSpan({
					cls: 'detailsearch-linker-popover__hit-count',
					text: ` (${candidate.hits.length})`,
				});
			}
			row.addEventListener('click', () => {
				this.focusedPath = candidate.path;
				this.focusedHitIndex = 0;
				const freshSession = host.getSession();
				const freshGroup = getGroup(freshSession, anchor.groupKey);
				if (!freshGroup) {
					return;
				}
				void this.render(anchor, freshGroup, freshSession, host, x, y);
			});
		}

		const previewBox = pop.createDiv({ cls: 'detailsearch-linker-popover__preview' });
		const focused = group.candidates.find((c) => c.path === this.focusedPath);
		if (focused) {
			this.renderHitPreview(previewBox, focused, this.focusedHitIndex, group, session, host, lang);
		}

		const actions = pop.createDiv({ cls: 'detailsearch-linker-popover__actions' });
		const linkBtn = actions.createEl('button', {
			cls: 'mod-cta',
			text: t(lang, 'createLink'),
		});
		linkBtn.disabled = !group.canLink || !this.focusedPath;
		linkBtn.addEventListener('click', () => {
			if (this.focusedPath) {
				this.hide();
				host.createLink(anchor, this.focusedPath, this.focusedHitIndex);
			}
		});
		const openBtn = actions.createEl('button', { text: t(lang, 'openNote') });
		openBtn.disabled = !this.focusedPath;
		openBtn.addEventListener('click', () => {
			if (this.focusedPath) {
				const hit = focused?.hits[this.focusedHitIndex];
				host.openNote(this.focusedPath, hit?.heading ?? '');
			}
		});
		if (host.hasActiveSession()) {
			const clearBtn = actions.createEl('button', { text: t(lang, 'clearHighlights') });
			clearBtn.addEventListener('click', () => {
				this.hide();
				host.clearSession();
			});
		}
		const ignoreBtn = actions.createEl('button', { text: t(lang, 'ignoreTerm') });
		ignoreBtn.setAttr('title', t(lang, 'ignoreTermHint'));
		ignoreBtn.addEventListener('click', () => {
			this.hide();
			host.ignoreTerm(group.query, group.key);
		});

		this.position(pop, x, y);
	}

	private renderHitPreview(
		container: HTMLElement,
		candidate: NoteCandidate,
		hitIndex: number,
		group: ResultGroup,
		session: DetailSessionState,
		host: PreviewHost,
		_lang: UiLanguage,
	): void {
		container.empty();
		const hits = candidate.hits;
		if (hits.length > 1) {
			const tabs = container.createDiv({ cls: 'detailsearch-linker-popover__hits' });
			hits.forEach((hit, i) => {
				const btn = tabs.createEl('button', {
					text: hit.heading || `#${i + 1}`,
					type: 'button',
				});
				if (i === hitIndex) {
					btn.addClass('is-active');
				}
				btn.addEventListener('click', () => {
					this.focusedHitIndex = i;
					const freshSession = host.getSession();
					this.renderHitPreview(
						container,
						candidate,
						i,
						group,
						freshSession,
						host,
						_lang,
					);
				});
			});
		}
		const hit = hits[hitIndex] ?? hits[0];
		if (!hit) {
			return;
		}
		if (hit.heading) {
			container.createDiv({
				cls: 'detailsearch-linker-popover__heading',
				text: hit.heading,
			});
		}
		const excerptEl = container.createDiv();
		const liveSession = host.getSession();
		fillHighlightedExcerpt(
			excerptEl,
			hit.excerpt,
			group.query,
			liveSession.caseSensitive,
			liveSession.style,
		);
	}

	private position(pop: HTMLElement, x: number, y: number): void {
		const margin = 8;
		const view = pop.ownerDocument.defaultView;
		const maxW = Math.min(420, (view?.innerWidth ?? 420) - margin * 2);
		pop.style.width = `${maxW}px`;
		const rect = pop.getBoundingClientRect();
		let top = y + 16;
		let left = x;
		const vh = view?.innerHeight ?? 800;
		const vw = view?.innerWidth ?? 800;
		if (top + rect.height > vh - margin) {
			top = Math.max(margin, y - rect.height - 12);
		}
		if (left + rect.width > vw - margin) {
			left = vw - rect.width - margin;
		}
		pop.style.top = `${Math.max(margin, top)}px`;
		pop.style.left = `${Math.max(margin, left)}px`;
	}
}
