import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LegacyClientHeader } from "@/components/fe/legacy-client-header";

Object.assign(globalThis, { React });

describe("Legacy Client navigation", () => {
  it.each([true, false])("keeps actual routes separate from unimplemented modules, french=%s", (french) => {
    const html = renderToStaticMarkup(React.createElement(LegacyClientHeader, { french, active: "training", name: "Test Client" }));
    const language = french ? "fr" : "en";
    expect(html).toContain(`href="/client?language=${language}"`);
    expect(html).toContain(`href="/client/program?language=${language}" aria-current="page"`);
    expect(html).toContain(`href="/client/program?language=${language}#workout-history-title"`);
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(3);
    expect(html).not.toMatch(/href="[^"]*(nutrition|check-in|progression)/);
    expect(html).toContain(french ? "Module pas encore disponible" : "Module not available yet");
    expect(html).not.toContain("MANUAL DATA MODE");
    expect(html).not.toContain("13:44");
    expect(html).toContain("Test Client");
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
