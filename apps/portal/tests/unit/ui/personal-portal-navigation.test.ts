import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppShell } from "../../../src/components/fe/app-shell";
import { PortalAccessProvider } from "../../../src/components/fe/portal-access-context";
import { ClientHomePilot } from "../../../src/features/client/dashboard/client-home-pilot";
import { PersonalPortalSetup } from "../../../src/features/coach/personal-portal/personal-portal-setup";

Object.assign(globalThis, { React });

type OptionalChildren<T> = Omit<T, "children"> & {
  children?: React.ReactNode;
};
const TestAppShell = AppShell as React.ComponentType<
  OptionalChildren<React.ComponentProps<typeof AppShell>>
>;
const TestPortalAccessProvider = PortalAccessProvider as React.ComponentType<
  OptionalChildren<React.ComponentProps<typeof PortalAccessProvider>>
>;

describe("Coach personal portal navigation", () => {
  it("keeps Coach access out of a regular Client portal", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TestAppShell, { space: "client" }, "Client"),
    );

    expect(markup).not.toContain('href="/coach"');
  });

  it("shows the document return to Coach only for a staff Client session", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        TestPortalAccessProvider,
        { isStaff: true },
        React.createElement(TestAppShell, { space: "client" }, "Client"),
      ),
    );

    expect(markup).toContain('href="/coach"');
    expect(markup).toContain("Espace Coach");
  });

  it("shows the same staff-only return in the Client pilot navigation", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        TestPortalAccessProvider,
        { isStaff: true },
        React.createElement(ClientHomePilot, {
          dashboard: {
            clientId: "personal-client",
            displayName: "Max",
            status: "ACTIVE",
            locale: "fr-CA",
            timezone: "America/Montreal",
          },
          failed: false,
          signingOut: false,
          signOutError: null,
          onRetry: () => undefined,
          onSignOut: () => undefined,
        }),
      ),
    );

    expect(markup).toContain('href="/coach"');
    expect(markup).toContain("Espace Coach");
  });

  it("exposes the personal portal from Coach without creating it", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TestAppShell, { space: "coach" }, "Coach"),
    );

    expect(markup).toContain('href="/coach/personal"');
    expect(markup).toContain("Mon portail personnel");
  });

  it("renders explicit activation defaults and preserves the old test Client", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PersonalPortalSetup),
    );

    expect(markup).toContain("Activer mon portail personnel");
    expect(markup).toContain("ancien Client test demeure intact");
    expect(markup).toContain('value="fr-CA"');
    expect(markup).toContain('value="America/Montreal"');
    expect(markup).not.toContain("OTP");
  });
});
