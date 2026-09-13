import type { ReactNode } from "react";
import { Icon } from "./icon";

export function Feedback({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success" | "info";
}) {
  return (
    <div
      className={`fe-feedback fe-feedback-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon
        name={
          tone === "success" ? "check" : tone === "error" ? "alert" : "clock"
        }
      />
      <div>{children}</div>
    </div>
  );
}

export function Loading({ children }: { children: ReactNode }) {
  return (
    <p className="fe-loading" role="status">
      <span className="fe-spinner" aria-hidden="true" />
      {children}
    </p>
  );
}
