"use client";

import { useId, useRef, useState } from "react";
import { Feedback } from "@/components/fe/feedback";
import { Modal } from "@/components/fe/modal";
import { Icon } from "@/components/fe/icon";
import type { PilotExercise } from "@/lib/contracts/exercise-pilot";
import { exerciseSnapshotSchema, type ExerciseSnapshot } from "@/lib/contracts/training";
import { ExercisePilot } from "./exercise-pilot";
import styles from "./pilot-selection-dialog.module.css";

export function PilotSelectionDialog({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (exercise: ExerciseSnapshot) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const receipts = useRef(new Map<string, string>());

  async function select(source: PilotExercise) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    const sourceKey = `${source.id}@${source.sourceVersion}`;
    const clientMutationId = receipts.current.get(sourceKey) ?? crypto.randomUUID();
    receipts.current.set(sourceKey, clientMutationId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("/api/v1/coach/exercise-pilot/select", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ sourceId: source.id, sourceVersion: source.sourceVersion, clientMutationId }),
        signal: controller.signal,
      });
      if (response.status === 401) { window.location.replace("/login"); return; }
      if ([403, 404, 409].includes(response.status)) {
        setError("Cet exercice ne peut pas être ajouté dans cet environnement. Le lot est réservé aux tests staging autorisés. Ton brouillon est conservé.");
        return;
      }
      if (!response.ok) throw new Error("PILOT_SELECTION_FAILED");
      const exercise = exerciseSnapshotSchema.parse((await response.json()).data?.exercise);
      if (!exercise.pilot || exercise.pilot.sourceId !== source.id || exercise.pilot.sourceVersion !== source.sourceVersion ||
          exercise.pilot.usage !== "STAGING_TEST" || exercise.archived || exercise.canEdit) {
        throw new Error("PILOT_SELECTION_MISMATCH");
      }
      onAdd(exercise);
    } catch {
      setError("L’ajout n’a pas été confirmé. Réessaie avec le même exercice : aucun doublon ne sera créé dans la banque. Ton brouillon est conservé.");
    } finally {
      clearTimeout(timeout); inFlight.current = false; setBusy(false);
    }
  }

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
