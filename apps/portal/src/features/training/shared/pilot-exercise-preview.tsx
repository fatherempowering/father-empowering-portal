import type { PilotExercise } from "@/lib/contracts/exercise-pilot";

import styles from "./pilot-exercise-preview.module.css";

/** Read-only presentation inside the Coach pilot; never a Client prescription. */
export function PilotExercisePreview({
  exercise,
  language,
}: {
  exercise: PilotExercise;
  language: "fr" | "en";
}) {
  const french = language === "fr";
  const text = (fr: string, en: string) => french ? fr : en;
  const instructions = exercise.instructions[language];
  const headingId = `pilot-preview-${exercise.id}`;
  const perArm = exercise.performance.countingDecision === "MAX_PER_ARM_2026_10_23";
  const steps = [
    { key: "setup", title: text("Installation", "Setup") },
    { key: "execution", title: text("Exécution", "Execution") },
    { key: "finish", title: text("Fin du mouvement", "Finish") },
  ] as const;

  return (
    <article className={styles.preview} aria-labelledby={headingId} lang={language}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>
          {text("Aperçu de lecture — non publié", "Reading preview — unpublished")}
        </p>
        <h3 id={headingId}>{exercise.name[language]}</h3>
        <p className={styles.notice}>
          {text(
            "Consignes en attente de validation. Cet aperçu ne constitue pas un exercice prescrit et n’est pas visible dans le portail Client.",
            "Instructions pending review. This preview is not a prescribed exercise and is not visible in the Client portal.",
          )}
        </p>
      </header>

      <ol className={styles.steps}>
        {steps.map(({ key, title }) => (
          <li key={key}>
            <h4>{title}</h4>
            <p>{instructions[key]}</p>
          </li>
        ))}
      </ol>

      <section className={styles.conventions} aria-label={text("Repères de saisie à vérifier", "Recording guidance to review")}>
        <dl>
          <div>
            <dt>{text("Comment compter", "How to count")}</dt>
            <dd>
              <p className={styles.decision}>
                {perArm
                  ? text("Comptage retenu : répétitions par bras", "Selected count: repetitions per arm")
                  : text("Convention de comptage proposée", "Proposed counting convention")}
              </p>
              <p>{exercise.performance.counting[language]}</p>
            </dd>
          </div>
          <div>
            <dt>{text("Charge — convention proposée", "Load — proposed convention")}</dt>
            <dd>{exercise.performance.load[language]}</dd>
          </div>
          <div>
            <dt>{text("À savoir avant utilisation", "Before use")}</dt>
            <dd>{exercise.performance.notes[language]}</dd>
          </div>
        </dl>
      </section>
    </article>
  );
}
