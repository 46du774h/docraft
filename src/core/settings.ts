export type PresetId = 'professional' | 'academic' | 'minimal';
export type PageSizeId = 'A4' | 'Letter' | 'Legal';
export type MarginId = 'narrow' | 'normal' | 'wide';
export type DocumentThemeId = 'light' | 'dark';

export const FONT_FAMILIES = ['Calibri', 'Arial', 'Times New Roman', 'Georgia', 'Cambria'] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];
export const FONT_SIZES = [9, 10, 10.5, 11, 12, 13, 14] as const;

export interface Settings {
  preset: PresetId;
  fontFamily: FontFamily;
  fontSize: number;
  pageSize: PageSizeId;
  orientation: 'portrait' | 'landscape';
  margins: MarginId;
  documentTheme: DocumentThemeId;
  title: string;
  pageNumbers: boolean;
  includeTableOfContents: boolean;
  multiplePaste: boolean;
  /** Opt-in: keep the pasted text in chrome.storage.local so it survives closing the popup. */
  rememberDraft: boolean;
}

export interface Theme {
  headingColor: string;
  bodyColor: string;
  /** Multipliers of body font size for h1..h6 */
  headingScale: [number, number, number, number, number, number];
  lineHeight: number;
  paragraphAfterPt: number;
  h1Align: 'left' | 'center';
  h1Rule: boolean;
  justify: boolean;
  tableHeaderFill: string;
  tableHeaderColor: string;
  tableBorder: string;
  tableZebra: string | null;
  codeFill: string;
  codeColor: string;
  linkColor: string;
  quoteBar: string;
  quoteFill: string;
  quoteColor: string;
  pageFill: string;
  pageText: string;
}

interface PresetDef {
  label: string;
  description: string;
  defaults: Pick<Settings, 'fontFamily' | 'fontSize' | 'margins'>;
  theme: Theme;
}

export const PRESETS: Record<PresetId, PresetDef> = {
  professional: {
    label: 'Professional',
    description: 'Polished reports and technical notes',
    defaults: { fontFamily: 'Calibri', fontSize: 11, margins: 'normal' },
    theme: {
      headingColor: '1F3A5F',
      bodyColor: '1F2937',
      headingScale: [2.0, 1.5, 1.2, 1.08, 1, 1],
      lineHeight: 1.2,
      paragraphAfterPt: 8,
      h1Align: 'left',
      h1Rule: true,
      justify: false,
      tableHeaderFill: '1F3A5F',
      tableHeaderColor: 'FFFFFF',
      tableBorder: 'B8C2D2',
      tableZebra: 'F4F6FA',
      codeFill: 'F1F4F8',
      codeColor: '1F2937',
      linkColor: '1D4ED8',
      quoteBar: '8EA3C4',
      quoteFill: 'F4F6FA',
      quoteColor: '374151',
      pageFill: 'FFFFFF',
      pageText: '1F2937',
    },
  },
  academic: {
    label: 'Academic',
    description: 'Formal headings and generous spacing',
    defaults: { fontFamily: 'Times New Roman', fontSize: 12, margins: 'normal' },
    theme: {
      headingColor: '000000',
      bodyColor: '000000',
      headingScale: [1.5, 1.25, 1.1, 1, 1, 1],
      lineHeight: 1.5,
      paragraphAfterPt: 6,
      h1Align: 'center',
      h1Rule: false,
      justify: true,
      tableHeaderFill: 'E5E7EB',
      tableHeaderColor: '000000',
      tableBorder: '4B5563',
      tableZebra: null,
      codeFill: 'F3F4F6',
      codeColor: '000000',
      linkColor: '1D4ED8',
      quoteBar: '6B7280',
      quoteFill: 'FFFFFF',
      quoteColor: '111827',
      pageFill: 'FFFFFF',
      pageText: '000000',
    },
  },
  minimal: {
    label: 'Minimal',
    description: 'Simple typography, understated styling',
    defaults: { fontFamily: 'Arial', fontSize: 10.5, margins: 'normal' },
    theme: {
      headingColor: '111827',
      bodyColor: '1F2937',
      headingScale: [1.7, 1.35, 1.15, 1.05, 1, 1],
      lineHeight: 1.3,
      paragraphAfterPt: 8,
      h1Align: 'left',
      h1Rule: false,
      justify: false,
      tableHeaderFill: 'F3F4F6',
      tableHeaderColor: '111827',
      tableBorder: 'D1D5DB',
      tableZebra: null,
      codeFill: 'F3F4F6',
      codeColor: '1F2937',
      linkColor: '2563EB',
      quoteBar: 'D1D5DB',
      quoteFill: 'FFFFFF',
      quoteColor: '4B5563',
      pageFill: 'FFFFFF',
      pageText: '1F2937',
    },
  },
};

export const DEFAULT_SETTINGS: Settings = {
  preset: 'professional',
  ...PRESETS.professional.defaults,
  pageSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  documentTheme: 'light',
  title: '',
  pageNumbers: true,
  includeTableOfContents: false,
  multiplePaste: false,
  rememberDraft: false,
};

export function applyPreset(current: Settings, preset: PresetId): Settings {
  return { ...current, preset, ...PRESETS[preset].defaults };
}

export function themeFor(s: Settings): Theme {
  const theme = PRESETS[s.preset].theme;
  if (s.documentTheme === 'light') return theme;
  return {
    ...theme,
    headingColor: 'FFFFFF',
    bodyColor: 'FFFFFF',
    tableHeaderFill: '2A2A2A',
    tableHeaderColor: 'FFFFFF',
    tableBorder: '666666',
    tableZebra: '292929',
    codeFill: '151515',
    codeColor: 'FFFFFF',
    linkColor: '93C5FD',
    quoteBar: '9CA3AF',
    quoteFill: '292929',
    quoteColor: 'FFFFFF',
    pageFill: '1E1E1E',
    pageText: 'FFFFFF',
  };
}

/** Normalises persisted/unknown data into a valid Settings object. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d };
  const r = raw as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fb;
  const size = typeof r.fontSize === 'number' && r.fontSize >= 6 && r.fontSize <= 24 ? r.fontSize : d.fontSize;
  return {
    preset: pick(r.preset, ['professional', 'academic', 'minimal'] as const, d.preset),
    fontFamily: pick(r.fontFamily, FONT_FAMILIES, d.fontFamily),
    fontSize: size,
    pageSize: pick(r.pageSize, ['A4', 'Letter', 'Legal'] as const, d.pageSize),
    orientation: pick(r.orientation, ['portrait', 'landscape'] as const, d.orientation),
    margins: pick(r.margins, ['narrow', 'normal', 'wide'] as const, d.margins),
    documentTheme: pick(r.documentTheme, ['light', 'dark'] as const, d.documentTheme),
    title: typeof r.title === 'string' ? r.title.slice(0, 200) : '',
    pageNumbers: typeof r.pageNumbers === 'boolean' ? r.pageNumbers : d.pageNumbers,
    includeTableOfContents: typeof r.includeTableOfContents === 'boolean' ? r.includeTableOfContents : d.includeTableOfContents,
    multiplePaste: typeof r.multiplePaste === 'boolean' ? r.multiplePaste : d.multiplePaste,
    rememberDraft: typeof r.rememberDraft === 'boolean' ? r.rememberDraft : d.rememberDraft,
  };
}

const PAGE_PT: Record<PageSizeId, { w: number; h: number }> = {
  A4: { w: 595.28, h: 841.89 },
  Letter: { w: 612, h: 792 },
  Legal: { w: 612, h: 1008 },
};
/** Portrait size in twips (1/20 pt) as used by Word. */
export const PAGE_TWIPS: Record<PageSizeId, { w: number; h: number }> = {
  A4: { w: 11906, h: 16838 },
  Letter: { w: 12240, h: 15840 },
  Legal: { w: 12240, h: 20160 },
};
const MARGIN_PT: Record<MarginId, number> = { narrow: 36, normal: 72, wide: 90 };

export interface PageGeometry {
  widthPt: number;
  heightPt: number;
  marginPt: number;
  contentWidthPt: number;
  contentHeightPt: number;
}

export function pageGeometry(s: Settings): PageGeometry {
  const base = PAGE_PT[s.pageSize];
  const land = s.orientation === 'landscape';
  const widthPt = land ? base.h : base.w;
  const heightPt = land ? base.w : base.h;
  const marginPt = MARGIN_PT[s.margins];
  return {
    widthPt,
    heightPt,
    marginPt,
    contentWidthPt: widthPt - marginPt * 2,
    contentHeightPt: heightPt - marginPt * 2,
  };
}

/** Which embedded PDF font family a Word font name maps to. */
export function pdfFontGroup(f: FontFamily): 'sans' | 'serif' {
  return f === 'Calibri' || f === 'Arial' ? 'sans' : 'serif';
}

/** Table body font size relative to body, scaled down for many columns. */
export function tableFontSize(bodyPt: number, columns: number): number {
  if (columns >= 9) return Math.max(6.5, bodyPt - 4);
  if (columns >= 7) return Math.max(7, bodyPt - 3);
  if (columns >= 5) return Math.max(8, bodyPt - 1.5);
  return Math.max(8, bodyPt - 0.5);
}
