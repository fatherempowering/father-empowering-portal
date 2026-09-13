import type { ComponentProps } from "react";
export default function Image({
  priority,
  ...props
}: ComponentProps<"img"> & { priority?: boolean }) {
  void priority;
  // The harness serves the exact local assets without Next image optimization.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt ?? ""} />;
}
