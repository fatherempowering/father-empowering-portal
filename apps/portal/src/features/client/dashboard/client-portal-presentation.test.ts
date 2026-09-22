import { describe, expect, it } from "vitest";

import {
  clientPortalCopy,
  formatClientToday,
} from "./client-portal-presentation";
import type { ClientDashboard } from "./contracts";

function client(overrides: Partial<ClientDashboard> = {}): ClientDashboard {
  return {
    clientId: "client-a",
    displayName: "Alex Martin",
    status: "ACTIVE",
    locale: "fr-CA",
    timezone: "America/Montreal",
    ...overrides,
  };
}

describe("client portal presentation", () => {
  it("presents Today as the next destination without inventing a workout", () => {
    const copy = clientPortalCopy(client());

    expect(copy.openToday).toBe("Voir aujourd’hui");
    expect(copy.nextActionLabel).toBe("Programme");
    expect(copy.nextActionStatus).toBe("Accès actif");
    expect(copy.nextActionTitle).toBe("Ton accès est actif.");
    expect(copy.nextActionDescription).toContain(
      "ne contient pas encore ton programme",
    );
    expect(JSON.stringify(copy)).not.toMatch(
      /à jour|rien à faire|séance prête|entraînement du jour|prochaine étape apparaîtra/i,
    );
  });

  it("uses the Client locale and time zone for the Today date", () => {
    const instant = new Date("2026-08-18T02:30:00.000Z");

    expect(formatClientToday(client(), instant)).toBe("lundi 17 août");
    expect(
      formatClientToday(
        client({ locale: "en-CA", timezone: "Asia/Tokyo" }),
        instant,
      ),
    ).toBe("Tuesday, August 18");
  });

  it("falls back safely when an invalid time zone reaches presentation", () => {
    const date = formatClientToday(
      client({ timezone: "Invalid/Zone" }),
      new Date("2026-08-18T02:30:00.000Z"),
    );

    expect(date).toBe("mardi 18 août");
  });
});
