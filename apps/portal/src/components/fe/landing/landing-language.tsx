"use client";

import { useLayoutEffect } from "react";

export function LandingLanguage({ locale }: { locale: "en" | "fr" }) {
  useLayoutEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = previous;
    };
  }, [locale]);

  return null;
}
