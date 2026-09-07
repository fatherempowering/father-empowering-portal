"use client";

import { useId, useState } from "react";
import { Icon } from "./icon";

export function PasswordField() {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="fe-field">
      <label htmlFor={id}>Mot de passe</label>
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
          aria-label={
            visible ? "Masquer le mot de passe" : "Afficher le mot de passe"
          }
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          <Icon name={visible ? "eye-off" : "eye"} />
        </button>
      </div>
    </div>
  );
}
