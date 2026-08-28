"use client";

import { useEffect, useId, useState, type FormEvent } from "react";

import type { CreateClientFormValues } from "../model";
import styles from "./coach-dashboard.module.css";

interface CreateClientDialogProps {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: CreateClientFormValues) => Promise<void>;
}

const initialValues: CreateClientFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  locale: "fr",
  timezone: "America/Toronto",
};

export function CreateClientDialog({
  open,
  busy,
  error,
  onClose,
  onSubmit,
}: CreateClientDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [values, setValues] = useState(initialValues);

  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [busy, onClose, open]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(values);
  }

  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.dialog}
        role="dialog"
      >
        <header className={styles.dialogHeader}>
          <p className={styles.eyebrow}>Nouvelle relation de coaching</p>
          <h2 className={styles.dialogTitle} id={titleId}>
            Inviter un client
          </h2>
          <p className={styles.dialogDescription} id={descriptionId}>
            La fiche sera créée, Max sera assigné comme coach principal et une
            invitation sécurisée sera préparée pour ce courriel.
          </p>
        </header>

        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>
            <span className={styles.label}>Prénom</span>
            <input
              autoComplete="given-name"
              autoFocus
              className={styles.input}
              disabled={busy}
              maxLength={80}
              name="firstName"
              onChange={(event) =>
                setValues((current) => ({ ...current, firstName: event.target.value }))
              }
              required
              value={values.firstName}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Nom</span>
            <input
              autoComplete="family-name"
              className={styles.input}
              disabled={busy}
              maxLength={80}
              name="lastName"
              onChange={(event) =>
                setValues((current) => ({ ...current, lastName: event.target.value }))
              }
              required
              value={values.lastName}
            />
          </label>

          <label className={styles.fieldWide}>
            <span className={styles.label}>Courriel du client</span>
            <input
              autoComplete="email"
              className={styles.input}
              disabled={busy}
              inputMode="email"
              maxLength={254}
              name="email"
              onChange={(event) =>
                setValues((current) => ({ ...current, email: event.target.value }))
              }
              required
              type="email"
              value={values.email}
            />
            <p className={styles.fieldHint}>
              Ce courriel servira à l’activation et aux futurs codes de connexion.
            </p>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Langue</span>
            <select
              className={styles.select}
              disabled={busy}
              name="locale"
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  locale: event.target.value as "fr" | "en",
                }))
              }
              value={values.locale}
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Fuseau horaire</span>
            <select
              className={styles.select}
              disabled={busy}
              name="timezone"
              onChange={(event) =>
                setValues((current) => ({ ...current, timezone: event.target.value }))
              }
              value={values.timezone}
            >
              <option value="America/Toronto">Est — Montréal/Toronto</option>
              <option value="America/Winnipeg">Centre — Winnipeg</option>
              <option value="America/Edmonton">Rocheuses — Edmonton</option>
              <option value="America/Vancouver">Pacifique — Vancouver</option>
              <option value="America/Halifax">Atlantique — Halifax</option>
            </select>
          </label>

          {error ? (
            <p aria-live="assertive" className={styles.formError} role="alert">
              {error}
            </p>
          ) : null}

          <div className={styles.formActions}>
            <button
              className={styles.buttonSecondary}
              disabled={busy}
              onClick={onClose}
              type="button"
            >
              Annuler
            </button>
            <button className={styles.button} disabled={busy} type="submit">
              {busy ? "Création…" : "Créer et inviter"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

