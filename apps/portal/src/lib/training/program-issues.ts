import { programEditorSchema, type ProgramEditor } from "@/lib/contracts/training-drafts";
import { compactUniformSets } from "./program-editor";

export type ProgramIssue = { message: string; path: (string | number)[] };
type Path = ProgramIssue["path"];

/** Paths refer to editable document fields, never a server or SQL error. */
export function programIssues(document: ProgramEditor, mode: "save" | "publish"): ProgramIssue[] {
  const issues: ProgramIssue[] = [];
  const add = (path: Path, message: string) => {
    if (!issues.some((issue) => issue.path.join(".") === path.join("."))) issues.push({ path, message });
  };
  const context = (path: Path) => {
    if (path[0] !== "weeks" || typeof path[1] !== "number") return "Programme";
    let label = `Semaine ${path[1] + 1}`;
    if (path[2] === "sessions" && typeof path[3] === "number") label += ` · séance ${path[3] + 1}`;
    if (path[4] === "blocks" && typeof path[5] === "number") label += ` · bloc ${path[5] + 1}`;
    if (path[6] === "exercises" && typeof path[7] === "number") {
      const exercise = document.weeks[path[1]]?.sessions[path[3] as number]?.blocks[path[5] as number]?.exercises[path[7]];
      label += ` · ${exercise?.pilot?.name.fr || exercise?.name || `exercice ${path[7] + 1}`}`;
    }
    const setsIndex = path.indexOf("prescribedSets");
    if (setsIndex !== -1 && typeof path[setsIndex + 1] === "number") label += ` · série ${(path[setsIndex + 1] as number) + 1}`;
    return label;
  };
  const parsed = programEditorSchema.safeParse(compactUniformSets(document));
  if (!parsed.success) for (const issue of parsed.error.issues) {
    const path = issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number");
    const field = path.at(-1);
    let message = "Vérifie ce champ avant d’enregistrer.";
    if (field === "sets") message = "Nombre de séries : saisis un nombre entier de 1 à 20.";
    else if (field === "targetRir") message = "RIR cible : saisis un nombre entier de 0 à 10.";
    else if (field === "restSeconds") message = "Repos : saisis un nombre entier de 0 à 3 600 secondes.";
    else if (field === "reps") message = "Répétitions : indique une valeur ou une plage, par exemple 8–10.";
    else if (field === "unit") message = "Choisis une unité compatible avec cet exercice.";
    else if (field === "title" || field === "fr" || field === "en") {
      message = field === "title" ? "Ajoute un titre en français ou en anglais." : "Limite ce texte à 300 caractères.";
      if (field === "title") path.push("fr");
    } else if (field === "prescribedSets" || field === "prescription") {
      message = "Vérifie les valeurs de chaque série et leur nombre.";
      if (field === "prescription") path.push("sets");
    }
    add(path.length ? path : ["title", "fr"], `${context(path)} : ${message}`);
  }
  if (mode === "save") return issues;
  document.weeks.forEach((week, w) => {
    const wp: Path = ["weeks", w];
    if (!week.sessions.length) add([...wp, "sessions"], `Semaine ${w + 1} : ajoute une séance ou un jour de repos.`);
    week.sessions.forEach((session, s) => {
      const sp: Path = [...wp, "sessions", s];
      if (!session.title.fr.trim() && !session.title.en.trim()) add([...sp, "title", "fr"], `${context(sp)} : ajoute un titre de séance.`);
      if (session.type === "training" && !session.blocks.length) add([...sp, "blocks"], `${context(sp)} : ajoute un bloc d’exercices.`);
      session.blocks.forEach((block, b) => {
        const bp: Path = [...sp, "blocks", b];
        if (!block.exercises.length) add([...bp, "exercises"], `${context(bp)} : ajoute un exercice.`);
        else if ((block.mode === "superset" && block.exercises.length !== 2) || (block.mode === "finisher" && block.exercises.length < 2)) {
          add([...bp, "exercises"], `${context(bp)} : ${block.mode === "superset" ? "un superset contient exactement deux exercices" : "un finisher contient au moins deux exercices"}.`);
        }
        block.exercises.forEach((exercise, e) => {
          const ep: Path = [...bp, "exercises", e, "prescription"];
          if (block.mode !== "standard" && exercise.prescription.sets !== block.exercises[0]?.prescription.sets) add([...ep, "sets"], `${context(ep)} : utilise le même nombre de séries que le premier exercice du groupe.`);
          if (!exercise.pilot) return;
          [exercise.prescription, ...(exercise.prescription.prescribedSets ?? [])].forEach((set, i) => {
            if (!["sec", "distance", "configuration"].includes(set.unit) || set.loadTarget.trim()) return;
            const path = i === 0 ? [...ep, "loadTarget"] : [...ep, "prescribedSets", i - 1, "loadTarget"];
            add(path, `${context(path)} : précise ${set.unit === "sec" ? "la durée cible en secondes" : set.unit === "distance" ? "la distance cible en mètres" : "la configuration (bande ou réglage) à utiliser"}.`);
          });
        });
      });
    });
  });
  return issues;
}
