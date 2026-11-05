import { FONT_FAMILIES, FONT_SIZES, PRESETS } from '../core/settings';
import type { PresetId, Settings } from '../core/settings';

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  choosePreset: (p: PresetId) => void;
}

export function PresetPicker({ value, onChange }: { value: PresetId; onChange: (p: PresetId) => void }) {
  return (
    <div role="radiogroup" aria-label="Formatting style" className="grid grid-cols-3 gap-1 rounded-lg bg-ink-100 p-1">
      {(Object.keys(PRESETS) as PresetId[]).map((id) => {
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            title={PRESETS[id].description}
            onClick={() => onChange(id)}
            className={`rounded-md px-2 py-1 text-[12px] font-medium transition-colors ${on ? 'bg-ink-300 text-ink-900 shadow-sm' : 'text-ink-600 hover:text-ink-900'}`}
          >
            {PRESETS[id].label}
          </button>
        );
      })}
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-ink-100 p-1">
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
            className={`rounded-md px-2 py-1 text-[12px] font-medium transition-colors ${value === o.value ? 'bg-ink-300 text-ink-900 shadow-sm' : 'text-ink-600 hover:text-ink-900'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsPanel({ settings: s, update, choosePreset }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <span className="label">Style</span>
        <PresetPicker value={s.preset} onChange={choosePreset} />
        <p className="mt-1.5 text-[11.5px] text-ink-500">{PRESETS[s.preset].description}. Choosing a style sets the font, size and margins below; you can change them afterwards.</p>
      </div>

      <div>
        <label className="label" htmlFor="doc-title">Document title (optional)</label>
        <input id="doc-title" className="field" value={s.title} maxLength={200} placeholder="Shown at the top and used as the file name" onChange={(e) => update({ title: e.target.value })} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="font-family">Font</label>
          <select id="font-family" className="field" value={s.fontFamily} onChange={(e) => update({ fontFamily: e.target.value as Settings['fontFamily'] })}>
            {FONT_FAMILIES.map((f) => <option key={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="font-size">Size</label>
          <select id="font-size" className="field" value={s.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })}>
            {FONT_SIZES.map((n) => <option key={n} value={n}>{n} pt</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="page-size">Page size</label>
          <select id="page-size" className="field" value={s.pageSize} onChange={(e) => update({ pageSize: e.target.value as Settings['pageSize'] })}>
            <option value="A4">A4</option><option value="Letter">Letter</option><option value="Legal">Legal</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="margins">Margins</label>
          <select id="margins" className="field" value={s.margins} onChange={(e) => update({ margins: e.target.value as Settings['margins'] })}>
            <option value="narrow">Narrow (0.5 in)</option><option value="normal">Normal (1 in)</option><option value="wide">Wide (1.25 in)</option>
          </select>
        </div>
      </div>

      <Seg label="Orientation" value={s.orientation} onChange={(v) => update({ orientation: v })} options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} />

      <Seg label="Document appearance" value={s.documentTheme} onChange={(v) => update({ documentTheme: v })} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />

      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" className="h-4 w-4 rounded border-ink-300" checked={s.pageNumbers} onChange={(e) => update({ pageNumbers: e.target.checked })} />
        Page numbers
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" className="h-4 w-4 rounded border-ink-300" checked={s.includeTableOfContents} onChange={(e) => update({ includeTableOfContents: e.target.checked })} />
        Include a table of contents
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" className="h-4 w-4 rounded border-ink-300" checked={s.multiplePaste} onChange={(e) => update({ multiplePaste: e.target.checked })} />
        Enable multiple pastes and ZIP export
      </label>
      <p className="-mt-2 text-[11.5px] text-ink-500">Font, size, page and margin options apply to Word and PDF.</p>

      <div className="border-t border-ink-200 pt-3">
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-ink-300" checked={s.rememberDraft} onChange={(e) => update({ rememberDraft: e.target.checked })} />
          <span>
            Remember my draft
            <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-500">Off by default. When on, your text is saved unencrypted in this Chrome profile (chrome.storage.local) so it survives closing the popup. Turning it off deletes the saved draft.</span>
          </span>
        </label>
      </div>
    </div>
  );
}
