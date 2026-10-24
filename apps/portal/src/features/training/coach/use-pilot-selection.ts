"use client";

import { useEffect, useRef, useState } from "react";
import { exerciseSnapshotSchema, type ExerciseSnapshot } from "@/lib/contracts/training";

export function usePilotSelection(onAdd: (exercise: ExerciseSnapshot) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const receipts = useRef(new Map<string, string>());
  const inFlight = useRef(false);
  const active = useRef(true);
  const request = useRef<AbortController | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; request.current?.abort(); }; }, []);
  async function select(source: { id: string; sourceVersion: string }) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    const sourceKey = `${source.id}@${source.sourceVersion}`;
    const clientMutationId = receipts.current.get(sourceKey) ?? crypto.randomUUID();
    receipts.current.set(sourceKey, clientMutationId);
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("/api/v1/coach/exercise-pilot/select", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ sourceId: source.id, sourceVersion: source.sourceVersion, clientMutationId }), signal: controller.signal,
      });
      if (!active.current) return;
      if (response.status === 401) { window.location.replace("/login"); return; }
      if ([403, 404, 409].includes(response.status)) {
        setError("Cet exercice ne peut pas être ajouté dans cet environnement. Le lot est réservé aux tests staging autorisés. Ton brouillon est conservé."); return;
      }
      if (!response.ok) throw new Error("SELECTION_FAILED");
      const exercise = exerciseSnapshotSchema.parse((await response.json()).data?.exercise);
      if (!exercise.pilot || exercise.pilot.sourceId !== source.id || exercise.pilot.sourceVersion !== source.sourceVersion ||
          exercise.pilot.usage !== "STAGING_TEST" || exercise.archived || exercise.canEdit) throw new Error("SELECTION_MISMATCH");
      if (active.current) onAdd(exercise);
    } catch {
      if (active.current) setError("L’ajout n’a pas été confirmé. Réessaie avec le même exercice : aucun doublon ne sera créé dans la banque. Ton brouillon est conservé.");
    } finally {
      clearTimeout(timeout); inFlight.current = false; if (active.current) setBusy(false);
    }
  }
  return { busy, error, select };
}
