import type { FocusEvent } from "react";

/** Selecting the current number makes a new entry replace it instead of appending. */
export function selectNumericInputOnFocus(event: FocusEvent<HTMLElement>) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.disabled || input.readOnly) return;
  if (input.type === "number" || ((input.type === "text" || input.type === "tel") && ["numeric", "decimal"].includes(input.inputMode))) input.select();
}
