"use client";

import { useState } from "react";
import { WheelPicker } from "@/components/fe/wheel-picker";
import { convertMeasurement, formatMeasurement, parseMeasurement, type MeasurementKind, type MeasurementUnit } from "@/lib/onboarding/measurement-values";
import { displayOnboardingText } from "@/lib/onboarding/answer-display";
import styles from "./onboarding.module.css";

const range = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => min + i);
const CENTIMETRES = range(30, 300);
const FEET = range(1, 10);
const INCHES = range(0, 11);
const KILOGRAMS = range(1, 700);
const POUNDS = range(1, 1543);
const TENTHS = range(0, 9);

export function MeasurementPicker({ kind, value, onChange, french, disabled }: {
  kind: MeasurementKind; value: string | null; onChange(value: string | null): void; french: boolean; disabled: boolean;
}) {
  const parsed = parseMeasurement(value, kind);
  const [unit, setUnit] = useState<MeasurementUnit>(parsed?.unit ?? "imperial");
  const [manual, setManual] = useState(false);
  const t = (fr: string, en: string) => french ? fr : en;
  const converted = parsed ? convertMeasurement(parsed.amount, kind, parsed.unit, unit) : null;
  const rounded = converted === null ? null : kind === "height" ? Math.round(converted) : Math.round(converted * 10) / 10;
  const whole = rounded === null ? null : Math.floor(rounded);
  const fraction = rounded === null ? null : Math.round((rounded - Math.floor(rounded)) * 10);
  const label = kind === "height" ? t("Taille", "Height") : t("Poids", "Weight");
  const emptyLabel = "—";
  const change = (amount: number | null) => onChange(amount === null ? null : formatMeasurement(amount, kind, unit));
  const display = (answer: string) => displayOnboardingText(kind === "height" ? "height" : "currentBodyweight", answer, french);

  return <fieldset className={styles.measurement} disabled={disabled}>
    <legend className="fe-sr-only">{label} {t("(obligatoire)", "(required)")}</legend>
    <div className={styles.unitSwitch} role="group" aria-label={t(`Unités — ${label.toLowerCase()}`, `${label} units`)}>
      <button type="button" aria-pressed={unit === "imperial"} onClick={() => setUnit("imperial")}>{t("Impérial", "Imperial")} · {kind === "height" ? t("pi / po", "ft / in") : "lb"}</button>
      <button type="button" aria-pressed={unit === "metric"} onClick={() => setUnit("metric")}>{t("Métrique", "Metric")} · {kind === "height" ? "cm" : "kg"}</button>
    </div>
    {!manual && <div className={styles.wheels}>
      {kind === "height" ? unit === "metric"
        ? <WheelPicker required label={t("Centimètres", "Centimetres")} values={CENTIMETRES} value={rounded} disabled={disabled} emptyLabel={emptyLabel} onChange={change} />
        : <><WheelPicker required label={t("Pieds", "Feet")} values={FEET} value={rounded === null ? null : Math.floor(rounded / 12)} disabled={disabled} emptyLabel={emptyLabel} onChange={(feet) => change(feet === null ? null : feet * 12 + (rounded === null ? 0 : rounded % 12))} />
          <WheelPicker label={t("Pouces", "Inches")} values={INCHES} value={rounded === null ? null : rounded % 12} disabled={disabled || rounded === null} emptyLabel={emptyLabel} onChange={(inches) => change(inches === null || rounded === null ? null : Math.floor(rounded / 12) * 12 + inches)} /></>
        : <><WheelPicker required label={unit === "metric" ? t("Kilogrammes", "Kilograms") : t("Livres", "Pounds")} values={unit === "metric" ? KILOGRAMS : POUNDS} value={whole} disabled={disabled} emptyLabel={emptyLabel} onChange={(amount) => change(amount === null ? null : amount + (fraction ?? 0) / 10)} />
          <WheelPicker label={t("Décimales", "Decimals")} values={TENTHS} value={fraction} disabled={disabled || whole === null} emptyLabel={emptyLabel} format={(n) => `${french ? "," : "."}${n}`} onChange={(tenth) => change(tenth === null || whole === null ? null : whole + tenth / 10)} /></>}
    </div>}
    {manual && <label className={styles.field}>{t(`${label} avec unité`, `${label} with unit`)}<input type="text" maxLength={120} value={value ?? ""} placeholder={kind === "height" ? "180 cm / 5 ft 11 in" : "80 kg / 176 lb"} onChange={(event) => onChange(event.target.value.trim() ? event.target.value : null)} /></label>}
    <p className={styles.measurementValue} aria-live="polite">{value ? t("Réponse : ", "Answer: ") + display(value) : t("Aucune valeur choisie", "No value selected")}{parsed && parsed.unit !== unit ? ` ≈ ${display(formatMeasurement(converted!, kind, unit))}` : ""}</p>
    {value && !parsed && <p>{t("Ta réponse existante est conservée telle quelle. Utilise les rouleaux seulement si tu veux la remplacer.", "Your existing answer is kept unchanged. Use the wheels only if you want to replace it.")}</p>}
    <small>{t("Fais défiler les rouleaux, touche une valeur ou utilise les flèches du clavier.", "Scroll the wheels, tap a value or use the keyboard arrows.")}</small>
    {rounded === null && (kind === "weight" || unit === "imperial") && <small>{t("Commence par le rouleau de gauche, puis précise celui de droite.", "Choose the left wheel first, then adjust the right one.")}</small>}
    <button type="button" className={styles.questionLink} onClick={() => setManual((current) => !current)}>{manual ? t("Utiliser les rouleaux", "Use wheels") : t("Saisir autrement", "Enter another way")}</button>
  </fieldset>;
}
