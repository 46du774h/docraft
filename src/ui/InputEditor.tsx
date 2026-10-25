import { forwardRef, useImperativeHandle, useRef } from 'react';

export interface EditorHandle {
  /** Inserts text at the caret/selection, like Ctrl+V. */
  insert: (text: string) => void;
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  label: string;
}

export const InputEditor = forwardRef<EditorHandle, Props>(function InputEditor({ value, onChange, placeholder, autoFocus, label }, ref) {
  const el = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => el.current?.focus(),
    insert: (text: string) => {
      const t = el.current;
      if (!t) return onChange(value + text);
      const start = t.selectionStart ?? value.length;
      const end = t.selectionEnd ?? value.length;
      onChange(value.slice(0, start) + text + value.slice(end));
      const caret = start + text.length;
      requestAnimationFrame(() => {
        t.focus();
        t.setSelectionRange(caret, caret);
      });
    },
  }));
  return (
    <textarea
      ref={el}
      className="editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      autoFocus={autoFocus}
      spellCheck={false}
      autoCapitalize="off"
      autoComplete="off"
    />
  );
});
