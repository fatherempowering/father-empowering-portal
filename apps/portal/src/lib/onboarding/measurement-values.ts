export type MeasurementKind = "height" | "weight";
export type MeasurementUnit = "metric" | "imperial";
type Measurement = { amount: number; unit: MeasurementUnit };

/** Read old text answers without guessing a missing unit or rewriting stored data. */
export function parseMeasurement(value: string | null, kind: MeasurementKind): Measurement | null {
  if (!value) return null;
  const text = value.trim().toLowerCase().replace(/,/g, ".");
  if (kind === "height") {
    const metric = /^(\d+(?:\.\d+)?)\s*cm$/.exec(text);
    if (metric && Number(metric[1]) > 0) return { amount: Number(metric[1]), unit: "metric" };
    const imperial = /^(\d+)\s*(?:ft|pi|pieds?|['′])\s*(\d+(?:\.\d+)?)\s*(?:in|po|pouces?|["″])?$/.exec(text);
    if (imperial && Number(imperial[2]) < 12) {
      const amount = Number(imperial[1]) * 12 + Number(imperial[2]);
      if (amount > 0) return { amount, unit: "imperial" };
    }
  } else {
    const weight = /^(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs)$/.exec(text);
    if (weight && Number(weight[1]) > 0) return { amount: Number(weight[1]), unit: weight[2].startsWith("kg") ? "metric" : "imperial" };
  }
  return null;
}

export function convertMeasurement(amount: number, kind: MeasurementKind, from: MeasurementUnit, to: MeasurementUnit): number {
  if (from === to) return amount;
  const factor = kind === "height" ? 2.54 : 0.45359237;
  return from === "imperial" ? amount * factor : amount / factor;
}

export function formatMeasurement(amount: number, kind: MeasurementKind, unit: MeasurementUnit): string {
  if (kind === "height") {
    if (unit === "metric") return `${Math.round(amount)} cm`;
    const inches = Math.round(amount);
    return `${Math.floor(inches / 12)} ft ${inches % 12} in`;
  }
  return `${Math.round(amount * 10) / 10} ${unit === "metric" ? "kg" : "lb"}`;
}
