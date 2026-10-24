"use client";

import { useId } from "react";
import { Feedback } from "@/components/fe/feedback";
import { Modal } from "@/components/fe/modal";
import { Icon } from "@/components/fe/icon";
import type { ExerciseSnapshot } from "@/lib/contracts/training";
import { ExercisePilot } from "./exercise-pilot";
import styles from "./pilot-selection-dialog.module.css";
import { usePilotSelection } from "./use-pilot-selection";

export function PilotSelectionDialog({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (exercise: ExerciseSnapshot) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const { busy, error, select } = usePilotSelection(onAdd);

  return <Modal open busy={busy} onClose={onClose} labelledBy={titleId} describedBy={descriptionId}>
    <header className="fe-dialog-header">
      <div><h2 id={titleId}>Choisir un exercice pilote</h2><p id={descriptionId} className="fe-intro">Ajoute un mouvement à la séance en cours. Tu choisiras ensuite ses séries, répétitions et repères de charge.</p></div>
      <button className="fe-icon-button" type="button" aria-label="Fermer le choix d’exercice" disabled={busy} onClick={onClose}><Icon name="close" /></button>
    </header>
    <div className={`fe-dialog-content ${styles.selector}`}>
      {error ? <Feedback>{error}</Feedback> : null}
      <ExercisePilot onSelect={(exercise) => void select(exercise)} selectionBusy={busy} />
    </div>
  </Modal>;
}
