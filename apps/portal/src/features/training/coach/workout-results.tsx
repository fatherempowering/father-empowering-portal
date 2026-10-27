"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/fe/app-shell";
import { PublishedExerciseGuidance } from "@/features/training/shared/published-exercise-guidance";
import { publishedExerciseName, repetitionLabel } from "@/lib/training/workout-presentation";
import { Feedback, Loading } from "@/components/fe/feedback";
import { workoutListSchema, workoutSessionResponseSchema, type WorkoutSnapshot, type WorkoutListItem } from "@/lib/contracts/training-results";
import { publicationResponseSchema } from "@/lib/contracts/training-publication";
import { z } from "zod";
import styles from "./workout-results.module.css";
type Results = z.infer<typeof workoutListSchema>;

export function CoachWorkoutResults({ clientId }: { clientId: string }) {
  const [results, setResults] = useState<Results | null>(null);
  const [publication, setPublication] = useState<z.infer<typeof publicationResponseSchema> | null>(null);
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      controller?.abort(); clearTimeout(timer);
      controller = new AbortController(); const request = controller;
      timer = setTimeout(() => request.abort(), 8_000);
      setLoading(true); setFailed(false); setDenied(false); setResults(null); setPublication(null);
      try {
        const responses = await Promise.all([
          fetch(`/api/v1/coach/clients/${encodeURIComponent(clientId)}/workouts?page=${page}`, { cache:"no-store", signal:request.signal }),
          fetch(`/api/v1/coach/clients/${encodeURIComponent(clientId)}/program`, { cache:"no-store", signal:request.signal }),
        ]);
        if (!active || controller !== request) return;
        if (responses.some(r=>r.status === 401)) { window.location.replace("/login"); return; }
        if (responses.some(r=>r.status === 403)) { window.location.replace("/verify-email"); return; }
        if (responses.some(r=>r.status === 404)) { setDenied(true); return; }
        if (responses.some(r=>!r.ok)) throw new Error("LOAD");
        const list = workoutListSchema.parse((await responses[0].json()).data);
        const current = publicationResponseSchema.parse((await responses[1].json()).data);
        if (active && controller === request) { setResults(list); setPublication(current); }
      } catch { if (active && controller === request) setFailed(true); }
      finally { if (active && controller === request) { clearTimeout(timer); setLoading(false); } }
    }
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    const focused = () => void load();
    void load(); document.addEventListener("visibilitychange", visible); window.addEventListener("focus", focused);
    return () => { active=false; controller?.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange",visible); window.removeEventListener("focus",focused); };
  }, [clientId,page,attempt]);
  return <AppShell space="coach" current="clients"><div className={styles.page}>
    <Link className="fe-button" href={`/coach/clients/${encodeURIComponent(clientId)}`}>Retour au dossier client</Link>
    <h1 className="fe-title">Entraînements et résultats.</h1>
    <p>Les résultats sont ceux enregistrés par le client. Chaque séance conserve la prescription de la publication suivie.</p>
    <button className="fe-button" type="button" disabled={loading} onClick={()=>setAttempt(n=>n+1)}>Actualiser les résultats</button>
    {loading ? <Loading>Chargement des entraînements…</Loading> : denied ? <Feedback>Ce suivi est inaccessible. Vérifie que le client est actif et t’est toujours assigné.</Feedback> : failed ? <Feedback>Impossible de charger les résultats. Vérifie ta connexion puis actualise; cette erreur ne signifie pas qu’il n’y a aucune séance.</Feedback> : results && publication ? <>
      <section className={styles.card}><h2>Programme actuellement publié</h2>
        {publication.program ? <p>{publication.program.document.title.fr || publication.program.document.title.en} · Publication {publication.program.revision}</p> : <p>Aucun programme publié pour ce client.</p>}
        <Link className="fe-button" href="/coach/programs">Créer ou modifier un programme</Link>
        <p>Enregistre tes changements puis publie une nouvelle version pour ce client. Le brouillon seul ne modifie pas son plan; les résultats passés ne sont jamais réécrits.</p>
      </section>
      <h2>Historique des séances</h2>
      {!results.total ? <p>Aucune séance enregistrée par ce client pour le moment.</p> : null}
      {results.items.map(workout=><article key={workout.id} className={styles.card}>
        <h3>{workout.session.title.fr || workout.session.title.en}</h3>
        <p>{workout.programTitle.fr || workout.programTitle.en} · Publication {workout.publicationRevision} · Semaine {workout.weekNumber}</p>
        <p><strong>{workout.status === "COMPLETED" ? "Séance terminée" : "Séance en cours"}</strong> · Dernier enregistrement : <time dateTime={workout.updatedAt}>{new Date(workout.updatedAt).toLocaleString("fr-CA")}</time></p>
        {publication.program && workout.publicationId !== publication.program.id ? <p>Cette séance appartient à une publication précédente, conservée dans l’historique.</p> : null}
        <WorkoutDetails key={`${workout.id}:${workout.version}`} clientId={clientId} item={workout} />
      </article>)}
      <nav className={styles.actions} aria-label="Pages des résultats">
        <button className="fe-button" type="button" disabled={!page} onClick={()=>setPage(n=>n-1)}>Résultats précédents</button>
        <span>Page {page+1} · {results.total} séance(s)</span>
        <button className="fe-button" type="button" disabled={(page+1)*20>=results.total} onClick={()=>setPage(n=>n+1)}>Résultats suivants</button>
      </nav>
    </> : null}
  </div></AppShell>;
}

function WorkoutDetails({ clientId, item }: { clientId: string; item: WorkoutListItem }) {
  const [workout, setWorkout] = useState<WorkoutSnapshot | null>(null);
  const [opened, setOpened] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController(); let active = true;
    const timer = setTimeout(() => controller.abort(), 8_000);
    setWorkout(null); setFailed(false);
    void (async () => {
      try {
        const query = new URLSearchParams({ publicationId:item.publicationId,weekNumber:String(item.weekNumber),sessionId:item.sessionId });
        const response = await fetch(`/api/v1/coach/clients/${encodeURIComponent(clientId)}/workouts/session?${query}`, { cache:"no-store",signal:controller.signal });
        if (response.status === 401) { window.location.replace("/login"); return; }
        if (response.status === 403) { window.location.replace("/verify-email"); return; }
        if (!response.ok) throw new Error("LOAD");
        const data = workoutSessionResponseSchema.parse((await response.json()).data);
        if (!data.workout || data.workout.id !== item.id || data.publication.clientId !== clientId) throw new Error("MISMATCH");
        if (active) setWorkout(data.workout);
      } catch { if (active) setFailed(true); }
      finally { clearTimeout(timer); }
    })();
    return () => { active=false;clearTimeout(timer);controller.abort(); };
  }, [opened,attempt,clientId,item.id,item.publicationId,item.weekNumber,item.sessionId]);
  return <div>
    <button className="fe-button" type="button" aria-expanded={opened} onClick={()=>setOpened(value=>!value)}>{opened ? "Masquer les résultats" : "Voir la prescription et les résultats"}</button>
    {opened ? failed ? <><Feedback>Impossible de charger cette séance. Aucun résultat n’a été modifié.</Feedback><button className="fe-button" type="button" onClick={()=>setAttempt(n=>n+1)}>Réessayer cette séance</button></> : !workout ? <Loading>Chargement de la séance…</Loading> : <>
      {workout.session.blocks.flatMap(block=>block.exercises).map(exercise=><section key={exercise.id} className={styles.exercise}>
        <h4>{publishedExerciseName(exercise, true)}</h4>
        <PublishedExerciseGuidance exercise={exercise} french coach />
        <p>Prescription : {exercise.prescription.sets} séries · {exercise.prescription.reps} {exercise.pilot && exercise.pilot.performance.measure !== "repetitions" ? "passage(s)" : repetitionLabel(exercise, true).toLowerCase()} · cible {exercise.prescription.loadTarget || "—"} {exercise.prescription.unit === "configuration" ? "" : `(${exercise.prescription.unit === "distance" && exercise.pilot ? "m" : exercise.prescription.unit})`} · RIR {exercise.prescription.targetRir}</p>
        {exercise.prescription.prescribedSets?.map((set,index)=><p key={index}>Série prescrite {index+1} : {set.reps} {exercise.pilot && exercise.pilot.performance.measure !== "repetitions" ? "passage(s)" : repetitionLabel(exercise, true).toLowerCase()} · {set.loadTarget || "—"} {set.unit === "configuration" ? "" : `(${set.unit === "distance" && exercise.pilot ? "m" : set.unit})`} · RIR {set.targetRir}</p>)}
        {!workout.sets.some(s=>s.exerciseId===exercise.id) ? <p>Aucun résultat enregistré pour cet exercice.</p> : null}
        <ul>{workout.sets.filter(s=>s.exerciseId===exercise.id).map(set=><li key={set.setNumber}>
          Série {set.setNumber}{set.kind==="EXTRA" ? " · EXTRA" : ""} : {set.status==="DONE" ? `${set.reps === null ? "" : set.reps+" "+repetitionLabel(exercise, true).toLowerCase()+" · "}${set.unit === "configuration" ? "Configuration : " : `${set.load ?? "—"} ${set.unit === "distance" && exercise.pilot ? "m" : set.unit}`}${set.details ? (set.unit === "configuration" ? "" : " · ")+set.details : ""}${set.rir === null ? "" : " · RIR "+set.rir}` : set.status==="SKIPPED" ? "Non effectuée" : "À compléter"}
        </li>)}</ul>
      </section>)}
      {workout.note ? <p className={styles.note}><strong>Note du client :</strong> {workout.note}</p> : null}
    </> : null}
  </div>;
}
