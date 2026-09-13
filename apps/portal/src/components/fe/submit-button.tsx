"use client";

import { useFormStatus } from "react-dom";
import { Icon } from "./icon";

export function SubmitButton({
  children,
  pendingLabel,
}: {
  children: React.ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className="fe-button fe-button-primary fe-button-wide"
      type="submit"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
      <Icon name="arrow" />
    </button>
  );
}
