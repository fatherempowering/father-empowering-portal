import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LegacyClientHeader } from "@/components/fe/legacy-client-header";

Object.assign(globalThis, { React });

describe("Legacy Client navigation", () => {
  it.each([true, false])("links all six implemented destinations and preserves the active page, french=%s", (french) => {
    const html = renderToStaticMarkup(React.createElement(LegacyClientHeader, { french, active: "training", name: "Test Client" }));
    const language = french ? "fr" : "en";
    expect(html).toContain(`href="/client?language=${language}"`);
    expect(html).toContain(`href="/client/program?language=${language}" aria-current="page"`);
    expect(html).toContain(`href="/client/program?language=${language}#workout-history-title"`);
    for (const route of ["nutrition", "check-in", "progression"]) expect(html).toContain(`href="/client/${route}?language=${language}"`);
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain("Coming soon");
    expect(html).not.toContain("À venir");
    expect(html).not.toContain("MANUAL DATA MODE");
    expect(html).not.toContain("13:44");
    expect(html).toContain("Test Client");
  });

  it.each(["nutrition", "check-in", "progression"] as const)("marks the real %s destination active", active => {
    const html = renderToStaticMarkup(React.createElement(LegacyClientHeader, { french: true, active }));
    expect(html).toContain(`href="/client/${active}?language=fr" aria-current="page"`);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("escapes account display names and preserves the supplied mobile menu", () => {
    const html = renderToStaticMarkup(React.createElement(LegacyClientHeader, {
      french: true, active: "home", name: "<script>not markup</script>", menu: React.createElement("button", { type: "button", "aria-label": "Ouvrir le menu" }, "Menu"),
    }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('aria-label="Ouvrir le menu"');
    expect(html).toContain('href="/client?language=fr" aria-current="page"');
  });
});
