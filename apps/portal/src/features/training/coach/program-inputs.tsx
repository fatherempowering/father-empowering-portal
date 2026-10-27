"use client";

import { useLayoutEffect, useRef, type FocusEvent, type InputHTMLAttributes } from "react";

export function selectProgramInput(event: FocusEvent<HTMLInputElement>) {
  event.currentTarget.select();
}

export function ProgramNumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} type="number" onFocus={(event) => { selectProgramInput(event); props.onFocus?.(event); }} />;
}

/** Only a bare three/four-digit tempo is expanded; pasted/custom notation stays intact. */
export function formatProgramTempo(value: string) {
  return /^\d{3,4}$/.test(value) ? value.split("").join("-") : value;
}

export function ProgramTempoInput({ value, change, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: string; change: (value: string) => void }) {
  const pasted = useRef(false);
  const pendingCaret = useRef<{ input: HTMLInputElement; value: string; position: number } | null>(null);
  useLayoutEffect(() => {
    const caret = pendingCaret.current; pendingCaret.current = null;
    // Restore only the selection associated with this React commit, before
    // another interaction. A deferred animation frame can overwrite select-all.
    if (caret && window.document.activeElement === caret.input && caret.input.value === caret.value) {
      caret.input.setSelectionRange(caret.position, caret.position);
    }
  });
  return <input {...props} value={value} maxLength={40} placeholder="2-2-2" onFocus={(event) => { pendingCaret.current = null; selectProgramInput(event); props.onFocus?.(event); }}
    onSelect={(event) => { pendingCaret.current = null; props.onSelect?.(event); }}
    onPaste={(event) => { pendingCaret.current = null; pasted.current = true; props.onPaste?.(event); }}
    onChange={(event) => {
      pendingCaret.current = null;
      const input = event.currentTarget; const raw = input.value;
      const inputType = (event.nativeEvent as InputEvent).inputType ?? "";
      const isPaste = pasted.current || inputType === "insertFromPaste"; pasted.current = false;
      // Existing/custom notation and deletions are never rewritten. Simple digit
      // entry gets separators immediately; explicit pasted notation is preserved.
      const canFormat = !inputType.startsWith("delete") && /^\d(?:-?\d){0,3}$/.test(raw) && (!isPaste || /^\d{1,4}$/.test(raw));
      const next = canFormat ? raw.replaceAll("-", "").split("").join("-") : raw;
      const digitsBeforeCaret = raw.slice(0, input.selectionStart ?? raw.length).replaceAll("-", "").length;
      if (next !== raw) pendingCaret.current = { input, value: next, position: Math.max(0, digitsBeforeCaret * 2 - 1) };
      change(next);
    }}
    onBlur={(event) => { pendingCaret.current = null; pasted.current = false; const formatted = formatProgramTempo(event.target.value); if (formatted !== event.target.value) change(formatted); props.onBlur?.(event); }} />;
}
