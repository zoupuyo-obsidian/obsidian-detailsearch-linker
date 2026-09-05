import {
	Facet,
	RangeSetBuilder,
	StateEffect,
	StateField,
	type Extension,
} from '@codemirror/state';
import {
	Decoration,
	EditorView,
	WidgetType,
	type DecorationSet,
} from '@codemirror/view';
import {
	emptySession,
	getGroup,
	groupCandidateCount,
	type DetailSessionState,
	type SessionAnchor,
} from '../session';
import { prepareHighlightRanges, type HighlightRangeItem } from './highlightRanges';

export const setDetailSessionEffect = StateEffect.define<DetailSessionState>();

class BadgeWidget extends WidgetType {
	constructor(
		private readonly count: number,
		private readonly anchorId: string,
		private readonly ariaLabel: string,
	) {
		super();
	}

	eq(other: BadgeWidget): boolean {
		return (
			this.count === other.count &&
			this.anchorId === other.anchorId &&
			this.ariaLabel === other.ariaLabel
		);
	}

	toDOM(view: EditorView): HTMLElement {
		const el = view.dom.ownerDocument.createElement('button');
		el.className = 'cm-detailsearch-linker-badge';
		el.dataset.anchorId = this.anchorId;
		el.textContent = String(this.count);
		el.type = 'button';
		el.setAttribute('aria-haspopup', 'dialog');
		el.setAttribute('aria-label', this.ariaLabel);
		return el;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

interface PlannedRange {
	from: number;
	to: number;
	kind: 'mark' | 'widget';
	anchor: SessionAnchor;
}

export function planHighlightRanges(state: DetailSessionState): HighlightRangeItem[] {
	const planned = collectPlannedRanges(state);
	return prepareHighlightRanges(
		planned.map((p) => ({
			from: p.from,
			to: p.to,
			kind: p.kind,
			sortOrder: p.kind === 'mark' ? 0 : 1,
		})),
	);
}

function collectPlannedRanges(state: DetailSessionState): PlannedRange[] {
	const planned: PlannedRange[] = [];
	for (const anchor of state.anchors) {
		if (anchor.to <= anchor.from) {
			continue;
		}
		planned.push({ from: anchor.from, to: anchor.to, kind: 'mark', anchor });
		const badgeCount = groupCandidateCount(state, anchor.groupKey);
		if (state.showBadge && badgeCount > 0) {
			planned.push({ from: anchor.to, to: anchor.to, kind: 'widget', anchor });
		}
	}
	return planned;
}

function buildDecorations(
	state: DetailSessionState,
	badgeAriaLabel: (count: number) => string,
): DecorationSet {
	if (state.anchors.length === 0) {
		return Decoration.none;
	}
	const planned = collectPlannedRanges(state);
	const plannedByRange = new Map<string, PlannedRange>();
	for (const range of planned) {
		const key = `${range.from}\0${range.to}\0${range.kind}`;
		if (!plannedByRange.has(key)) {
			plannedByRange.set(key, range);
		}
	}
	const safe = prepareHighlightRanges(
		planned.map((p) => ({
			from: p.from,
			to: p.to,
			kind: p.kind,
			sortOrder: p.kind === 'mark' ? 0 : 1,
		})),
	);
	const builder = new RangeSetBuilder<Decoration>();
	for (const item of safe) {
		const match = plannedByRange.get(`${item.from}\0${item.to}\0${item.kind}`);
		if (!match) {
			continue;
		}
		if (item.kind === 'mark') {
			builder.add(
				item.from,
				item.to,
				Decoration.mark({
					class: `cm-detailsearch-linker-mark is-${state.style}`,
					attributes: { 'data-anchor-id': match.anchor.id },
				}),
			);
		} else {
			const badgeCount = groupCandidateCount(state, match.anchor.groupKey);
			builder.add(
				item.from,
				item.to,
				Decoration.widget({
					widget: new BadgeWidget(
						badgeCount,
						match.anchor.id,
						badgeAriaLabel(badgeCount),
					),
					side: 1,
				}),
			);
		}
	}
	return builder.finish();
}

export const detailSessionField = StateField.define<DetailSessionState>({
	create: () => emptySession(),
	update(value, tr) {
		for (const effect of tr.effects) {
			if (effect.is(setDetailSessionEffect)) {
				return effect.value;
			}
		}
		if (!tr.docChanged || value.anchors.length === 0) {
			return value;
		}
		const mapped: SessionAnchor[] = [];
		for (const anchor of value.anchors) {
			const from = tr.changes.mapPos(anchor.from, 1);
			const to = tr.changes.mapPos(anchor.to, -1);
			if (to > from) {
				mapped.push({ ...anchor, from, to });
			}
		}
		return { ...value, anchors: mapped };
	},
});

const badgeAriaLabelFacet = Facet.define<(count: number) => string>();

export function detailsearchLinkerEditorExtension(
	badgeAriaLabel: (count: number) => string = (count) =>
		`${count} link candidates`,
): Extension {
	return [
		detailSessionField,
		badgeAriaLabelFacet.of(badgeAriaLabel),
		EditorView.decorations.compute(
			[detailSessionField, badgeAriaLabelFacet],
			(state) => {
				const label =
					state.facet(badgeAriaLabelFacet)[0] ??
					((count: number) => `${count} link candidates`);
				return buildDecorations(state.field(detailSessionField), label);
			},
		),
	];
}
export function findAnchorIdFromEventTarget(target: EventTarget | null): string | null {
	if (!(target instanceof Element)) {
		return null;
	}
	const el = target.closest('[data-anchor-id]');
	return el instanceof HTMLElement ? (el.dataset.anchorId ?? null) : null;
}

export { getGroup };
