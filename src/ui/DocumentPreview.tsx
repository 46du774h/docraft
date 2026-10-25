import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { computeColumnWidths } from '../core/columns';
import { pageGeometry, tableFontSize, themeFor } from '../core/settings';
import type { Settings } from '../core/settings';
import type { Block, ListBlock, ParsedDocument, Run, TableBlock } from '../core/types';

const PX = 96 / 72; // CSS px per pt

const FONT_STACKS: Record<string, string> = {
  Calibri: "Carlito, Calibri, 'Segoe UI', Roboto, Arial, sans-serif",
  Arial: "Arial, 'Liberation Sans', Helvetica, sans-serif",
  'Times New Roman': "'Times New Roman', 'Liberation Serif', Times, serif",
  Georgia: "Georgia, 'DejaVu Serif', serif",
  Cambria: "Cambria, Caladea, Georgia, serif",
};

/** Renders runs as React elements only — no innerHTML anywhere, so pasted markup can never execute. */
function Runs({ runs, linkColor, codeFill }: { runs: Run[]; linkColor: string; codeFill: string }) {
  return (
    <>
      {runs.map((r, i) => {
        if (r.br) return <br key={i} />;
        let node: ReactNode = r.text;
        if (r.code) node = <code style={{ fontFamily: "Consolas, 'DejaVu Sans Mono', monospace", fontSize: '0.9em', background: `#${codeFill}`, padding: '0 3px', borderRadius: 3 }}>{node}</code>;
        if (r.strike) node = <s>{node}</s>;
        if (r.italic) node = <em>{node}</em>;
        if (r.bold) node = <strong>{node}</strong>;
        if (r.href) node = <a href={r.href} target="_blank" rel="noopener noreferrer" style={{ color: `#${linkColor}`, textDecoration: 'underline' }}>{node}</a>;
        return <Fragment key={i}>{node}</Fragment>;
      })}
    </>
  );
}

export function DocumentPreview({ doc, settings }: { doc: ParsedDocument; settings: Settings }) {
  const theme = themeFor(settings);
  const geo = pageGeometry(settings);
  const pageW = geo.widthPt * PX;
  const pageH = geo.heightPt * PX;
  const margin = geo.marginPt * PX;
  const fs = settings.fontSize * PX;

  const wrapRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pages, setPages] = useState(1);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, Math.max(0.3, (el.clientWidth - 32) / pageW))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageW]);

  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const measure = () => setPages(Math.max(1, Math.ceil(el.scrollHeight / pageH - 0.02)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageH, doc, settings]);

  const rc = { linkColor: theme.linkColor, codeFill: theme.codeFill };
  const textStyle = { color: `#${theme.bodyColor}`, lineHeight: theme.lineHeight };
  const para = { margin: `0 0 ${theme.paragraphAfterPt * PX}px`, textAlign: theme.justify ? ('justify' as const) : ('left' as const) };

  const render = (b: Block, key: number, listDepth = 0): ReactNode => {
    switch (b.type) {
      case 'heading': {
        const i = b.level - 1;
        const Tag = `h${b.level}` as 'h1';
        return (
          <Tag key={key} style={{ fontSize: fs * theme.headingScale[i], color: `#${theme.headingColor}`, fontWeight: 700, lineHeight: 1.25, margin: `${[2, 16, 14, 12, 10, 10][i] * PX}px 0 ${[8, 6, 4, 4, 4, 4][i] * PX}px`, textAlign: i === 0 ? theme.h1Align : 'left', borderBottom: i === 0 && theme.h1Rule ? `1px solid #${theme.tableBorder}` : undefined, paddingBottom: i === 0 && theme.h1Rule ? 4 : 0 }}>
            <Runs runs={b.runs} {...rc} />
          </Tag>
        );
      }
      case 'paragraph':
        return <p key={key} style={{ ...para, marginTop: b.qa === 'question' ? 6 * PX : 0 }}><Runs runs={b.runs} {...rc} /></p>;
      case 'list':
        return <PreviewList key={key} list={b} depth={listDepth} render={render} rc={rc} gap={theme.paragraphAfterPt * PX} />;
      case 'blockquote':
        return (
          <blockquote key={key} style={{ margin: `0 0 ${theme.paragraphAfterPt * PX}px`, padding: '4px 12px', borderLeft: `3px solid #${theme.quoteBar}`, background: `#${theme.quoteFill}`, color: `#${theme.quoteColor}`, fontStyle: 'italic' }}>
            {b.blocks.map((x, i) => render(x, i, listDepth))}
          </blockquote>
        );
      case 'code':
        return (
          <pre key={key} style={{ margin: `0 0 ${theme.paragraphAfterPt * PX}px`, padding: '8px 10px', background: `#${theme.codeFill}`, color: `#${theme.codeColor}`, fontFamily: "Consolas, 'DejaVu Sans Mono', monospace", fontSize: Math.max(8, settings.fontSize - 1.5) * PX, lineHeight: 1.35, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {b.text}
          </pre>
        );
      case 'hr':
        return <hr key={key} style={{ border: 0, borderTop: `1px solid #${theme.tableBorder}`, margin: `${8 * PX}px 0 ${10 * PX}px` }} />;
      case 'table':
        return <PreviewTable key={key} t={b} settings={settings} rc={rc} />;
    }
  };

  return (
    <div ref={wrapRef} className="h-full overflow-auto bg-ink-100 p-4" aria-label="Document preview">
      {doc.blocks.length === 0 && !settings.title.trim() ? (
        <div className="grid h-full min-h-[240px] place-items-center text-center text-[13px] text-ink-500">
          <p>The preview appears here as you paste.<br />It shows how Word and PDF exports will look.</p>
        </div>
      ) : (
        <div style={{ zoom: scale, width: pageW, margin: '0 auto' }}>
          <div
            ref={pageRef}
            style={{
              position: 'relative', width: pageW, minHeight: pageH, boxSizing: 'border-box', padding: margin,
              background: `#${theme.pageFill}`, boxShadow: '0 1px 3px rgba(16,24,40,.18), 0 8px 24px rgba(16,24,40,.08)',
              fontFamily: FONT_STACKS[settings.fontFamily], fontSize: fs, ...textStyle, overflowWrap: 'anywhere',
              backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0) calc(100% - 1px), rgba(100,116,139,.45) calc(100% - 1px))',
              backgroundSize: `100% ${pageH}px`, backgroundRepeat: 'repeat-y',
            }}
          >
            {settings.title.trim() && (
              <h1 style={{ fontSize: fs * (theme.headingScale[0] + 0.3), color: `#${theme.headingColor}`, textAlign: theme.h1Align, margin: `0 0 ${14 * PX}px`, lineHeight: 1.2 }}>{settings.title.trim()}</h1>
            )}
            {doc.blocks.map((b, i) => render(b, i))}
            {Array.from({ length: pages - 1 }, (_, i) => (
              <div key={i} aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: (i + 1) * pageH, pointerEvents: 'none' }}>
                <span style={{ position: 'absolute', right: 8, top: 4, fontSize: 10, fontFamily: 'system-ui, sans-serif', color: '#64748b', background: 'rgba(255,255,255,.85)', padding: '0 4px', borderRadius: 3 }}>Page {i + 2}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {doc.blocks.length > 0 && (
        <p className="mx-auto mt-3 max-w-md text-center text-[11.5px] leading-snug text-ink-500">
          Approximate preview: page breaks are estimates, and Word substitutes fonts if yours isn’t installed. PDF uses embedded Roboto / DejaVu Serif, so its letterforms differ slightly. Download to see the exact result.
        </p>
      )}
    </div>
  );
}

function PreviewList({ list, depth, render, rc, gap }: { list: ListBlock; depth: number; render: (b: Block, k: number, d?: number) => ReactNode; rc: { linkColor: string; codeFill: string }; gap: number }) {
  const Tag = list.ordered ? 'ol' : 'ul';
  const type = list.ordered ? (['decimal', 'lower-alpha', 'lower-roman'] as const)[depth % 3] : (['disc', 'circle', 'square'] as const)[depth % 3];
  return (
    <Tag start={list.ordered ? list.start : undefined} style={{ margin: `0 0 ${depth === 0 ? gap : 2}px`, paddingLeft: 24, listStyleType: type }}>
      {list.items.map((it, i) => (
        <li key={i} style={{ marginBottom: 2 }}>
          <Runs runs={it.runs} {...rc} />
          {it.children.map((c, j) => render(c, j, depth + 1))}
        </li>
      ))}
    </Tag>
  );
}

function PreviewTable({ t, settings, rc }: { t: TableBlock; settings: Settings; rc: { linkColor: string; codeFill: string } }) {
  const theme = themeFor(settings);
  const geo = pageGeometry(settings);
  const n = t.columnCount;
  if (n === 0) return null;
  const sizePt = tableFontSize(settings.fontSize, n);
  const widths = computeColumnWidths(t, geo.contentWidthPt, sizePt * 0.6, 12).map((w) => (w / geo.contentWidthPt) * 100);
  const cellStyle = (c: number, header: boolean) => ({
    border: `1px solid #${theme.tableBorder}`, padding: `${3.5 * PX}px ${6 * PX}px`, verticalAlign: 'top' as const,
    textAlign: t.align[c] ?? ('left' as const), fontSize: sizePt * PX, lineHeight: 1.3,
    ...(header ? { background: `#${theme.tableHeaderFill}`, color: `#${theme.tableHeaderColor}`, fontWeight: 700 } : {}),
  });
  return (
    <div style={{ margin: `2px 0 ${(theme.paragraphAfterPt + 2) * PX}px` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>{widths.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
        <thead>
          <tr>{t.header.map((c, i) => <th key={i} style={cellStyle(i, true)}><Runs runs={c.runs} {...rc} /></th>)}</tr>
        </thead>
        <tbody>
          {t.rows.map((r, ri) => (
            <tr key={ri} style={theme.tableZebra && ri % 2 === 1 ? { background: `#${theme.tableZebra}` } : undefined}>
              {r.map((c, i) => <td key={i} style={cellStyle(i, false)}><Runs runs={c.runs} {...rc} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
