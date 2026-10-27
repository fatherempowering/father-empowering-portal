"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Native modal supplies inert background, focus containment and focus return. */
export function Modal({
  open,
  busy,
  onClose,
  labelledBy,
  describedBy,
  children,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="fe-dialog"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const dialog = event.currentTarget;
        const targets = Array.from(dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"]), summary',
        )).filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);
        const first = targets[0], last = targets.at(-1);
        if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
        // Native modal makes the background inert; keep keyboard cycling in
        // the task itself rather than letting Tab escape into browser chrome.
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
    >
      {open ? children : null}
    </dialog>
  );
}
