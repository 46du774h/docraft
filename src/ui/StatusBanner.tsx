import type { Status } from './useConverter';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './icons';

export function StatusBanner({ status, onDismiss }: { status: Status; onDismiss: () => void }) {
  if (status.kind === 'idle' || status.kind === 'busy') return <div aria-live="polite" className="sr-only" />;
  const tone =
    status.kind === 'error'
      ? { box: 'border-red-800 bg-red-950 text-red-200', icon: <AlertIcon /> }
      : status.kind === 'success'
        ? { box: 'border-emerald-800 bg-emerald-950 text-emerald-200', icon: <CheckIcon /> }
        : { box: 'border-sky-800 bg-sky-950 text-sky-200', icon: <InfoIcon /> };
  return (
    <div role={status.kind === 'error' ? 'alert' : 'status'} className={`rise flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[12px] leading-snug ${tone.box}`}>
      <span className="mt-px shrink-0">{tone.icon}</span>
      <div className="min-w-0 flex-1">
        <p>{status.message}</p>
        {status.kind === 'success' && status.notes.map((n) => <p key={n} className="mt-1 text-amber-300">{n}</p>)}
      </div>
      <button type="button" className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100" onClick={onDismiss} aria-label="Dismiss message"><CloseIcon /></button>
    </div>
  );
}
