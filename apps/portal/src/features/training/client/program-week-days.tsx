"use client";

import { useEffect, useRef, useState } from "react";
import type { ProgramPublication } from "@/lib/contracts/training-publication";
import { readProgramSelection, resolveProgramSelection, type ProgramSelection } from "@/lib/training/program-navigation";
import styles from "./program-week-days.module.css";

type Week = ProgramPublication["document"]["weeks"][number];
type Session = Week["sessions"][number];

function label(text: { fr: string; en: string }, french: boolean) {
  return text[french ? "fr" : "en"] || text.fr || text.en;
}

export function useProgramSelection(program: ProgramPublication | null) {
  const [requested, setRequested] = useState<ProgramSelection | null>(null);
  useEffect(() => {
    const read = () => setRequested(readProgramSelection(new URLSearchParams(window.location.search)));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const selection = program ? resolveProgramSelection(program, requested) : { week: undefined, session: undefined };
  function choose(weekNumber: number, sessionId?: string) {
    if (!program) return;
    const next = { publicationId: program.id, weekNumber, sessionId: sessionId ?? null };
    setRequested(next);
    const url = new URL(window.location.href);
    url.searchParams.set("publicationId", program.id);
    url.searchParams.set("weekNumber", String(weekNumber));
    if (sessionId) url.searchParams.set("sessionId", sessionId);
    else url.searchParams.delete("sessionId");
    window.history.replaceState(window.history.state, "", url);
  }
  return { ...selection, choose };
}

function dayLabel(session: Session, french: boolean) {
  if (session.schedule.mode === "flexible" || session.schedule.day === null) return french ? "À ton rythme" : "At your pace";
  const days = french
    ? ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
    : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return days[session.schedule.day - 1];
}

export function ProgramWeekDays({ program, week, session, french, choose, part = "all" }: {
  program: ProgramPublication;
  week: Week;
  session?: Session;
  french: boolean;
  choose(weekNumber: number, sessionId?: string): void;
  part?: "all" | "weeks" | "days";
}) {
  const weeksRef = useRef<HTMLDivElement>(null);
  const daysRef = useRef<HTMLDivElement>(null);
  // Scroll only the rail, never the page: the current choice stays visible
  // when returning from a workout, including with reduced motion enabled.
  useEffect(() => {
    for (const rail of [weeksRef.current, daysRef.current]) {
      const active = rail?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (!rail || !active) continue;
      const railBox = rail.getBoundingClientRect();
      const activeBox = active.getBoundingClientRect();
      if (activeBox.left < railBox.left) rail.scrollLeft -= railBox.left - activeBox.left;
      else if (activeBox.right > railBox.right) rail.scrollLeft += activeBox.right - railBox.right;
    }
  }, [week.number, session?.id]);
  const calendarDays = french ? ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const renderSession = (item: Session) => <button key={item.id} type="button" className={styles.day} aria-pressed={item.id === session?.id} onClick={() => choose(week.number, item.id)}>
    <small>{dayLabel(item, french)}{item.schedule.mode === "suggested" ? (french ? " · suggéré" : " · suggested") : ""}</small>
    <strong>{label(item.title, french)}</strong>
    <span>{item.type === "complete-rest" ? (french ? "Repos complet" : "Complete rest") : item.required ? (french ? "Séance prévue" : "Planned session") : (french ? "Optionnelle" : "Optional")}</span>
  </button>;
  return (
    <div className={styles.navigation}>
      {part !== "days" ? <div ref={weeksRef} className={`${styles.rail} ${styles.weeks}`} role="group" aria-label={french ? "Semaines du programme" : "Program weeks"}>
        <a className={styles.week} href="/client/week-zero"><strong>{french ? "Semaine" : "Week"} 0</strong><span>{french ? "Mon point de départ" : "My starting point"}</span><small>{french ? "Ouvrir" : "Open"}</small></a>
        {Array.from({ length: Math.max(14, ...program.document.weeks.map((item) => item.number)) }, (_, index) => index + 1).map((number) => {
          const item = program.document.weeks.find((candidate) => candidate.number === number);
          return item ? <button key={number} type="button" className={styles.week} aria-pressed={item.number === week.number} onClick={() => choose(item.number, item.sessions[0]?.id)}>
            <strong>{french ? "Semaine" : "Week"} {item.number}</strong>
            <span>{label(item.objective, french) || (french ? "Ton entraînement" : "Your training")}</span>
            <small>{item.sessions.length} {french ? "séance(s) prévues" : "planned session(s)"}</small>
          </button> : <div key={number} className={styles.week} aria-disabled="true"><strong>{french ? "Semaine" : "Week"} {number}</strong><span>{french ? "À venir" : "Coming next"}</span><small>{french ? "Non publiée" : "Not published"}</small></div>;
        })}
      </div> : null}
      {part !== "weeks" ? <div ref={daysRef} className={`${styles.rail} ${styles.days}`} role="group" aria-label={french ? `Séances de la semaine ${week.number}` : `Week ${week.number} sessions`}>
        {calendarDays.flatMap((day, index) => {
          const planned = week.sessions.filter((item) => item.schedule.mode !== "flexible" && item.schedule.day === index + 1);
          return planned.length ? planned.map(renderSession) : [<div key={`empty-${index}`} className={styles.day} data-empty-day=""><small>{day}</small><strong>{french ? "Non planifié" : "Not scheduled"}</strong><span>{french ? "Aucune séance prévue" : "No session scheduled"}</span></div>];
        })}
        {week.sessions.filter((item) => item.schedule.mode === "flexible" || item.schedule.day === null).map(renderSession)}
      </div> : null}
    </div>
  );
}
