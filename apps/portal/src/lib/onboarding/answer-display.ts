import { parseMeasurement } from "./measurement-values";

// Remains a text answer in the V1 contract; no new database field or option enum.
export const NO_EQUIPMENT_ANSWER = "Non applicable — aucun équipement à la maison.";

export function displayOnboardingText(key: string, value: string, french: boolean): string {
  if (key === "availableEquipment" && value === NO_EQUIPMENT_ANSWER) {
    return french ? NO_EQUIPMENT_ANSWER : "Not applicable — no equipment at home.";
  }
  if (!french || (key !== "height" && key !== "currentBodyweight")) return value;
  const kind = key === "height" ? "height" : "weight";
  const parsed = parseMeasurement(value, kind);
  if (!parsed) return value;
  const number = (value: number) => String(value).replace(".", ",");
  if (kind === "height" && parsed.unit === "imperial") {
    return `${Math.floor(parsed.amount / 12)} pi ${number(Math.round((parsed.amount % 12) * 100) / 100)} po`;
  }
  return `${number(parsed.amount)} ${kind === "height" ? "cm" : parsed.unit === "metric" ? "kg" : "lb"}`;
}
