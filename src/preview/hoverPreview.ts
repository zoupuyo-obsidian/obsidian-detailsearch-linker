import { Platform } from 'obsidian';
import { getGroup, type DetailSessionState, type NoteCandidate, type ResultGroup, type SessionAnchor } from '../session';
import { t } from '../i18n';
import type { UiLanguage } from '../settings';
import { fillHighlightedExcerpt } from './splitHighlightedText';
import { findAnchorIdFromEventTarget } from '../editor/highlighter';
import {
	normalizePopoverFocus,
	resolvePopoverActionTarget,
} from './popoverState';

export interface PreviewHost {
	getLang: () => UiLanguage;
	getSession: () => DetailSessionState;
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
	private opener: HTMLElement | null = null;

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
			const opener =
				evt.target instanceof Element
					? evt.target.closest<HTMLElement>('.cm-detailsearch-linker-badge')
					: null;
			const rect = opener?.getBoundingClientRect();
			const x = evt.clientX || rect?.left || 0;
			const y = evt.clientY || rect?.bottom || 0;
			void this.show(id, x, y, opener);
		};

		const onKeyDown = (evt: KeyboardEvent): void => {
			if (evt.key !== 'Escape' || !this.popover) {
				return;
			}
			evt.preventDefault();
			evt.stopPropagation();
			const opener = this.opener;
			this.hide();
			opener?.focus();
		};

		editorDom.addEventListener('mousemove', onMove);
		editorDom.addEventListener('click', onClick, true);
		editorDom.ownerDocument.addEventListener('keydown', onKeyDown, true);

		this.cleanupDom = () => {
			editorDom.removeEventListener('mousemove', onMove);
			editorDom.removeEventListener('click', onClick, true);
			editorDom.ownerDocument.removeEventListener('keydown', onKeyDown, true);
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
		this.opener = null;
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

	private async show(
		id: string,
		x: number,
		y: number,
		opener: HTMLElement | null = null,
	): Promise<void> {
		const host = this.host;
		const session = host?.getSession();
		const anchor = session?.anchors.find((item) => item.id === id);
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
		this.opener = opener;
		const focus = normalizePopoverFocus(group, {
			path: this.focusedPath,
			hitIndex: this.focusedHitIndex,
		});
		this.focusedPath = focus.path;
		this.focusedHitIndex = focus.hitIndex;
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
		pop.setAttr('role', 'dialog');
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
				const freshAnchor = freshSession.anchors.find((item) => item.id === anchor.id);
				const freshGroup = freshAnchor
					? getGroup(freshSession, freshAnchor.groupKey)
					: undefined;
				if (!freshAnchor || !freshGroup) {
					return;
				}
				const focus = normalizePopoverFocus(freshGroup, {
					path: this.focusedPath,
					hitIndex: this.focusedHitIndex,
				});
				this.focusedPath = focus.path;
				this.focusedHitIndex = focus.hitIndex;
				void this.render(freshAnchor, freshGroup, freshSession, host, x, y);
			});
		}

		const previewBox = pop.createDiv({ cls: 'detailsearch-linker-popover__preview' });
		const focused = group.candidates.find((c) => c.path === this.focusedPath);
		if (focused) {
			this.renderHitPreview(
				previewBox,
				focused,
				this.focusedHitIndex,
				group,
				host,
				anchor.id,
				x,
				y,
			);
		}

		const actions = pop.createDiv({ cls: 'detailsearch-linker-popover__actions' });
		const linkBtn = actions.createEl('button', {
			cls: 'mod-cta',
			text: t(lang, 'createLink'),
		});
		linkBtn.disabled =
			!group.canLink ||
			!resolvePopoverActionTarget(
				session,
				anchor.id,
				this.focusedPath,
				this.focusedHitIndex,
			);
		linkBtn.addEventListener('click', () => {
			const target = resolvePopoverActionTarget(
				host.getSession(),
				anchor.id,
				this.focusedPath,
				this.focusedHitIndex,
			);
			if (!target?.group.canLink) {
				return;
			}
			this.hide();
			host.createLink(target.anchor, target.candidate.path, target.hitIndex);
		});
		const openBtn = actions.createEl('button', { text: t(lang, 'openNote') });
		openBtn.disabled = !resolvePopoverActionTarget(
			session,
			anchor.id,
			this.focusedPath,
			this.focusedHitIndex,
		);
		openBtn.addEventListener('click', () => {
			const target = resolvePopoverActionTarget(
				host.getSession(),
				anchor.id,
				this.focusedPath,
				this.focusedHitIndex,
			);
			if (!target) {
				return;
			}
			host.openNote(target.candidate.path, target.hit.heading);
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
		host: PreviewHost,
		anchorId: string,
		x: number,
		y: number,
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
					const freshSession = host.getSession();
					const target = resolvePopoverActionTarget(
						freshSession,
						anchorId,
						candidate.path,
						i,
					);
					if (!target) {
						return;
					}
					this.focusedPath = target.candidate.path;
					this.focusedHitIndex = target.hitIndex;
					void this.render(
						target.anchor,
						target.group,
						freshSession,
						host,
						x,
						y,
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
