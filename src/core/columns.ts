import type { Run, TableBlock } from './types';

export function runsText(runs: Run[]): string {
  return runs.map((r) => (r.br ? '\n' : r.text)).join('');
}

/**
 * Computes column widths (in any unit) for a table so that:
 *  - widths sum to `available`
 *  - columns get space in proportion to their content
 *  - no column is narrower than its longest word when that is achievable
 */
export function computeColumnWidths(table: TableBlock, available: number, charWidth: number, padding: number): number[] {
  const n = table.columnCount;
  if (n === 0) return [];
  const rows = [table.header, ...table.rows];
  const desire: number[] = [];
  const wordMin: number[] = [];
  const comfortMin: number[] = [];
  for (let c = 0; c < n; c++) {
    let total = 0;
    let count = 0;
    let longestLine = 0;
    let longestWord = 0;
    for (const row of rows) {
      const text = runsText(row[c]?.runs ?? []);
      const lines = text.split('\n');
      let len = 0;
      for (const line of lines) {
        len = Math.max(len, line.length);
        for (const w of line.split(/\s+/)) longestWord = Math.max(longestWord, w.length);
      }
      total += len;
      count++;
      longestLine = Math.max(longestLine, len);
    }
    const avg = count ? total / count : 0;
    desire.push(Math.min(80, Math.max(4, 0.55 * avg + 0.45 * Math.min(longestLine, 80))));
    wordMin.push(Math.min(longestWord, 24) * charWidth + padding);
    comfortMin.push(Math.min(longestLine, 14) * charWidth + padding);
  }
  // Prefer a "comfortable" minimum (short values stay on one line) when everything fits;
  // otherwise fall back to the longest-word minimum.
  const minW = comfortMin.reduce((a, b) => a + b, 0) <= available * 0.85 ? comfortMin : wordMin;

  // If even the minimums do not fit, shrink them proportionally (long words will wrap/break).
  const minSum = minW.reduce((a, b) => a + b, 0);
  const mins = minSum > available ? minW.map((m) => (m * available) / minSum) : minW;

  const widths = new Array<number>(n).fill(0);
  const fixed = new Array<boolean>(n).fill(false);
  for (let iter = 0; iter < n + 1; iter++) {
    const freeIdx = widths.map((_, i) => i).filter((i) => !fixed[i]);
    const fixedSum = widths.reduce((a, w, i) => (fixed[i] ? a + w : a), 0);
    const remaining = available - fixedSum;
    const dSum = freeIdx.reduce((a, i) => a + desire[i], 0) || 1;
    let changed = false;
    for (const i of freeIdx) widths[i] = (remaining * desire[i]) / dSum;
    for (const i of freeIdx) {
      if (widths[i] < mins[i]) {
        widths[i] = mins[i];
        fixed[i] = true;
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Normalise to the exact available width.
  const sum = widths.reduce((a, b) => a + b, 0) || 1;
  return widths.map((w) => (w * available) / sum);
}

/** Rounds widths to integers whose sum is exactly `total`. */
export function roundToTotal(widths: number[], total: number): number[] {
  const rounded = widths.map((w) => Math.max(1, Math.floor(w)));
  let diff = total - rounded.reduce((a, b) => a + b, 0);
  let i = 0;
  while (diff !== 0 && widths.length) {
    const idx = i % widths.length;
    if (diff > 0) {
      rounded[idx]++;
      diff--;
    } else if (rounded[idx] > 1) {
      rounded[idx]--;
      diff++;
    }
    i++;
    if (i > widths.length * 50) break;
  }
  return rounded;
}
