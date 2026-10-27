import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/login/actions", () => ({ signInCoachAction: vi.fn() }));

import LoginPage from "@/app/login/page";

function visibleText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(visibleText).join(" ");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return visibleText(node.props.children);
  return "";
}

describe("Coach login outage feedback", () => {
  beforeEach(() => vi.stubGlobal("React", React));
  afterEach(() => vi.unstubAllGlobals());

  it("explains a temporary outage without accusing the password or exposing internals", async () => {
    const page = await LoginPage({ searchParams: Promise.resolve({ error: "unavailable" }) });
    const text = visibleText(page);
    expect(text).toContain("La connexion est momentanément indisponible.");
    expect(text).toContain("Réessaie dans quelques instants.");
    expect(text).toContain("Inutile de modifier ton mot de passe.");
    expect(text).not.toContain("Le courriel ou le mot de passe est invalide.");
    expect(text).not.toMatch(/PGRST|504|Supabase/);
  });

  it("keeps invalid credentials generic", async () => {
    const page = await LoginPage({ searchParams: Promise.resolve({ error: "invalid" }) });
    expect(visibleText(page)).toContain("Le courriel ou le mot de passe est invalide.");
    expect(visibleText(page)).not.toContain("momentanément indisponible");
  });

  it("does not show an error on a fresh attempt", async () => {
    const page = await LoginPage({ searchParams: Promise.resolve({}) });
    expect(visibleText(page)).not.toMatch(/indisponible|invalide/);
  });
});
