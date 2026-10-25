import type { ExportFormat } from '../exporters';

const base = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export const ClipboardIcon = () => (<svg {...base}><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" /></svg>);
export const TrashIcon = () => (<svg {...base}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>);
export const EyeIcon = () => (<svg {...base}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>);
export const ExpandIcon = () => (<svg {...base}><path d="M14 4h6v6M20 4l-8 8M10 20H4v-6M4 20l8-8" /></svg>);
export const CheckIcon = () => (<svg {...base}><path d="M5 12l5 5 9-10" /></svg>);
export const AlertIcon = () => (<svg {...base}><path d="M12 3l10 18H2L12 3zM12 10v5M12 18h.01" /></svg>);
export const InfoIcon = () => (<svg {...base}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>);
export const CloseIcon = () => (<svg {...base}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const Spinner = () => (<svg {...base} className="spin"><path d="M12 3a9 9 0 1 0 9 9" /></svg>);

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#1E3A5F" />
      <rect x="8" y="5.5" width="14" height="19" rx="1.8" fill="#fff" />
      <rect x="10" y="9" width="9" height="1.6" rx=".8" fill="#94A3B8" />
      <rect x="10" y="12.2" width="9" height="1.6" rx=".8" fill="#94A3B8" />
      <rect x="10" y="15.4" width="6" height="1.6" rx=".8" fill="#94A3B8" />
      <circle cx="22" cy="22.5" r="6" fill="#38BDF8" />
      <path d="M22 19.5v5M19.6 22.6l2.4 2.4 2.4-2.4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

const FILE_META: Record<ExportFormat, { color: string; mark: string }> = {
  docx: { color: '#2B579A', mark: 'W' },
  pdf: { color: '#D93025', mark: 'PDF' },
  md: { color: '#475569', mark: 'M↓' },
};

/** Small file-type badge (page with a folded corner and a format mark). */
export function FileIcon({ kind, size = 28 }: { kind: ExportFormat; size?: number }) {
  const { color, mark } = FILE_META[kind];
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <path d="M6 2h11l6 6v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#fff" stroke="#CBD2DC" />
      <path d="M17 2v4a2 2 0 0 0 2 2h4" fill="#EEF0F4" stroke="#CBD2DC" />
      <rect x="2" y="12.5" width="18" height="9" rx="2" fill={color} />
      <text x="11" y="19.4" textAnchor="middle" fontSize={mark.length > 2 ? 6.2 : 7.4} fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">{mark}</text>
    </svg>
  );
}
