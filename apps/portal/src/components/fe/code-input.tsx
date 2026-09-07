"use client";

import { useId, useRef } from "react";

export function CodeInput({
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  invalid = false,
  label = "Code à 6 chiffres",
  locale = "fr",
  name = "otp",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  label?: string;
  locale?: "fr" | "en";
  name?: string;
}) {
  const id = useId();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  // Preserve empty middle cells while editing: the submitted value is accepted
  // only when all six slots contain digits. Never parse a code as a number.
  const slots = Array.from({ length: 6 }, (_, i) =>
    /\d/.test(value[i] ?? "") ? value[i] : "",
  );
  const changeSlots = (next: string[]) =>
    onChange(next.map((digit) => digit || " ").join(""));
  function insert(raw: string, index: number) {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    if (!digits) {
      const next = [...slots];
      next[index] = "";
      changeSlots(next);
      return;
    }
    const start = digits.length === 6 ? 0 : index;
    const next = [...slots];
    Array.from(digits).forEach((digit, offset) => {
      if (start + offset < 6) next[start + offset] = digit;
    });
    changeSlots(next);
    refs.current[Math.min(start + digits.length, 5)]?.focus();
  }
  return (
    <fieldset className="fe-code-field" disabled={disabled}>
      <legend id={`${id}-label`}>{label}</legend>
      <div className="fe-code-inputs" aria-describedby={`${id}-hint`}>
        {slots.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            aria-label={
              locale === "fr"
                ? `Chiffre ${index + 1} sur 6`
                : `Digit ${index + 1} of 6`
            }
            aria-invalid={invalid || undefined}
            aria-describedby={`${id}-hint`}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            autoFocus={autoFocus && index === 0}
            maxLength={6}
            value={digit}
            required
            pattern="[0-9]"
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => insert(event.target.value, index)}
            onPaste={(event) => {
              event.preventDefault();
              insert(event.clipboardData.getData("text"), index);
            }}
            onKeyDown={(event) => {
              if (
                /^\d$/.test(event.key) &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.altKey
              ) {
                event.preventDefault();
                insert(event.key, index);
              } else if (event.key === "Backspace") {
                event.preventDefault();
                const target = digit ? index : Math.max(0, index - 1);
                const next = [...slots];
                next[target] = "";
                changeSlots(next);
                refs.current[target]?.focus();
              } else if (
                event.key === "ArrowLeft" ||
                event.key === "ArrowRight"
              ) {
                event.preventDefault();
                refs.current[
                  Math.max(
                    0,
                    Math.min(5, index + (event.key === "ArrowLeft" ? -1 : 1)),
                  )
                ]?.focus();
              }
            }}
          />
        ))}
      </div>
      <input type="hidden" name={name} value={value} />
      <p className="fe-hint" id={`${id}-hint`}>
        {locale === "fr"
          ? "Tu peux aussi coller le code complet."
          : "You can also paste the entire code."}
      </p>
    </fieldset>
  );
}
