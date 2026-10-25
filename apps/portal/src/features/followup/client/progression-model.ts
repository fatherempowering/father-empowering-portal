import type { CheckInMeasurements, ClientProgression } from "@/lib/contracts/client-followup";

export const MEASUREMENT_FIELDS = ["bodyWeightLb", "waistIn", "chestIn", "hipsIn", "leftArmIn", "rightArmIn", "leftThighIn", "rightThighIn", "leftCalfIn", "rightCalfIn"] as const;
export type MeasurementKey = typeof MEASUREMENT_FIELDS[number];
export const MEASUREMENT_LABELS: Record<MeasurementKey, [string, string]> = {
  bodyWeightLb: ["Poids", "Weight"], waistIn: ["Tour de taille", "Waist"], chestIn: ["Poitrine", "Chest"], hipsIn: ["Hanches", "Hips"],
  leftArmIn: ["Bras gauche", "Left arm"], rightArmIn: ["Bras droit", "Right arm"], leftThighIn: ["Cuisse gauche", "Left thigh"], rightThighIn: ["Cuisse droite", "Right thigh"], leftCalfIn: ["Mollet gauche", "Left calf"], rightCalfIn: ["Mollet droit", "Right calf"],
};
export type MeasurementObservation = { id: string; recordedAt: string; submittedAt: string; source: "WEEK_ZERO" | "CHECK_IN"; measurements: CheckInMeasurements };
export function progressionObservations(data: ClientProgression): MeasurementObservation[] {
  return [
    // Week Zero has a submission timestamp, not an observation time. Use its UTC calendar day.
    ...(data.baseline ? [{ id: "week-zero", recordedAt: new Date(data.baseline.recordedAt).toISOString().slice(0, 10), submittedAt: data.baseline.recordedAt, source: "WEEK_ZERO" as const, measurements: data.baseline.measurements }] : []),
    ...data.checkIns.map(item => ({ id: item.id, recordedAt: item.document.observedOn, submittedAt: item.submittedAt, source: "CHECK_IN" as const, measurements: item.document.measurements })),
  ].sort((a, b) => observationTime(a.recordedAt) - observationTime(b.recordedAt) || Date.parse(a.submittedAt) - Date.parse(b.submittedAt) || a.id.localeCompare(b.id));
}
export function observationTime(value: string) {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12);
}
export function toDisplayMeasurement(value: number, key: MeasurementKey, metric: boolean) { return metric ? key === "bodyWeightLb" ? value * 0.45359237 : value * 2.54 : value; }
export function fromDisplayMeasurement(value: number, key: MeasurementKey, metric: boolean) {
  return Number((metric ? key === "bodyWeightLb" ? value / 0.45359237 : value / 2.54 : value).toFixed(6));
}
export function measurementUnit(key: MeasurementKey, metric: boolean) { return key === "bodyWeightLb" ? metric ? "kg" : "lb" : metric ? "cm" : "in"; }
export function measuredValues(observations: MeasurementObservation[], key: MeasurementKey, metric: boolean) {
  return observations.flatMap(observation => {
    const value = observation.measurements[key];
    return value === null ? [] : [{ ...observation, value: toDisplayMeasurement(value, key, metric), time: observationTime(observation.recordedAt) }];
  });
}
export function weightChartGeometry(points: { value: number; time: number }[]) {
  if (points.length < 2 || !points.every(point => Number.isFinite(point.value) && Number.isFinite(point.time))) return null;
  const first = Math.min(...points.map(point => point.time)), last = Math.max(...points.map(point => point.time));
  if (first === last) return null;
  const low = Math.min(...points.map(point => point.value)), high = Math.max(...points.map(point => point.value));
  const padding = Math.max((high - low) * .1, .5), min = low - padding, max = high + padding;
  const coordinates = points.map(point => ({ x: 58 + (point.time - first) / (last - first) * 540, y: 24 + (max - point.value) / (max - min) * 170 }));
  const path = coordinates.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  return { coordinates, min, max, first, last, path, fill: `${path} L${coordinates.at(-1)!.x},194 L${coordinates[0].x},194 Z` };
}
