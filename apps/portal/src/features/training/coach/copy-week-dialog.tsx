"use client";

import { useId, useState, type FormEvent } from "react";
import { Modal } from "@/components/fe/modal";
import { Feedback } from "@/components/fe/feedback";
import { Icon } from "@/components/fe/icon";
import type { ProgramEditor } from "@/lib/contracts/training-drafts";
import { copyWeekToWeeks, planWeekCopy, weekHasContent } from "@/lib/training/program-editor";
import styles from "./copy-week-dialog.module.css";

export function CopyWeekDialog({ program, sourceIndex, locked, onClose, onCopy }: {
  program: ProgramEditor;
  sourceIndex: number;
  locked: boolean;
  onClose: () => void;
  onCopy: (document: ProgramEditor, count: number) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const rangeId = useId();
  const [lastWeek, setLastWeek] = useState(String(Math.min(52, Math.max(7, program.weeks.length, sourceIndex + 2))));
  const [targets, setTargets] = useState<number[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = Number(lastWeek);
  const validEnd = Number.isInteger(end) && end >= program.weeks.length && end <= 52;
  const plan = planWeekCopy(program, sourceIndex, targets);
  const sourceNumber = sourceIndex + 1;

  function select(numbers: number[]) {
    setTargets(numbers); setConfirming(false); setError(null);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || !validEnd || !targets.length) return;
    if (plan.replacements.length && !confirming) { setConfirming(true); return; }
    try {
      const next = copyWeekToWeeks(program, sourceIndex, targets, confirming);
      onCopy(next, plan.targets.length);
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "PROGRAM_TOO_LARGE"
        ? "Cette copie dépasserait la taille maximale du programme. Choisis moins de semaines. Ton brouillon n’a pas changé."
        : "La copie n’a pas pu être préparée. Vérifie les semaines sélectionnées. Ton brouillon n’a pas changé.");
    }
  }

  return <Modal open busy={locked} onClose={onClose} labelledBy={titleId} describedBy={descriptionId}>
    <header className="fe-dialog-header">
      <div>
        <p className="fe-kicker">Programme · brouillon</p>
        <h2 id={titleId}>Copier la semaine {sourceNumber}</h2>
        <p className="fe-intro" id={descriptionId}>Séances, exercices et consignes seront copiés. Chaque semaine restera modifiable séparément.</p>
      </div>
      <button className="fe-icon-button" type="button" aria-label="Fermer la copie de semaine" disabled={locked} onClick={onClose}><Icon name="close" /></button>
    </header>
    <form className={`fe-dialog-content ${styles.form}`} onSubmit={submit} noValidate>
      {confirming ? <div className={styles.warning} role="alert">
        <h3>Remplacer le contenu existant ?</h3>
        <p>Semaines concernées : <strong>{plan.replacements.join(", ")}</strong>.</p>
        <p>Leurs séances et objectifs seront remplacés par ceux de la semaine {sourceNumber}. Les autres semaines resteront intactes.</p>
      </div> : <>
        <label className="fe-field">
          Choisir jusqu’à la semaine
          <input type="number" inputMode="numeric" min={program.weeks.length} max={52} step={1} value={lastWeek}
            data-autofocus disabled={locked} aria-describedby={rangeId} aria-invalid={!validEnd}
            onChange={(event) => {
              const value = event.target.value; setLastWeek(value);
              const limit = Number(value);
              select(Number.isInteger(limit) && limit >= program.weeks.length && limit <= 52 ? targets.filter((number) => number <= limit) : []);
            }} />
        </label>
        <p id={rangeId} className="fe-hint">De {program.weeks.length} à 52. Les semaines manquantes seront créées seulement après confirmation de la copie.</p>
        {!validEnd ? <Feedback>Choisis un nombre entier entre {program.weeks.length} et 52.</Feedback> : <>
          <div className={styles.shortcuts}>
            <button className="fe-button" type="button" disabled={locked || end <= sourceNumber}
              onClick={() => select(Array.from({ length: end - sourceNumber }, (_, i) => sourceNumber + i + 1))}>Toutes les semaines suivantes</button>
            <button className="fe-button" type="button" disabled={locked || !targets.length} onClick={() => select([])}>Tout décocher</button>
          </div>
          <fieldset className={styles.weeks} disabled={locked}>
            <legend>Semaines de destination</legend>
            {Array.from({ length: end }, (_, i) => i + 1).map((number) => {
              const week = program.weeks[number - 1];
              const source = number === sourceNumber;
              const state = source ? "Source · conservée" : !week ? "À créer" : weekHasContent(week) ? "Contenu existant" : "Vide";
              return <label key={number} className={styles.week}>
                <input type="checkbox" disabled={source} checked={targets.includes(number)}
                  onChange={(event) => select(event.target.checked ? [...targets, number] : targets.filter((target) => target !== number))} />
                <span>Semaine {number}<small>{state}</small></span>
              </label>;
            })}
          </fieldset>
        </>}
      </>}
      <div className={styles.summary} aria-live="polite">
        <p>{plan.targets.length ? `Destination${plan.targets.length > 1 ? "s" : ""} : ${plan.targets.join(", ")}.` : "Choisis au moins une semaine de destination."}</p>
        {plan.empty.length ? <p>Semaines intermédiaires créées vides : {plan.empty.join(", ")}. Elles resteront à compléter avant publication.</p> : null}
        {!confirming && plan.replacements.length ? <p>Les semaines {plan.replacements.join(", ")} contiennent déjà du travail. Une confirmation sera demandée avant de le remplacer.</p> : null}
        <p>La copie reste dans ton brouillon. Aucun changement chez le client sans publication.</p>
      </div>
      {error ? <Feedback>{error}</Feedback> : null}
      <div className="fe-form-actions">
        <button className="fe-button" type="button" disabled={locked} onClick={onClose}>Annuler</button>
        {confirming ? <button className="fe-button" type="button" disabled={locked} onClick={() => setConfirming(false)}>Modifier la sélection</button> : null}
        <button className="fe-button fe-button-primary" type="submit" disabled={locked || !validEnd || !targets.length}>
          {confirming ? "Confirmer le remplacement et copier" : plan.replacements.length ? "Vérifier le remplacement" : `Copier vers ${plan.targets.length} semaine${plan.targets.length > 1 ? "s" : ""}`}
        </button>
      </div>
    </form>
  </Modal>;
}
