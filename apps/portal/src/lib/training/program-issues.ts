import { programEditorSchema, type ProgramEditor } from "@/lib/contracts/training-drafts";
import { compactUniformSets } from "./program-editor";

export type ProgramIssue = { message: string; path: (string | number)[] };
type Path = ProgramIssue["path"];

/** Paths refer to editable document fields, never a server or SQL error. */
export function programIssues(document: ProgramEditor, mode: "save" | "publish", language: "fr" | "en" = "fr"): ProgramIssue[] {
  const t = (fr: string, en: string) => language === "fr" ? fr : en;
  const issues: ProgramIssue[] = [];
  const add = (path: Path, message: string) => {
    if (!issues.some((issue) => issue.path.join(".") === path.join("."))) issues.push({ path, message });
  };
  const context = (path: Path) => {
    if (path[0] !== "weeks" || typeof path[1] !== "number") return t("Programme", "Program");
    let label = `${t("Semaine", "Week")} ${path[1] + 1}`;
    if (path[2] === "sessions" && typeof path[3] === "number") label += ` · ${t("séance", "session")} ${path[3] + 1}`;
    if (path[4] === "blocks" && typeof path[5] === "number") label += ` · ${t("bloc", "block")} ${path[5] + 1}`;
    if (path[6] === "exercises" && typeof path[7] === "number") {
      const exercise = document.weeks[path[1]]?.sessions[path[3] as number]?.blocks[path[5] as number]?.exercises[path[7]];
      label += ` · ${exercise?.pilot?.name[language] || exercise?.name || `${t("exercice", "exercise")} ${path[7] + 1}`}`;
    }
    const setsIndex = path.indexOf("prescribedSets");
    if (setsIndex !== -1 && typeof path[setsIndex + 1] === "number") label += ` · ${t("série", "set")} ${(path[setsIndex + 1] as number) + 1}`;
    return label;
  };
  const parsed = programEditorSchema.safeParse(compactUniformSets(document));
  if (!parsed.success) for (const issue of parsed.error.issues) {
    const path = issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number");
    const field = path.at(-1);
    let message = t("Vérifie ce champ avant d’enregistrer.", "Check this field before saving.");
    if (field === "sets") message = t("Nombre de séries : saisis un nombre entier de 1 à 20.", "Sets: enter a whole number from 1 to 20.");
    else if (field === "targetRir") message = t("RIR cible : saisis un nombre entier de 0 à 10.", "Target RIR: enter a whole number from 0 to 10.");
    else if (field === "restSeconds") message = t("Repos : saisis un nombre entier de 0 à 3 600 secondes.", "Rest: enter a whole number from 0 to 3,600 seconds.");
    else if (field === "reps") message = t("Répétitions : indique une valeur ou une plage, par exemple 8–10.", "Repetitions: enter a value or range, such as 8–10.");
    else if (field === "unit") message = t("Choisis une unité compatible avec cet exercice.", "Choose a compatible unit for this exercise.");
    else if (field === "title" || field === "fr" || field === "en") {
      message = field === "title" ? t("Ajoute un titre en français ou en anglais.", "Add a title in French or English.") : t("Limite ce texte à 300 caractères.", "Limit this text to 300 characters.");
      if (field === "title") path.push("fr");
    } else if (field === "prescribedSets" || field === "prescription") {
      message = t("Vérifie les valeurs de chaque série et leur nombre.", "Check each set’s values and the set count.");
      if (field === "prescription") path.push("sets");
    }
    add(path.length ? path : ["title", "fr"], `${context(path)} : ${message}`);
  }
  if (mode === "save") return issues;
  document.weeks.forEach((week, w) => {
    const wp: Path = ["weeks", w];
    if (!week.sessions.length) add([...wp, "sessions"], `${t("Semaine", "Week")} ${w + 1} : ${t("ajoute une séance ou un jour de repos.", "add a session or a rest day.")}`);
    week.sessions.forEach((session, s) => {
      const sp: Path = [...wp, "sessions", s];
      if (!session.title.fr.trim() && !session.title.en.trim()) add([...sp, "title", "fr"], `${context(sp)} : ${t("ajoute un titre de séance.", "add a session title.")}`);
      if (session.type === "training" && !session.blocks.length) add([...sp, "blocks"], `${context(sp)} : ${t("ajoute un bloc d’exercices.", "add an exercise block.")}`);
      session.blocks.forEach((block, b) => {
        const bp: Path = [...sp, "blocks", b];
        if (!block.exercises.length) add([...bp, "exercises"], `${context(bp)} : ${t("ajoute un exercice.", "add an exercise.")}`);
        else if ((block.mode === "superset" && block.exercises.length !== 2) || (block.mode === "finisher" && block.exercises.length < 2)) {
          add([...bp, "exercises"], `${context(bp)} : ${block.mode === "superset" ? t("un superset contient exactement deux exercices", "a superset contains exactly two exercises") : t("un finisher contient au moins deux exercices", "a finisher contains at least two exercises")}.`);
        }
        block.exercises.forEach((exercise, e) => {
          const ep: Path = [...bp, "exercises", e, "prescription"];
          if (block.mode !== "standard" && exercise.prescription.sets !== block.exercises[0]?.prescription.sets) add([...ep, "sets"], `${context(ep)} : ${t("utilise le même nombre de séries que le premier exercice du groupe.", "use the same number of sets as the first exercise in the group.")}`);
          if (!exercise.pilot) return;
          [exercise.prescription, ...(exercise.prescription.prescribedSets ?? [])].forEach((set, i) => {
            if (!["sec", "distance", "configuration"].includes(set.unit) || set.loadTarget.trim()) return;
            const path = i === 0 ? [...ep, "loadTarget"] : [...ep, "prescribedSets", i - 1, "loadTarget"];
            add(path, `${context(path)} : ${t("précise", "specify")} ${set.unit === "sec" ? t("la durée cible en secondes", "the target duration in seconds") : set.unit === "distance" ? t("la distance cible en mètres", "the target distance in metres") : t("la configuration (bande ou réglage) à utiliser", "the setup (band or setting) to use")}.`);
          });
        });
      });
    });
  });
  return issues;
}
