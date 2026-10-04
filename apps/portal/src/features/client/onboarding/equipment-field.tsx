"use client";

import { useRef } from "react";
import { NO_EQUIPMENT_ANSWER } from "@/lib/onboarding/answer-display";
import styles from "./onboarding.module.css";

export function EquipmentField({ id, label, value, french, onChange }: {
  id: string; label: string; value: string | null; french: boolean; onChange(value: string | null): void;
}) {
  const none = value === NO_EQUIPMENT_ANSWER;
  const previousDescription = useRef<string | null>(none ? null : value);
  return <fieldset className={styles.equipment} data-question="availableEquipment">
    <legend>{label}</legend>
    <label className={styles.noneEquipment}><input type="checkbox" checked={none} onChange={(event) => {
      if (event.target.checked) { previousDescription.current = value; onChange(NO_EQUIPMENT_ANSWER); }
      else onChange(previousDescription.current);
    }} />{french ? "Non applicable — aucun équipement à la maison" : "Not applicable — no equipment at home"}</label>
    {!none && <div className={styles.field}>
      <label htmlFor={id}>{french ? "Équipement disponible" : "Available equipment"}</label>
      <textarea id={id} maxLength={1500} value={value ?? ""} onChange={(event) => onChange(event.target.value.trim() ? event.target.value : null)} aria-describedby={`${id}-hint`} />
      <small id={`${id}-hint`}>{french ? "Par exemple : salle complète, rack et haltères, ou bandes élastiques." : "For example: full gym, rack and dumbbells, or resistance bands."}</small>
    </div>}
  </fieldset>;
}
