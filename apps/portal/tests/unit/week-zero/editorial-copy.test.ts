import { describe, expect, it } from "vitest";
import { weekZeroCopyText } from "../../../src/features/client/week-zero/week-zero-copy";

describe("approved Week Zero copy", () => {
  it.each([true, false])("keeps instructions factual and distinguishes a draft from sending (French: %s)", (french) => {
    const intro = weekZeroCopyText("WZ-01-INTRO", french);
    expect(intro.split("\n\n")).toHaveLength(3);
    expect(intro).toContain(french ? "Enregistre ton brouillon" : "Save your draft");
    expect(weekZeroCopyText("WZ-07-RELIRE", french)).toContain(french
      ? "Enregistrer ton brouillon ne l’envoie pas à ton coach."
      : "Saving your draft doesn’t send it to your coach.");
    expect(weekZeroCopyText("WZ-07-RELIRE", french)).toContain(french
      ? "tu ne pourras plus les modifier" : "you won’t be able to edit them");
  });

  it.each([true, false])("retains the approved human-review details and safety instructions (French: %s)", (french) => {
    const measures = weekZeroCopyText("WZ-03-MESURES", french);
    expect(measures).toContain(french ? "bras gauche et droit" : "left and right arms");
    expect(measures).toContain(french ? "mollets gauche et droit sont facultatifs" : "left and right calves are optional");
    const loads = weekZeroCopyText("WZ-04-CHARGES", french);
    expect(loads).toContain(french ? "la charge est 0" : "the load is 0");
    expect(loads).toContain(french ? "un seul haltère" : "one dumbbell");
    expect(loads).toContain(french ? "2 à 4 répétitions" : "2 to 4 repetitions");
    expect(loads).toContain(french ? "champ RIR est facultatif" : "RIR value is optional");
    expect(weekZeroCopyText("WZ-01-CHARGES-SECURITE", french)).toContain(french ? "Ce n’est pas un test maximal" : "This is not a max test");
    expect(weekZeroCopyText("WZ-05-CARDIO", french)).toContain(french ? "en sécurité" : "safely");
    expect(weekZeroCopyText("WZ-06-MOBILITE", french)).toContain(french ? "Tu n’as pas à refaire un mouvement" : "You don’t need to repeat a movement");
  });
});
