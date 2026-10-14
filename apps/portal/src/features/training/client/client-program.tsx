"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/fe/app-shell";
import { Feedback, Loading } from "@/components/fe/feedback";
import { requestClientLogout } from "@/features/client/auth/request-client-logout";
import { publicationResponseSchema, type ProgramPublication } from "@/lib/contracts/training-publication";
import type { DraftExercise } from "@/lib/contracts/training-drafts";
import styles from "./client-program.module.css";

function useProgram() {
  const [program, setProgram] = useState<ProgramPublication | null>(null);
  const [loading, setLoading] = useState(true); const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; let controller: AbortController | null = null; let timeout: ReturnType<typeof setTimeout>;
    async function load() {
      controller?.abort(); clearTimeout(timeout); controller = new AbortController();
      const request = controller; timeout = setTimeout(() => request.abort(), 8000);
      setLoading(true); setFailed(false);
      try {
        const response = await fetch("/api/v1/client/program", { cache: "no-store", signal: request.signal });
        if ([401,403].includes(response.status)) { setProgram(null); window.location.replace("/client-login"); return; }
        if (!response.ok) throw new Error("LOAD");
        const data = publicationResponseSchema.parse((await response.json()).data);
        if (active && controller === request) setProgram(data.program);
      } catch { if (active && controller === request) { setProgram(null); setFailed(true); } }
      finally { if (active && controller === request) { setLoading(false); clearTimeout(timeout); } }
    }
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    void load(); document.addEventListener("visibilitychange", visible);
    return () => { active = false; controller?.abort(); clearTimeout(timeout); document.removeEventListener("visibilitychange", visible); };
  }, [attempt]);
  return { program, loading, failed, retry: () => setAttempt((n) => n+1) };
}
export function ClientProgramAction({ french = true }: { french?: boolean }) {
  const { program, loading, failed, retry } = useProgram();
  return <section aria-label={french ? "Ton programme" : "Your program"}>
    {loading ? <Loading>{french ? "Vérification de ton programme…" : "Checking your program…"}</Loading>
      : failed ? <><Feedback>{french ? "Impossible de vérifier ton programme. Réessaie avec une connexion disponible." : "Unable to check your program. Retry when connected."}</Feedback><button className="fe-button" type="button" onClick={retry}>{french ? "Réessayer le programme" : "Retry program"}</button></>
      : program ? <><h2>{program.document.title[french ? "fr" : "en"] || program.document.title.fr || program.document.title.en}</h2><p>{french ? "Ton coach a publié ton plan. Consulte tes semaines et tes séances." : "Your coach published your plan. Review your weeks and sessions."}</p><Link className="fe-button fe-button-primary" href="/client/program">{french ? "Voir mon programme" : "View my program"}</Link></>
      : <p>{french ? "Ton programme est en préparation. Il apparaîtra ici lorsque ton coach le publiera; aucune séance à compléter ici pour le moment." : "Your program is being prepared. It will appear here when your coach publishes it; there are no sessions to complete here yet."}</p>}
  </section>;
}
export function ClientProgram() {
  const { program, loading, failed, retry } = useProgram();
  const [weekIndex, setWeekIndex] = useState(0); const [french, setFrench] = useState(true);
  const [logoutError, setLogoutError] = useState(false); const [signingOut, setSigningOut] = useState(false);
  const text = (value: { fr: string; en: string }) => value[french ? "fr" : "en"] || value.fr || value.en;
  const week = program?.document.weeks[Math.min(weekIndex, program.document.weeks.length-1)];
  async function logout() {
    setSigningOut(true); setLogoutError(false);
    if (!await requestClientLogout((url) => window.location.replace(url))) { setSigningOut(false); setLogoutError(true); }
  }
  return <AppShell space="client" current="program" locale={french ? "fr" : "en"} accountAction={<button className="fe-button" type="button" disabled={signingOut} onClick={() => void logout()}>{french ? "Se déconnecter" : "Sign out"}</button>}>
    <div className={styles.page}>
      <p className="fe-kicker">TRAINING · {french ? "PLAN PUBLIÉ" : "PUBLISHED PLAN"}</p>
      <h1 className="fe-title">{french ? "Mon programme." : "My program."}</h1>
      <button className="fe-button" type="button" onClick={() => setFrench(!french)}>{french ? "English" : "Français"}</button>
      {logoutError ? <Feedback>{french ? "Déconnexion impossible. Réessaie." : "Unable to sign out. Try again."}</Feedback> : null}
      {loading ? <Loading>{french ? "Chargement du programme…" : "Loading program…"}</Loading> : failed ? <Feedback>{french ? "Ton programme n’a pas pu être chargé. Vérifie ta connexion et réessaie." : "Your program could not be loaded. Check your connection and retry."}</Feedback> : !program ? <p>{french ? "Ton coach n’a pas encore publié de programme. Reviens ici après sa publication." : "Your coach has not published a program yet. Come back once it is published."}</p> : <>
        <h2>{text(program.document.title)}</h2><p>{french ? "Publication" : "Publication"} {program.revision} · {program.document.weeks.length} {french ? "semaine(s)" : "week(s)"}</p>
        <p>{french ? "Consulte ici le plan de ton coach. La saisie des résultats d’entraînement sera disponible dans une prochaine étape." : "Review your coach’s plan here. Workout result tracking will be available in a later step."}</p>
        <nav className={styles.weeks} aria-label={french ? "Semaines du programme" : "Program weeks"}>{program.document.weeks.map((w,i) => <button key={w.number} className="fe-button" type="button" aria-pressed={w===week} onClick={() => setWeekIndex(i)}>{french ? "Semaine" : "Week"} {w.number}</button>)}</nav>
        {week ? <section aria-label={`${french ? "Semaine" : "Week"} ${week.number}`}><h2>{text(week.objective)}</h2>
          {week.sessions.map((session) => <article className={styles.session} key={session.id}>
            <h3>{text(session.title)}</h3>
            <p>{session.required ? (french ? "Obligatoire" : "Required") : (french ? "Optionnelle" : "Optional")} · {session.schedule.mode === "flexible" ? (french ? "Jour flexible" : "Flexible day") : `${session.schedule.mode === "fixed" ? (french ? "Jour fixe" : "Fixed day") : (french ? "Jour suggéré" : "Suggested day")} : ${(french ? ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"] : ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"])[(session.schedule.day ?? 1)-1]}`}</p>
            {session.type === "complete-rest" ? <p>{french ? "Repos complet" : "Complete rest"}</p> : null}
            <p>{text(session.warmup)}</p>
            {session.blocks.map((block) => <section className={styles.block} key={block.id}>
              <h4>{text(block.label) || (french ? "Bloc" : "Block")} · {block.mode}</h4>
              {block.mode !== "standard" ? <p>{french ? "Repos après le tour" : "Rest after round"} : {block.restSeconds} s</p> : null}
              {block.exercises.map((exercise) => <div className={styles.exercise} key={exercise.id}>
                <h5>{exercise.name}</h5><p>{text(exercise.cue)}</p>
                {Array.from({length:exercise.prescription.sets},(_,i) => <p key={i}><strong>{french ? "Série" : "Set"} {i+1}</strong> · <Prescription value={exercise.prescription.prescribedSets?.[i] ?? exercise.prescription} french={french} /></p>)}
              </div>)}
            </section>)}
          </article>)}
        </section> : null}
      </>}
      <button className="fe-button" type="button" disabled={loading} onClick={retry}>{french ? "Actualiser le programme" : "Refresh program"}</button>
    </div>
  </AppShell>;
}
function Prescription({ value, french }: { value: Omit<DraftExercise["prescription"],"sets"|"prescribedSets">; french: boolean }) {
  return <>{value.reps} {french ? "répétitions" : "reps"} · RIR {value.targetRir} · {french ? "Repos" : "Rest"} {value.restSeconds} s{value.tempo ? ` · Tempo ${value.tempo}` : ""} · {french ? "Charge / cible" : "Load / target"} : {value.loadTarget || "—"} ({value.unit})</>;
}
