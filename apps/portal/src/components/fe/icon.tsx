import type { SVGProps } from "react";

type IconName =
  | "plus"
  | "check"
  | "clock"
  | "alert"
  | "menu"
  | "close"
  | "eye"
  | "eye-off"
  | "arrow"
  | "users";

/** Small, decorative interface symbols; controls supply the accessible name. */
export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    alert: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 17h.01" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    eye: (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    "eye-off": (
      <>
        <path d="m3 3 18 18M9.5 5.3A12 12 0 0 1 12 5c7 0 10 7 10 7a16 16 0 0 1-3 4M6 6a19 19 0 0 0-4 6s3 7 10 7a13 13 0 0 0 6-1.5" />
        <path d="M10 10a3 3 0 0 0 4 4" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
