import { describe, expect, it } from "vitest";

import { invitationMutationKey } from "./invitation-mutation-key";

describe("invitationMutationKey", () => {
  it("conserve la clé pour une répétition de la même invitation", () => {
    expect(
      invitationMutationKey(
        "revoke",
        "40000000-0000-4000-8000-000000000001",
        "50000000-0000-4000-8000-000000000001",
      ),
    ).toBe(
      invitationMutationKey(
        "revoke",
        "40000000-0000-4000-8000-000000000001",
        "50000000-0000-4000-8000-000000000001",
      ),
    );
  });

  it("crée une nouvelle clé lorsqu’une mutation ultérieure remplace l’invitation", () => {
    const oldInvitation = invitationMutationKey(
      "revoke",
      "40000000-0000-4000-8000-000000000001",
      "50000000-0000-4000-8000-000000000001",
    );
    const newInvitation = invitationMutationKey(
      "revoke",
      "40000000-0000-4000-8000-000000000001",
      "50000000-0000-4000-8000-000000000002",
    );

    expect(newInvitation).not.toBe(oldInvitation);
  });
});
