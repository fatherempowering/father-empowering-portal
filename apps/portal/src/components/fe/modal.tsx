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
