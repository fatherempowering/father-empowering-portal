"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Modal } from "@/components/fe/modal";
import styles from "./program-confirmation.module.css";

/** Business confirmations stay in the application; browser exit protection is separate. */
export function useProgramConfirmation() {
  const titleId = useId(); const messageId = useId();
  const [question, setQuestion] = useState<{ title: string; message: string; action: string } | null>(null);
  const answer = useRef<((accepted: boolean) => void) | null>(null);
  useEffect(() => () => { answer.current?.(false); answer.current = null; }, []);
  function close(accepted: boolean) {
    const resolve = answer.current; answer.current = null; setQuestion(null); resolve?.(accepted);
  }
  function confirm(message: string, action = "Confirmer", title = "Confirmer cette action") {
    if (answer.current) return Promise.resolve(false);
    setQuestion({ title, message, action });
    return new Promise<boolean>((resolve) => { answer.current = resolve; });
  }
  const confirmation = question ? <Modal open busy={false} onClose={() => close(false)} labelledBy={titleId} describedBy={messageId}>
    <header className="fe-dialog-header"><h2 id={titleId}>{question.title}</h2></header>
    <div className="fe-dialog-content"><p id={messageId}>{question.message}</p></div>
    <footer className={styles.actions}>
      <button className="fe-button" type="button" data-autofocus onClick={() => close(false)}>Annuler</button>
      <button className="fe-button fe-button-primary" type="button" onClick={() => close(true)}>{question.action}</button>
    </footer>
  </Modal> : null;
  return { confirm, confirmation };
}
