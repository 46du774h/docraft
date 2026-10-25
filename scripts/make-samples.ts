import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from '../src/core/parser';
import { DEFAULT_SETTINGS, applyPreset } from '../src/core/settings';
import type { PresetId, Settings } from '../src/core/settings';
import { generate } from '../src/exporters';
import type { ExportFormat } from '../src/exporters';

const out = process.argv[2] ?? '/tmp/samples';
mkdirSync(out, { recursive: true });
const sample = readFileSync(new URL('../tests/fixtures/sample.md', import.meta.url), 'utf8');
const fontLoader = async (f: string) => readFileSync(new URL(`../public/fonts/${f}`, import.meta.url)).toString('base64');

const variants: [string, Settings][] = [
  ['professional', DEFAULT_SETTINGS],
  ['academic', { ...applyPreset(DEFAULT_SETTINGS, 'academic' as PresetId), pageSize: 'Letter', title: 'Sample Report' }],
  ['minimal-landscape', { ...applyPreset(DEFAULT_SETTINGS, 'minimal' as PresetId), orientation: 'landscape', pageNumbers: false }],
];
for (const [name, s] of variants) {
  const doc = parseDocument(sample);
  for (const f of ['docx', 'pdf', 'md'] as ExportFormat[]) {
    const r = await generate(f, doc, s, fontLoader);
    writeFileSync(join(out, `${name}.${f}`), r.data);
    console.log(name, r.filename, r.data.length, r.notes.join(' | '));
  }
}
