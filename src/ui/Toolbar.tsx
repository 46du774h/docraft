import { ClipboardIcon, TrashIcon } from './icons';

interface Props {
  onPaste: () => void;
  onClear: () => void;
  confirmClear: boolean;
  chars: number;
  words: number;
  hasText: boolean;
  compact?: boolean;
}

const fmt = (n: number) => n.toLocaleString('en-US');

export function Toolbar({ onPaste, onClear, confirmClear, chars, words, hasText, compact = false }: Props) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={compact ? 'btn-icon' : 'btn'} onClick={onPaste} title="Paste from clipboard" aria-label="Paste from clipboard"><ClipboardIcon />{!compact && 'Paste'}</button>
      <button
        type="button"
        className={confirmClear ? 'btn !border-red-800 !bg-red-950 !text-red-200' : compact ? 'btn-icon' : 'btn-quiet'}
        onClick={onClear}
        disabled={!hasText}
        aria-live="polite"
        title={confirmClear ? 'Click again to clear' : 'Clear'}
        aria-label={confirmClear ? 'Click again to clear' : 'Clear'}
      >
        <TrashIcon />{!compact && (confirmClear ? 'Click again to clear' : 'Clear')}
      </button>
      <p className={`${compact ? 'ml-auto' : 'ml-auto'} text-right text-[11.5px] tabular-nums text-ink-500`} aria-live="off">
        {fmt(words)} {words === 1 ? 'word' : 'words'}, {fmt(chars)} {chars === 1 ? 'character' : 'characters'}
      </p>
    </div>
  );
}
