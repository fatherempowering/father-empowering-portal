"use client";

import { UiText, useUiCopy } from "@/components/fe/ui-text";
import { useId, useState } from "react";
import { Icon } from "./icon";

export function PasswordField() {
  const c = useUiCopy();
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="fe-field">
      <label htmlFor={id}><UiText>Mot de passe</UiText></label>
      <div className="fe-password">
        <input
          id={id}
          name="password"
          type={visible ? "text" : "password"}
          autoComplete="current-password"
          minLength={8}
          required
        />
        <button
          className="fe-icon-button"
          type="button"
          aria-label={c(visible ? "Masquer le mot de passe" : "Afficher le mot de passe")}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          <Icon name={visible ? "eye-off" : "eye"} />
        </button>
      </div>
    </div>
  );
}
