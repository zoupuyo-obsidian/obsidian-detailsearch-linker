import { validateQuery } from '../query/queryValidation';
import { normalizeTerm } from '../search/termMatch';

export const MAX_LEARNED_DICTIONARY_TERMS = 200;

function dictionaryKey(term: string): string {
	return normalizeTerm(term, false);
}

/** Normalizes editable one-term-per-line dictionary entries. */
export function normalizeDictionaryTerms(terms: readonly string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of terms) {
		const term = raw.trim();
		if (!term || validateQuery(term)) {
			continue;
		}
		const key = dictionaryKey(term);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		out.push(term);
	}
	return out;
}

export function parseDictionaryTermsText(text: string): string[] {
	return normalizeDictionaryTerms(text.split(/\r?\n/));
}

/**
 * Learning is deliberately stricter than manual entry. It avoids recording
 * paths, URLs, identifiers, and number-only strings from an otherwise valid
 * explicit link action.
 */
export function isLearnableDictionaryTerm(term: string, input: {
	minLength: number;
	maxLength: number;
	stopWords: readonly string[];
	ignoredTerms: readonly string[];
	caseSensitive: boolean;
}): boolean {
	const trimmed = term.trim();
	if (
		validateQuery(trimmed) ||
		trimmed.length < input.minLength ||
		trimmed.length > input.maxLength ||
		/^(?:https?:\/\/|www\.)/iu.test(trimmed) ||
		/[\\/_]/u.test(trimmed) ||
		/^\p{N}+$/u.test(trimmed) ||
		!/\p{L}/u.test(trimmed)
	) {
		return false;
	}
	const key = normalizeTerm(trimmed, input.caseSensitive);
	return !input.stopWords.some((word) => normalizeTerm(word, input.caseSensitive) === key)
		&& !input.ignoredTerms.some((word) => normalizeTerm(word, input.caseSensitive) === key);
}

/** Moves a successfully linked term to the newest position in the LRU list. */
export function learnDictionaryTerm(
	current: readonly string[],
	manual: readonly string[],
	term: string,
): string[] {
	const normalizedManual = new Set(normalizeDictionaryTerms(manual).map(dictionaryKey));
	const normalizedTerm = normalizeDictionaryTerms([term])[0];
	if (!normalizedTerm || normalizedManual.has(dictionaryKey(normalizedTerm))) {
		return [...current];
	}
	const key = dictionaryKey(normalizedTerm);
	const withoutTerm = normalizeDictionaryTerms(current).filter((item) => dictionaryKey(item) !== key);
	return [...withoutTerm, normalizedTerm].slice(-MAX_LEARNED_DICTIONARY_TERMS);
}
