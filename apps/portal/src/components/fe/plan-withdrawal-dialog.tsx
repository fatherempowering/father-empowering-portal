"use client";

import { useEffect, useRef } from "react";
import styles from "./plan-withdrawal-dialog.module.css";

export function PlanWithdrawalDialog({ title, onCancel, onConfirm }: {
  title: string; onCancel(): void; onConfirm(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal(); cancel.current?.focus();
    return () => { element?.close(); };
  }, []);
  const cancelDialog = () => { dialog.current?.close(); onCancel(); };
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="withdraw-plan-title" onCancel={event => { event.preventDefault(); cancelDialog(); }}>
    <h2 id="withdraw-plan-title">{title}</h2>
    <p>Ce plan ne sera plus actif pour le client. Les versions précédentes et les résultats enregistrés restent conservés dans l’historique. Le brouillon n’est pas supprimé.</p>
    <div className={styles.actions}><button ref={cancel} className="fe-button" type="button" onClick={cancelDialog}>Annuler</button><button className="fe-button fe-button-primary" type="button" onClick={onConfirm}>Confirmer le retrait</button></div>
  </dialog>;
}
