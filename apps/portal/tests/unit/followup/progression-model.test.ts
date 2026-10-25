import { describe, expect, it } from "vitest";
import { EMPTY_CHECK_IN_MEASUREMENTS, emptyCheckInDocument, type ClientProgression } from "@/lib/contracts/client-followup";
import { fromDisplayMeasurement, measuredValues, progressionObservations, toDisplayMeasurement, weightChartGeometry } from "@/features/followup/client/progression-model";

const empty = (): ClientProgression => ({ baseline: null, checkIns: [], checkInsTruncated: false, checkInsTotal: 0, completedWorkouts: { total: 0, dates: [], datesTruncated: false } });
describe("progression uses real observations without fabricated trends", () => {
  it("keeps missing measurements absent instead of manufacturing zero", () => {
    const data = empty(); data.baseline = { source: "WEEK_ZERO", recordedAt: "2026-10-01T12:00:00Z", measurements: { ...EMPTY_CHECK_IN_MEASUREMENTS, bodyWeightLb: 190 } };
    const observations = progressionObservations(data);
    expect(measuredValues(observations, "waistIn", false)).toEqual([]);
    expect(measuredValues(observations, "bodyWeightLb", false)[0]).toMatchObject({ source: "WEEK_ZERO", recordedAt: "2026-10-01", submittedAt: "2026-10-01T12:00:00Z", value: 190 });
    expect(weightChartGeometry(measuredValues(observations, "bodyWeightLb", false))).toBeNull();
  });
  it("orders same-day entries by actual submission time, not reverse API order", () => {
    const data = empty();
    data.checkIns = [
      { id: "later", clientId: "client", submittedAt: "2026-10-25T18:00:00Z", document: { ...emptyCheckInDocument("2026-10-25"), measurements: { ...EMPTY_CHECK_IN_MEASUREMENTS, bodyWeightLb: 180 } } },
      { id: "earlier", clientId: "client", submittedAt: "2026-10-25T10:00:00Z", document: { ...emptyCheckInDocument("2026-10-25"), measurements: { ...EMPTY_CHECK_IN_MEASUREMENTS, bodyWeightLb: 181 } } },
    ];
    const values = measuredValues(progressionObservations(data), "bodyWeightLb", false);
    expect(values.map(value => value.id)).toEqual(["earlier", "later"]);
    expect(values.at(-1)?.value).toBe(180);
    expect(values[0].time).toBe(values[1].time);
    expect(weightChartGeometry(values)).toBeNull();
  });
  it("keeps a later same-day check-in after Week Zero without inventing intraday time", () => {
    const data = empty();
    data.baseline = { source: "WEEK_ZERO", recordedAt: "2026-10-25T18:00:00Z", measurements: { ...EMPTY_CHECK_IN_MEASUREMENTS, bodyWeightLb: 214.5 } };
    data.checkIns = [{ id: "checkin", clientId: "client", submittedAt: "2026-10-25T21:00:00Z", document: { ...emptyCheckInDocument("2026-10-25"), measurements: { ...EMPTY_CHECK_IN_MEASUREMENTS, bodyWeightLb: 214 } } }];
    const values = measuredValues(progressionObservations(data), "bodyWeightLb", false);
    expect(values.map(value => value.id)).toEqual(["week-zero", "checkin"]);
    expect(values.at(-1)?.value).toBe(214);
    expect(values[0].time).toBe(values[1].time);
    expect(weightChartGeometry(values)).toBeNull();
    expect(data.baseline.recordedAt).toBe("2026-10-25T18:00:00Z");
  });
  it("uses the UTC calendar day for the Week Zero reference, independently of its timestamp offset", () => {
    const data = empty();
    data.baseline = { source: "WEEK_ZERO", recordedAt: "2026-10-24T23:30:00-04:00", measurements: { ...EMPTY_CHECK_IN_MEASUREMENTS, bodyWeightLb: 214.5 } };
    data.checkIns = [{ id: "checkin", clientId: "client", submittedAt: "2026-10-25T21:00:00Z", document: { ...emptyCheckInDocument("2026-10-25"), measurements: { ...EMPTY_CHECK_IN_MEASUREMENTS, bodyWeightLb: 214 } } }];
    const values = measuredValues(progressionObservations(data), "bodyWeightLb", false);
    expect(values[0].recordedAt).toBe("2026-10-25");
    expect(values[0].submittedAt).toBe("2026-10-24T23:30:00-04:00");
    expect(values[0].time).toBe(values[1].time);
    expect(weightChartGeometry(values)).toBeNull();
  });
  it("gives adjacent calendar days a full day of separation even for a late Week Zero submission", () => {
    const data = empty();
    data.baseline = { source: "WEEK_ZERO", recordedAt: "2026-10-25T23:30:00Z", measurements: { ...EMPTY_CHECK_IN_MEASUREMENTS, bodyWeightLb: 214.5 } };
    data.checkIns = [{ id: "next-day", clientId: "client", submittedAt: "2026-10-26T21:00:00Z", document: { ...emptyCheckInDocument("2026-10-26"), measurements: { ...EMPTY_CHECK_IN_MEASUREMENTS, bodyWeightLb: 214 } } }];
    const values = measuredValues(progressionObservations(data), "bodyWeightLb", false);
    expect(values[1].time - values[0].time).toBe(86400000);
    expect(weightChartGeometry(values)).not.toBeNull();
  });
  it("uses proportional date spacing and straight segments", () => {
    const geometry = weightChartGeometry([{ time: 0, value: 190 }, { time: 86400000, value: 188 }, { time: 864000000, value: 180 }])!;
    expect(geometry.coordinates[1].x - geometry.coordinates[0].x).toBeCloseTo(54);
    expect(geometry.coordinates[2].x - geometry.coordinates[1].x).toBeCloseTo(486);
    expect(geometry.path).toMatch(/^M.* L.* L/);
    expect(geometry.path).not.toMatch(/[CQ]/);
    expect(geometry.fill).toMatch(/,194 L.*194 Z$/);
  });
  it("handles equal weights without implying a goal or a zero baseline", () => {
    const geometry = weightChartGeometry([{ time: 0, value: 180 }, { time: 100, value: 180 }])!;
    expect(geometry.coordinates[0].y).toBe(geometry.coordinates[1].y);
    expect(geometry.min).toBe(179.5); expect(geometry.max).toBe(180.5);
    expect(weightChartGeometry([])).toBeNull();
    expect(weightChartGeometry([{ time: NaN, value: 180 }, { time: 1, value: 180 }])).toBeNull();
  });
  it("converts display units without mutating canonical observations", () => {
    expect(toDisplayMeasurement(100, "bodyWeightLb", true)).toBeCloseTo(45.359237);
    expect(fromDisplayMeasurement(45.359237, "bodyWeightLb", true)).toBe(100);
    expect(toDisplayMeasurement(14, "leftArmIn", true)).toBeCloseTo(35.56);
    expect(fromDisplayMeasurement(35.56, "leftArmIn", true)).toBe(14);
    expect(toDisplayMeasurement(14, "leftArmIn", false)).toBe(14);
  });
});
