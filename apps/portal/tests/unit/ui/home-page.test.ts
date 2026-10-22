import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HomePage from "../../../src/app/page";
import {
  landingCopy,
  resolveLandingLocale,
} from "../../../src/components/fe/landing/landing-page";

Object.assign(globalThis, { React });

describe("HomePage", () => {
  it("renders the approved English landing by default with relative access links", async () => {
    const markup = renderToStaticMarkup(
      await HomePage({ searchParams: Promise.resolve({}) }),
    );

    expect(markup).toContain('href="/login"');
    expect(markup).toContain("Coach login");
    expect(markup).toContain('href="/client-login"');
    expect(markup).toContain("Client login");
    expect(markup).toContain("Same");
    expect(markup).toContain("Different");
    expect(markup).toContain("/brand/landing/hero-desktop.webp");
    expect(markup).toContain("/brand/landing/hero-mobile.webp");
    expect(markup).toContain("/brand/fe-logo-splash.png");
  });

  it("renders the approved French copy only for ?lang=fr", async () => {
    const markup = renderToStaticMarkup(
      await HomePage({ searchParams: Promise.resolve({ lang: "fr" }) }),
    );

    expect(markup).toContain('lang="fr"');
    expect(markup).toContain("Mêmes");
    expect(markup).toContain("Nouveau");
    expect(markup).toContain("Connexion coach");
    expect(markup).toContain("Connexion client");
  });

  it("keeps the locale contract explicit and English by default", () => {
    expect(resolveLandingLocale(undefined)).toBe("en");
    expect(resolveLandingLocale("en")).toBe("en");
    expect(resolveLandingLocale(["fr"])).toBe("en");
    expect(resolveLandingLocale("fr")).toBe("fr");
    expect(landingCopy.fr.headline).toEqual([
      "Mêmes",
      "standards.",
      "Nouveau",
      "jour.",
    ]);
  });
});
