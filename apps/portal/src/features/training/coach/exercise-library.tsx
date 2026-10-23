"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AppShell } from "@/components/fe/app-shell";
import { Feedback, Loading } from "@/components/fe/feedback";
import { requestCoachLogout } from "@/features/coach/auth/request-coach-logout";
import {
  TRAINING_UNITS, exerciseListSchema, exerciseSnapshotSchema, saveExerciseRequestSchema,
  type ExerciseDefinition, type ExerciseList, type ExerciseSnapshot, type SaveExerciseRequest,
} from "@/lib/contracts/training";
import styles from "./exercise-library.module.css";
import { ExercisePilot } from "./exercise-pilot";

const EMPTY: ExerciseDefinition = { name: "", equipment: "", cue: { fr: "", en: "" }, defaultUnit: "lb", archived: false };
const UNIT_LABELS = { lb: "Livres (lb)", min: "Minutes", sec: "Secondes", distance: "Distance", level: "Niveau", configuration: "Configuration (sans conversion en poids)" };
type ListState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; value: ExerciseList };

function handleAuth(response: Response) {
  if (response.status === 401 || response.status === 403) {
    window.location.replace(response.status === 401 ? "/login" : "/verify-email");
    return true;
  }
  return false;
}

export function ExerciseLibrary() {
  const [showPilot, setShowPilot] = useState(false);
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [filters, setFilters] = useState({ query: "", archived: "false", page: 0 });
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<ExerciseSnapshot | null>(null);
  const [draft, setDraft] = useState<ExerciseDefinition>(structuredClone(EMPTY));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const pending = useRef<SaveExerciseRequest | null>(null);
  const busy = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    const timeout = setTimeout(() => controller.abort(), 8_000);
    setList({ kind: "loading" });
    void (async () => {
      try {
        const response = await fetch(`/api/v1/coach/exercises?${new URLSearchParams({
          query: filters.query, archived: filters.archived, page: String(filters.page),
        })}`, { cache: "no-store", signal: controller.signal });
        if (handleAuth(response)) return;
        if (!response.ok) throw new Error("LOAD_FAILED");
        const body = await response.json();
        const value = exerciseListSchema.parse(body.data);
        if (mounted) setList({ kind: "ready", value });
      } catch { if (mounted) setList({ kind: "error" }); }
      finally { clearTimeout(timeout); }
    })();
    return () => { mounted = false; clearTimeout(timeout); controller.abort(); };
  }, [filters, reload]);

  useEffect(() => {
    if (!dirty && !uncertain) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty, uncertain]);

  function edit(item: ExerciseSnapshot | null) {
    if (saving || uncertain || (dirty && !window.confirm("Abandonner les modifications non enregistrées ?"))) return;
    setSelected(item);
    setDraft(item ? { name: item.name, equipment: item.equipment, cue: item.cue, defaultUnit: item.defaultUnit, archived: item.archived } : structuredClone(EMPTY));
    setDirty(false); setConflict(false); setError(null); setSuccess(null); pending.current = null;
    nameInput.current?.focus();
  }

  function change(patch: Partial<ExerciseDefinition>) {
    setDraft((value) => ({ ...value, ...patch }));
    setDirty(true); setSuccess(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy.current || conflict) return;
    const parsed = saveExerciseRequestSchema.safeParse(pending.current ?? {
      id: selected?.id ?? null, expectedVersion: selected?.version ?? 0,
      clientMutationId: crypto.randomUUID(), exercise: draft,
    });
    if (!parsed.success) { setError("Vérifie le nom et la longueur des consignes."); return; }
    pending.current = parsed.data;
    busy.current = true; setSaving(true); setError(null); setSuccess(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch("/api/v1/coach/exercises", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.current), signal: controller.signal,
      });
      if (handleAuth(response)) return;
      if (response.status === 409 || response.status === 404) {
        pending.current = null; setUncertain(false); setConflict(true);
        setError("Cet exercice a changé ou n’est plus modifiable. Tes saisies sont conservées. Recharge la liste, puis ouvre sa version actuelle avant de réessayer.");
        return;
      }
      if (response.status === 400) {
        pending.current = null; setUncertain(false);
        setError("Certaines informations sont invalides. Vérifie les champs avant de réessayer.");
        return;
      }
      if (!response.ok) throw new Error("SAVE_FAILED");
      const body = await response.json();
      const item = exerciseSnapshotSchema.parse(body.data?.exercise);
      pending.current = null;
      setSelected(item); setDraft({ name: item.name, equipment: item.equipment, cue: item.cue, defaultUnit: item.defaultUnit, archived: item.archived });
      setUncertain(false); setDirty(false);
      setSuccess(item.archived ? "Exercice archivé. Il reste conservé dans la bibliothèque." : "Exercice enregistré dans la bibliothèque.");
      setReload((value) => value + 1);
    } catch {
      setUncertain(true);
      setError("La confirmation n’est pas arrivée. Réessaie le même enregistrement : aucun doublon ne sera créé.");
    } finally { clearTimeout(timeout); busy.current = false; setSaving(false); }
  }

  async function logout() {
    if (dirty && !window.confirm("Quitter sans enregistrer les modifications ?")) return;
    setSigningOut(true);
    const received = await requestCoachLogout(() => window.location.replace("/login"));
    if (!received) { setError("La déconnexion a échoué. Réessaie."); setSigningOut(false); }
  }

  return <AppShell space="coach" current="exercises" documentNavigation accountAction={
    <button type="button" className="fe-button" disabled={saving || uncertain || signingOut} onClick={() => void logout()}>{signingOut ? "Déconnexion…" : "Se déconnecter"}</button>
  }>
    <div className={styles.page}>
      <header className={styles.heading}>
        <div><p className="fe-eyebrow">ENTRAÎNEMENT · BIBLIOTHÈQUE</p><h1 className="fe-title">Tes exercices.</h1>
          <p>Prépare les mouvements réutilisables dans tes futurs programmes. Aucune modification ici ne publie un programme chez un client.</p></div>
        <button className="fe-button fe-button-primary" type="button" disabled={saving || uncertain} onClick={() => edit(null)}>Nouvel exercice</button>
      </header>
      <button className="fe-button" type="button" aria-expanded={showPilot} onClick={() => setShowPilot(!showPilot)}>{showPilot ? "Fermer le lot pilote" : "Explorer les 15 fiches pilotes"}</button>
      {showPilot ? <ExercisePilot /> : null}
      <div className={styles.columns}>
        <section className={styles.panel} aria-label="Bibliothèque d’exercices">
          <h2>Bibliothèque</h2>
          <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); setFilters((value) => ({ ...value, query, page: 0 })); }}>
            <label htmlFor="exercise-search">Rechercher par nom<input id="exercise-search" type="search" maxLength={120} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <div><label htmlFor="exercise-status">Afficher</label><select id="exercise-status" value={filters.archived} onChange={(event) => setFilters((value) => ({ ...value, archived: event.target.value, page: 0 }))}><option value="false">Exercices actifs</option><option value="true">Exercices archivés</option></select></div>
            <button className="fe-button" type="submit">Rechercher</button>
          </form>
          {list.kind === "loading" ? <Loading>Chargement de la bibliothèque…</Loading> : list.kind === "error" ? <Feedback>Impossible de charger la bibliothèque. Aucun exercice n’a été supprimé.</Feedback> : <>
            <p>{list.value.total} exercice{list.value.total === 1 ? "" : "s"}</p>
            {!list.value.items.length ? <p>{filters.query ? "Aucun exercice ne correspond à cette recherche." : filters.archived === "true" ? "Aucun exercice archivé." : "Ta bibliothèque est vide. Ajoute ton premier exercice avec le formulaire."}</p> : <ul className={styles.list}>
              {list.value.items.map((item) => <li key={item.id}>
                <h3>{item.name}</h3><p>{item.equipment || "Sans équipement précisé"} · {UNIT_LABELS[item.defaultUnit]}</p>
                <p>{item.cue.fr || item.cue.en || "Aucune consigne ajoutée."}</p>
                <button type="button" className="fe-button" disabled={saving || uncertain} onClick={() => edit(item)}>{item.canEdit ? "Modifier" : "Consulter"} {item.name}</button>
              </li>)}
            </ul>}
            <div className={styles.actions}>
              <button className="fe-button" type="button" disabled={filters.page === 0} onClick={() => setFilters((value) => ({ ...value, page: value.page - 1 }))}>Précédente</button>
              <span>Page {filters.page + 1}</span>
              <button className="fe-button" type="button" disabled={(filters.page + 1) * 50 >= list.value.total} onClick={() => setFilters((value) => ({ ...value, page: value.page + 1 }))}>Suivante</button>
            </div>
          </>}
          <button className="fe-button" type="button" onClick={() => setReload((value) => value + 1)}>Recharger la liste</button>
        </section>
        <section className={styles.panel} aria-labelledby="exercise-editor-title">
          <h2 id="exercise-editor-title">{selected ? "Fiche exercice" : "Nouvel exercice"}</h2>
          <form onSubmit={(event) => void save(event)} className={styles.form}>
            {error ? <Feedback>{error}</Feedback> : null}
            {success ? <Feedback tone="success">{success}</Feedback> : null}
            <fieldset disabled={saving || uncertain || conflict || (selected !== null && !selected.canEdit)}>
              <legend className="fe-sr-only">Informations de l’exercice</legend>
              <label htmlFor="exercise-name">Nom de l’exercice (anglais)<input id="exercise-name" ref={nameInput} required maxLength={160} value={draft.name} onChange={(event) => change({ name: event.target.value })} /></label>
              <label htmlFor="exercise-equipment">Équipement<input id="exercise-equipment" maxLength={120} placeholder="Ex. haltères, poulie, aucun" value={draft.equipment} onChange={(event) => change({ equipment: event.target.value })} /></label>
              <div><label htmlFor="exercise-unit">Unité par défaut</label><select id="exercise-unit" value={draft.defaultUnit} onChange={(event) => change({ defaultUnit: event.target.value as ExerciseDefinition["defaultUnit"] })}>{TRAINING_UNITS.filter((unit) => unit !== "configuration" || selected?.pilot).map((unit) => <option key={unit} value={unit}>{UNIT_LABELS[unit]}</option>)}</select></div>
              <label htmlFor="exercise-cue-fr">Consigne courte · français<textarea id="exercise-cue-fr" maxLength={300} value={draft.cue.fr} onChange={(event) => change({ cue: { ...draft.cue, fr: event.target.value } })} /></label>
              <label htmlFor="exercise-cue-en">Consigne courte · anglais<textarea id="exercise-cue-en" maxLength={300} value={draft.cue.en} onChange={(event) => change({ cue: { ...draft.cue, en: event.target.value } })} /></label>
              {selected ? <label className={styles.check}><input type="checkbox" checked={draft.archived} onChange={(event) => change({ archived: event.target.checked })} />Archiver cet exercice (sans le supprimer)</label> : null}
            </fieldset>
            <p className={styles.note}>Images et vidéos : leur association sera ajoutée avec le stockage privé des médias. Aucun lecteur ni téléversement n’est encore actif.</p>
            {selected && !selected.canEdit ? <p>Tu peux consulter cet exercice. Sa modification est réservée à son créateur ou à un administrateur.</p> : <button className="fe-button fe-button-primary" type="submit" disabled={saving || conflict}>{saving ? "Enregistrement…" : uncertain ? "Réessayer l’enregistrement" : "Enregistrer l’exercice"}</button>}
            {dirty ? <p className={styles.note}>Modifications non enregistrées.</p> : null}
          </form>
        </section>
      </div>
    </div>
  </AppShell>;
}
