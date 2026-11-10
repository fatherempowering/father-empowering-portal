"use client";

import { Children, useCallback, type ReactNode } from "react";
import { usePortalLanguage } from "./portal-preferences";
import { translateUi } from "./ui-copy";

/** Call only for owned interface copy, never for client answers or Coach content. */
export function UiText({ children }: { children: ReactNode }) {
  const { language } = usePortalLanguage();
  return <>{Children.map(children, child => typeof child === "string" ? translateUi(child, language) : child)}</>;
}

export function useUiCopy() {
  const { language } = usePortalLanguage();
  return useCallback((text: string) => translateUi(text, language), [language]);
}
