"use client";

import { useEffect, useId, useRef } from "react";
import styles from "./wheel-picker.module.css";

const ROW_HEIGHT = 44;

/** Native touch scrolling + snapping, with equivalent click and keyboard controls. */
export function WheelPicker({ label, values, value, onChange, emptyLabel, disabled = false, required = false, format = String }: {
  label: string;
  values: readonly number[];
  value: number | null;
  onChange(value: number | null): void;
  emptyLabel: string;
  disabled?: boolean;
  required?: boolean;
  format?(value: number): string;
}) {
  const id = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interacting = useRef(false);
  const index = value === null ? 0 : Math.max(0, values.indexOf(value) + 1);
  const selectedIndex = useRef(index);
  const changed = useRef(onChange);
  changed.current = onChange;
  selectedIndex.current = index;

  useEffect(() => {
    if (!interacting.current && viewport.current) viewport.current.scrollTop = index * ROW_HEIGHT;
  }, [index]);
  const rangeKey = `${values.length}:${values[0]}:${values.at(-1)}`;
  useEffect(() => {
    interacting.current = false;
    if (timer.current) clearTimeout(timer.current);
    if (viewport.current) viewport.current.scrollTop = selectedIndex.current * ROW_HEIGHT;
  }, [disabled, rangeKey]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function choose(next: number) {
    if (disabled || next < 0 || next > values.length) return;
    if (timer.current) clearTimeout(timer.current);
    interacting.current = false;
    if (viewport.current) viewport.current.scrollTop = next * ROW_HEIGHT;
    changed.current(next === 0 ? null : values[next - 1]);
  }

  return <div className={styles.picker}>
    <span id={`${id}-label`} className={styles.label}>{label}</span>
    <div className={styles.frame}>
      <div className={styles.highlight} aria-hidden="true" />
      <div ref={viewport} className={styles.viewport} role="listbox" aria-labelledby={`${id}-label`}
        aria-activedescendant={`${id}-${index}`} aria-disabled={disabled || undefined} aria-required={required || undefined} tabIndex={disabled ? -1 : 0}
        onPointerDown={() => { if (!disabled) interacting.current = true; }}
        onWheel={() => { if (!disabled) interacting.current = true; }}
        onScroll={() => {
          if (disabled || !interacting.current) return;
          if (timer.current) clearTimeout(timer.current);
          const next = Math.max(0, Math.min(values.length, Math.round((viewport.current?.scrollTop ?? 0) / ROW_HEIGHT)));
          // Publish during the scroll event: navigation or Save must never lose
          // the visible answer while waiting for a delayed scroll-end callback.
          if (next !== selectedIndex.current) {
            selectedIndex.current = next;
            changed.current(next === 0 ? null : values[next - 1]);
          }
          timer.current = setTimeout(() => {
            interacting.current = false;
            if (viewport.current) viewport.current.scrollTop = selectedIndex.current * ROW_HEIGHT;
          }, 160);
        }}
        onKeyDown={(event) => {
          const next = event.key === "ArrowDown" ? Math.min(values.length, index + 1)
            : event.key === "ArrowUp" ? Math.max(0, index - 1)
              : event.key === "Home" ? 1 : event.key === "End" ? values.length
                : event.key === "Delete" || event.key === "Backspace" ? 0 : null;
          if (next !== null) { event.preventDefault(); choose(next); }
        }}>
        {[null, ...values].map((option, row) => <div key={row} id={`${id}-${row}`} role="option"
          aria-selected={row === index} className={`${styles.option} ${row === index ? styles.selected : ""}`}
          onClick={() => choose(row)}>{option === null ? emptyLabel : format(option)}</div>)}
      </div>
    </div>
  </div>;
}
