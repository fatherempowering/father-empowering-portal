"use client";

import { useId, useState, type FormEvent } from "react";
import type { CreateClientFormValues } from "../model";
import { Modal } from "@/components/fe/modal";
import { Feedback } from "@/components/fe/feedback";
import { Icon } from "@/components/fe/icon";
import { TimezoneField } from "@/components/fe/timezone-field";

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
  const emailId = useId();
  const [values, setValues] = useState(initialValues);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy) await onSubmit(values);
  }
  return (
    <Modal
      open={open}
      busy={busy}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={descriptionId}
    >
      <header className="fe-dialog-header">
        <div>
          <p className="fe-kicker">Nouvelle relation</p>
          <h2 id={titleId}>Inviter un client</h2>
          <p className="fe-intro" id={descriptionId}>
            Crée sa fiche et prépare son accès au portail.
          </p>
        </div>
        <button
          className="fe-icon-button"
          type="button"
          aria-label="Fermer le formulaire"
          onClick={onClose}
          disabled={busy}
        >
          <Icon name="close" />
        </button>
      </header>
      <form
        className="fe-form fe-dialog-content"
        onSubmit={submit}
        aria-busy={busy}
      >
        <div className="fe-two-fields">
          <label className="fe-field">
            Prénom
            <input
              autoComplete="given-name"
              data-autofocus
              disabled={busy}
              maxLength={80}
              name="firstName"
              value={values.firstName}
              onChange={(event) =>
                setValues({ ...values, firstName: event.target.value })
              }
              required
            />
          </label>
          <label className="fe-field">
            Nom
            <input
              autoComplete="family-name"
              disabled={busy}
              maxLength={80}
              name="lastName"
              value={values.lastName}
              onChange={(event) =>
                setValues({ ...values, lastName: event.target.value })
              }
              required
            />
          </label>
        </div>
        <div className="fe-field">
          <label htmlFor={emailId}>Courriel du client</label>
          <input
            id={emailId}
            autoComplete="email"
            disabled={busy}
            maxLength={254}
            name="email"
            type="email"
            value={values.email}
            onChange={(event) =>
              setValues({ ...values, email: event.target.value })
            }
            required
            aria-describedby={`${emailId}-hint`}
          />
          <p className="fe-hint" id={`${emailId}-hint`}>
            Il recevra son invitation et ses codes de connexion à cette adresse.
          </p>
        </div>
        <label className="fe-field">
          Langue du portail
          <select
            name="locale"
            disabled={busy}
            value={values.locale}
            onChange={(event) =>
              setValues({
                ...values,
                locale: event.target.value as "fr" | "en",
              })
            }
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </label>
        <TimezoneField
          value={values.timezone}
          onChange={(timezone) => setValues({ ...values, timezone })}
          disabled={busy}
        />
        <p className="fe-form-summary">
          Le client deviendra actif après avoir ouvert son invitation et validé
          son code courriel.
        </p>
        {error ? <Feedback>{error}</Feedback> : null}
        <div className="fe-form-actions">
          <button
            className="fe-button"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Annuler
          </button>
          <button
            className="fe-button fe-button-primary"
            type="submit"
            disabled={busy}
          >
            {busy ? "Création…" : "Créer et inviter"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
