import type { DraftExercise } from "@/lib/contracts/training-drafts";

import styles from "./published-exercise-guidance.module.css";

/** Read only the publication's frozen snapshot, never the current catalogue. */
export function PublishedExerciseGuidance({ exercise, french, coach = false }: { exercise: DraftExercise; french: boolean; coach?: boolean }) {
  if (!exercise.pilot) return null;
  const language = french ? "fr" : "en";
  const pilot = exercise.pilot;
  const steps = [
    { key: "setup", label: french ? "Installation" : "Setup" },
    { key: "execution", label: french ? "Exécution" : "Execution" },
    { key: "finish", label: french ? "Fin du mouvement" : "Finish" },
  ] as const;
  return <section className={styles.guidance} lang={language} aria-label={french ? "Consignes de l’exercice" : "Exercise instructions"}>
    <p className={styles.pilotNotice}>{coach
      ? french ? "Exercice pilote · test staging. Vérifie les consignes et les réglages avec le client test avant l’exécution." : "Pilot exercise · staging test. Check instructions and settings with the test client before execution."
      : french ? "Exercice pilote · test staging. Les consignes et réglages sont à vérifier avec ton coach avant de l’exécuter." : "Pilot exercise · staging test. Check the instructions and settings with your coach before performing it."}</p>
    <dl className={styles.conventions}>
      <div><dt>{french ? "Comptage" : "Counting"}</dt><dd>{pilot.performance.counting[language]}</dd></div>
      <div><dt>{french ? "Charge / réglage" : "Load / setting"}</dt><dd>{pilot.performance.load[language]}</dd></div>
    </dl>
    <details className={styles.instructions}>
      <summary>{french ? "Voir les trois étapes du mouvement" : "See the three movement steps"}</summary>
      <ol>{steps.map(step => <li key={step.key}><strong>{step.label}</strong><p>{pilot.instructions[language][step.key]}</p></li>)}</ol>
    </details>
    <p className={styles.notes}>{pilot.performance.notes[language]}</p>
  </section>;
}
