import {
	getLanguage,
	normalizePath,
	PluginSettingTab,
	type App,
	type SettingDefinitionItem,
	type SettingDefinitionRender,
} from 'obsidian';
import type DetailSearchLinkerPlugin from './main';
import { t, type I18nKey } from './i18n';
import { clampScopeValue, type ScopeMode } from './core/search/scopeFilter';
import { normalizeIgnoredTerms, parseIgnoredTermsText } from './core/ignore/ignoredTerms';
import { MAX_FILE_BYTES } from './core/query/queryValidation';
import { HARD_CAP_AUTO_QUERIES } from './core/extract/queryExtractor';

export type UiLanguage = 'ja' | 'en';
export type HighlightStyle = 'invert' | 'marker' | 'color' | 'underline';
export type CacheMode = 'memory' | 'persistent';

export interface DetailSearchLinkerSettings {
	uiLanguage: UiLanguage;
	includeFolders: string[];
	excludeFolders: string[];
	scopeMode: ScopeMode;
	recentDays: number;
	worksetSize: number;
	maxFiles: number;
	maxFileBytes: number;
	caseSensitive: boolean;
	cacheMode: CacheMode;
	cacheMaxMb: number;
	excerptLength: number;
	highlightStyle: HighlightStyle;
	showBadge: boolean;
	clearOnFileChange: boolean;
	maxHitsPerNote: number;
	maxCandidateNotes: number;
	focusedExtraction: boolean;
	normalProsePhrases: boolean;
	broadNgram: boolean;
	autoMinTermLength: number;
	autoMaxTermLength: number;
	ngramMinLength: number;
	ngramMaxLength: number;
	maxAutoQueries: number;
	ngramSpanLimit: number;
	autoStopWords: string[];
	ignoredTerms: string[];
}

export function defaultUiLanguage(): UiLanguage {
	return getLanguage() === 'ja' ? 'ja' : 'en';
}

export const DEFAULT_SETTINGS: DetailSearchLinkerSettings = {
	uiLanguage: 'en',
	includeFolders: [],
	excludeFolders: [],
	scopeMode: 'all',
	recentDays: 30,
	worksetSize: 50,
	maxFiles: 500,
	maxFileBytes: 512_000,
	caseSensitive: false,
	cacheMode: 'persistent',
	cacheMaxMb: 8,
	excerptLength: 160,
	highlightStyle: 'invert',
	showBadge: true,
	clearOnFileChange: true,
	maxHitsPerNote: 8,
	maxCandidateNotes: 80,
	focusedExtraction: true,
	normalProsePhrases: true,
	broadNgram: false,
	autoMinTermLength: 3,
	autoMaxTermLength: 32,
	ngramMinLength: 2,
	ngramMaxLength: 6,
	maxAutoQueries: 40,
	ngramSpanLimit: 12,
	autoStopWords: [
		'the',
		'a',
		'an',
		'and',
		'or',
		'but',
		'の',
		'に',
		'は',
		'を',
		'が',
		'と',
		'で',
		'も',
	],
	ignoredTerms: [],
};

function linesToList(value: string): string[] {
	return value
		.split(/\r?\n/)
		.map((s) => normalizePath(s.trim()))
		.filter(Boolean);
}

export function migrateSettings(raw: Partial<DetailSearchLinkerSettings>): DetailSearchLinkerSettings {
	const rest = { ...raw };
	return {
		...DEFAULT_SETTINGS,
		...rest,
		uiLanguage: rest.uiLanguage ?? defaultUiLanguage(),
		includeFolders: Array.isArray(rest.includeFolders)
			? rest.includeFolders.map((p) => normalizePath(p))
			: DEFAULT_SETTINGS.includeFolders,
		excludeFolders: Array.isArray(rest.excludeFolders)
			? rest.excludeFolders.map((p) => normalizePath(p))
			: DEFAULT_SETTINGS.excludeFolders,
		scopeMode: rest.scopeMode ?? DEFAULT_SETTINGS.scopeMode,
		recentDays: clampScopeValue(rest.recentDays ?? DEFAULT_SETTINGS.recentDays, 0, 3650, 30),
		worksetSize: clampScopeValue(rest.worksetSize ?? DEFAULT_SETTINGS.worksetSize, 0, 500, 50),
		maxFiles: clampScopeValue(rest.maxFiles ?? DEFAULT_SETTINGS.maxFiles, 10, 10_000, 500),
		maxFileBytes: clampScopeValue(
			rest.maxFileBytes ?? DEFAULT_SETTINGS.maxFileBytes,
			4_096,
			MAX_FILE_BYTES,
			512_000,
		),
		cacheMaxMb: clampScopeValue(rest.cacheMaxMb ?? DEFAULT_SETTINGS.cacheMaxMb, 1, 64, 8),
		excerptLength: clampScopeValue(rest.excerptLength ?? DEFAULT_SETTINGS.excerptLength, 40, 800, 160),
		maxHitsPerNote: clampScopeValue(
			rest.maxHitsPerNote ?? DEFAULT_SETTINGS.maxHitsPerNote,
			1,
			50,
			8,
		),
		maxCandidateNotes: clampScopeValue(
			rest.maxCandidateNotes ?? DEFAULT_SETTINGS.maxCandidateNotes,
			5,
			500,
			80,
		),
		autoMinTermLength: clampScopeValue(
			rest.autoMinTermLength ?? DEFAULT_SETTINGS.autoMinTermLength,
			2,
			20,
			3,
		),
		autoMaxTermLength: clampScopeValue(
			rest.autoMaxTermLength ?? DEFAULT_SETTINGS.autoMaxTermLength,
			4,
			80,
			32,
		),
		ngramMinLength: clampScopeValue(
			rest.ngramMinLength ?? DEFAULT_SETTINGS.ngramMinLength,
			2,
			12,
			2,
		),
		ngramMaxLength: clampScopeValue(
			rest.ngramMaxLength ?? DEFAULT_SETTINGS.ngramMaxLength,
			2,
			16,
			6,
		),
		maxAutoQueries: clampScopeValue(
			rest.maxAutoQueries ?? DEFAULT_SETTINGS.maxAutoQueries,
			5,
			HARD_CAP_AUTO_QUERIES,
			40,
		),
		ngramSpanLimit: clampScopeValue(
			rest.ngramSpanLimit ?? DEFAULT_SETTINGS.ngramSpanLimit,
			4,
			40,
			12,
		),
		autoStopWords: Array.isArray(rest.autoStopWords)
			? rest.autoStopWords
			: DEFAULT_SETTINGS.autoStopWords,
		ignoredTerms: Array.isArray(rest.ignoredTerms)
			? normalizeIgnoredTerms(
					rest.ignoredTerms,
					rest.caseSensitive ?? DEFAULT_SETTINGS.caseSensitive,
				)
			: DEFAULT_SETTINGS.ignoredTerms,
	};
}

export class DetailSearchLinkerSettingTab extends PluginSettingTab {
	plugin: DetailSearchLinkerPlugin;

	constructor(app: App, plugin: DetailSearchLinkerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private lang(): UiLanguage {
		return this.plugin.settings.uiLanguage;
	}

	private L(key: I18nKey): string {
		return t(this.lang(), key);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			this.languageRow(),
			this.folderTextarea('settingsIncludeFolders', 'settingsIncludeFoldersDesc', 'includeFolders'),
			this.folderTextarea('settingsExcludeFolders', 'settingsExcludeFoldersDesc', 'excludeFolders'),
			this.scopeModeRow(),
			this.sliderRow('settingsRecentDays', 'settingsRecentDaysDesc', 'recentDays', 0, 365, 1),
			this.sliderRow('settingsWorksetSize', 'settingsWorksetSizeDesc', 'worksetSize', 0, 500, 5),
			this.sliderRow('settingsMaxFiles', 'settingsMaxFilesDesc', 'maxFiles', 10, 5000, 10),
			this.sliderRow(
				'settingsMaxFileBytes',
				'settingsMaxFileBytesDesc',
				'maxFileBytes',
				4096,
				MAX_FILE_BYTES,
				4096,
				(v) => `${Math.round(v / 1024)} KB`,
			),
			this.toggleRow('settingsCaseSensitive', 'caseSensitive'),
			this.cacheModeRow(),
			this.sliderRow('settingsCacheMaxMb', 'settingsCacheMaxMbDesc', 'cacheMaxMb', 1, 64, 1, (v) => `${v} MB`),
			this.sliderRow('settingsExcerptLength', 'settingsExcerptLengthDesc', 'excerptLength', 40, 800, 20),
			this.sliderRow('settingsMaxHitsPerNote', 'settingsMaxHitsPerNoteDesc', 'maxHitsPerNote', 1, 30, 1),
			this.sliderRow(
				'settingsMaxCandidateNotes',
				'settingsMaxCandidateNotesDesc',
				'maxCandidateNotes',
				5,
				300,
				5,
			),
			{
				name: this.L('settingsHighlightStyle'),
				desc: this.L('settingsHighlightStyleDesc'),
				control: {
					type: 'dropdown',
					key: 'highlightStyle',
					defaultValue: 'invert',
					options: {
						invert: this.L('styleInvert'),
						marker: this.L('styleMarker'),
						color: this.L('styleColor'),
						underline: this.L('styleUnderline'),
					},
				},
			},
			this.toggleRow('settingsShowBadge', 'showBadge'),
			this.toggleRow('settingsClearOnFileChange', 'clearOnFileChange'),
			this.toggleRow('settingsFocusedExtraction', 'focusedExtraction'),
			this.toggleRow('settingsNormalProse', 'normalProsePhrases'),
			this.toggleRow('settingsBroadNgram', 'broadNgram'),
			this.sliderRow('settingsAutoMinTerm', 'settingsAutoMinTermDesc', 'autoMinTermLength', 2, 12, 1),
			this.sliderRow('settingsAutoMaxTerm', 'settingsAutoMaxTermDesc', 'autoMaxTermLength', 4, 60, 1),
			this.sliderRow('settingsNgramMin', 'settingsNgramMinDesc', 'ngramMinLength', 2, 10, 1),
			this.sliderRow('settingsNgramMax', 'settingsNgramMaxDesc', 'ngramMaxLength', 2, 12, 1),
			this.sliderRow('settingsMaxAutoQueries', 'settingsMaxAutoQueriesDesc', 'maxAutoQueries', 5, HARD_CAP_AUTO_QUERIES, 5),
			this.sliderRow('settingsNgramSpanLimit', 'settingsNgramSpanLimitDesc', 'ngramSpanLimit', 4, 30, 1),
			this.stopWordsRow(),
			this.ignoredTermsRow(),
			this.cacheInfoRow(),
		];
	}

	setControlValue(key: string, value: unknown): void | Promise<void> {
		if (key === 'highlightStyle' || key === 'showBadge') {
			const result = super.setControlValue(key, value);
			void Promise.resolve(result).then(() => this.plugin.refreshHighlightAppearance());
			return result;
		}
		if (
			key === 'cacheMode' ||
			key === 'cacheMaxMb' ||
			key === 'includeFolders' ||
			key === 'excludeFolders' ||
			key === 'scopeMode' ||
			key === 'recentDays' ||
			key === 'worksetSize' ||
			key === 'maxFiles' ||
			key === 'maxFileBytes' ||
			key === 'caseSensitive'
		) {
			const result = super.setControlValue(key, value);
			void Promise.resolve(result).then(() => {
				this.plugin.onScopeOrCacheSettingsChanged();
			});
			return result;
		}
		return super.setControlValue(key, value);
	}

	private languageRow(): SettingDefinitionRender {
		return {
			name: this.L('settingsLanguage'),
			desc: this.L('settingsLanguageDesc'),
			render: (setting) => {
				setting
					.setName(this.L('settingsLanguage'))
					.setDesc(this.L('settingsLanguageDesc'))
					.addDropdown((dropdown) =>
						dropdown
							.addOption('ja', '日本語')
							.addOption('en', 'English')
							.setValue(this.plugin.settings.uiLanguage)
							.onChange(async (value) => {
								this.plugin.settings.uiLanguage = value as UiLanguage;
								await this.plugin.saveSettings();
								this.update();
								this.plugin.applyUiLanguage();
							}),
					);
			},
		};
	}

	private folderTextarea(
		nameKey: I18nKey,
		descKey: I18nKey,
		field: 'includeFolders' | 'excludeFolders',
	): SettingDefinitionRender {
		return {
			name: this.L(nameKey),
			desc: this.L(descKey),
			render: (setting) => {
				setting
					.setName(this.L(nameKey))
					.setDesc(this.L(descKey))
					.addTextArea((area) => {
						area
							.setValue(this.plugin.settings[field].join('\n'))
							.onChange(async (value) => {
								this.plugin.settings[field] = linesToList(value);
								this.plugin.onScopeOrCacheSettingsChanged();
								await this.plugin.saveSettings();
							});
						area.inputEl.rows = 4;
						area.inputEl.addClass('detailsearch-linker-textarea');
					});
			},
		};
	}

	private scopeModeRow(): SettingDefinitionRender {
		return {
			name: this.L('settingsScopeMode'),
			desc: this.L('settingsScopeModeDesc'),
			render: (setting) => {
				setting
					.setName(this.L('settingsScopeMode'))
					.setDesc(this.L('settingsScopeModeDesc'))
					.addDropdown((dropdown) =>
						dropdown
							.addOption('all', this.L('scopeAll'))
							.addOption('recent', this.L('scopeRecent'))
							.addOption('workset', this.L('scopeWorkset'))
							.addOption('recent-workset', this.L('scopeRecentWorkset'))
							.setValue(this.plugin.settings.scopeMode)
							.onChange(async (value) => {
								this.plugin.settings.scopeMode = value as ScopeMode;
								this.plugin.onScopeOrCacheSettingsChanged();
								await this.plugin.saveSettings();
							}),
					);
			},
		};
	}

	private cacheModeRow(): SettingDefinitionRender {
		return {
			name: this.L('settingsCacheMode'),
			desc: this.L('settingsCacheModeDesc'),
			render: (setting) => {
				setting
					.setName(this.L('settingsCacheMode'))
					.setDesc(this.L('settingsCacheModeDesc'))
					.addDropdown((dropdown) =>
						dropdown
							.addOption('persistent', this.L('cachePersistent'))
							.addOption('memory', this.L('cacheMemory'))
							.setValue(this.plugin.settings.cacheMode)
							.onChange(async (value) => {
								this.plugin.settings.cacheMode = value as CacheMode;
								this.plugin.onScopeOrCacheSettingsChanged();
								await this.plugin.saveSettings();
							}),
					);
			},
		};
	}

	private stopWordsRow(): SettingDefinitionRender {
		return {
			name: this.L('settingsAutoStopWords'),
			desc: this.L('settingsAutoStopWordsDesc'),
			render: (setting) => {
				setting
					.setName(this.L('settingsAutoStopWords'))
					.setDesc(this.L('settingsAutoStopWordsDesc'))
					.addTextArea((area) => {
						area
							.setValue(this.plugin.settings.autoStopWords.join('\n'))
							.onChange(async (value) => {
								this.plugin.settings.autoStopWords = value
									.split(/\r?\n/)
									.map((s) => s.trim())
									.filter(Boolean);
								await this.plugin.saveSettings();
							});
						area.inputEl.rows = 4;
						area.inputEl.addClass('detailsearch-linker-textarea');
					});
			},
		};
	}

	private ignoredTermsRow(): SettingDefinitionRender {
		return {
			name: this.L('settingsIgnoredTerms'),
			desc: this.L('settingsIgnoredTermsDesc'),
			render: (setting) => {
				setting
					.setName(this.L('settingsIgnoredTerms'))
					.setDesc(this.L('settingsIgnoredTermsDesc'))
					.addTextArea((area) => {
						area
							.setValue(this.plugin.settings.ignoredTerms.join('\n'))
							.onChange(async (value) => {
								this.plugin.settings.ignoredTerms = parseIgnoredTermsText(
									value,
									this.plugin.settings.caseSensitive,
								);
								await this.plugin.saveSettings();
							});
						area.inputEl.rows = 4;
						area.inputEl.addClass('detailsearch-linker-textarea');
					});
			},
		};
	}

	private cacheInfoRow(): SettingDefinitionRender {
		return {
			name: this.L('settingsCacheInfo'),
			desc: this.L('settingsCacheInfoDesc'),
			render: (setting) => {
				setting
					.setName(this.L('settingsCacheInfo'))
					.setDesc(
						this.plugin.formatCacheSizeDescription(),
					)
					.addButton((btn) =>
						btn.setButtonText(this.L('cmdClearCache')).onClick(() => {
							void this.plugin.clearCache(true);
							this.update();
						}),
					);
			},
		};
	}

	private toggleRow(nameKey: I18nKey, field: keyof DetailSearchLinkerSettings): SettingDefinitionRender {
		const descKey = `${nameKey}Desc` as I18nKey;
		return {
			name: this.L(nameKey),
			desc: this.L(descKey),
			render: (setting) => {
				setting
					.setName(this.L(nameKey))
					.setDesc(this.L(descKey))
					.addToggle((toggle) =>
						toggle
							.setValue(this.plugin.settings[field] as boolean)
							.onChange(async (value) => {
								(this.plugin.settings[field] as boolean) = value;
								await this.plugin.saveSettings();
								if (field === 'showBadge') {
									this.plugin.refreshHighlightAppearance();
								}
								if (field === 'caseSensitive') {
									this.plugin.onScopeOrCacheSettingsChanged();
								}
							}),
					);
			},
		};
	}

	private sliderRow(
		nameKey: I18nKey,
		descKey: I18nKey,
		field: keyof DetailSearchLinkerSettings,
		min: number,
		max: number,
		step: number,
		display?: (v: number) => string,
	): SettingDefinitionRender {
		return {
			name: this.L(nameKey),
			desc: this.L(descKey),
			render: (setting) => {
				setting
					.setName(this.L(nameKey))
					.setDesc(this.L(descKey))
					.addSlider((slider) =>
						slider
							.setLimits(min, max, step)
							.setValue(this.plugin.settings[field] as number)
							.onChange(async (value) => {
								(this.plugin.settings[field] as number) = value;
								await this.plugin.saveSettings();
							}),
					);
				if (display) {
					setting.descEl.setText(`${this.L(descKey)} (${display(this.plugin.settings[field] as number)})`);
				}
			},
		};
	}
}
