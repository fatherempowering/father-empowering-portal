import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClientVisualShell } from "../../../src/features/client/dashboard/client-visual-shell";
import { PortalAccessProvider } from "../../../src/components/fe/portal-access-context";

Object.assign(globalThis, { React });
type OptionalChildren<T> = Omit<T, "children"> & { children?: React.ReactNode };
const TestProvider = PortalAccessProvider as React.ComponentType<OptionalChildren<React.ComponentProps<typeof PortalAccessProvider>>>;
const TestShell = ClientVisualShell as React.ComponentType<OptionalChildren<React.ComponentProps<typeof ClientVisualShell>>>;
const shell = (isStaff = false, french = true) => renderToStaticMarkup(React.createElement(TestProvider, { isStaff },
  React.createElement(TestShell, { name: "Client Exemple", french, current: "onboarding", documentNavigation: true, accountAction: React.createElement("button", null, "Logout") }, "Questionnaire"),
));

describe("isolated Client visual shell", () => {
  it("uses the actual Client identity, never the mockup Coach or Client", () => {
    const html = shell();
    expect(html).toContain("Client Exemple");
    expect(html).not.toMatch(/Coach Max|Alex Martin|Dossier ouvert/);
  });
  it("keeps all existing Client routes including the newly published program", () => {
    const html = shell();
    for (const route of ["/client", "/client/today", "/client/onboarding", "/client/week-zero", "/client/program"]) expect(html).toContain(`href="${route}"`);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/href="\/client\/onboarding" aria-current="page"/);
  });
  it("preserves the staff-only document return to Coach without granting roles", () => {
    expect(shell()).not.toContain('href="/coach"');
    expect(shell(true)).toContain('href="/coach"');
  });
  it("keeps logout available and offers no invented account route", () => {
    const html = shell();
    expect(html).toContain("Logout");
    expect(html).not.toContain('href="/client/account"');
  });
  it("renders English without changing the profile or navigation contracts", () => {
    const html = shell(false, false);
    expect(html).toContain('lang="en"');
    expect(html).toContain("Welcome questionnaire");
    expect(html).toContain("My program");
    expect(html).toContain("Client Exemple");
  });
});
