"use client";

import { usePortalLanguage } from "@/components/fe/portal-preferences";
import { UiText, useUiCopy } from "@/components/fe/ui-text";
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
const UNIT_LABELS = { lb: "Livres (lb)", kg: "Kilogrammes (kg)", min: "Minutes", sec: "Secondes", distance: "Distance", level: "Niveau", configuration: "Configuration (sans conversion en poids)" };
type ListState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; value: ExerciseList };

function handleAuth(response: Response) {
  if (response.status === 401 || response.status === 403) {
    window.location.replace(response.status === 401 ? "/login" : "/verify-email");
    return true;
  }
  return false;
}

export function ExerciseLibrary() {
  const { language, french } = usePortalLanguage(); void french;
  const c = useUiCopy();
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
    if (saving || uncertain || (dirty && !window.confirm(c("Abandonner les modifications non enregistrées ?")))) return;
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
    if (dirty && !window.confirm(c("Quitter sans enregistrer les modifications ?"))) return;
    setSigningOut(true);
    const received = await requestCoachLogout(() => window.location.replace("/login"));
    if (!received) { setError("La déconnexion a échoué. Réessaie."); setSigningOut(false); }
  }

  return <AppShell space="coach" current="exercises" documentNavigation accountAction={
    <button type="button" className="fe-button" disabled={saving || uncertain || signingOut} onClick={() => void logout()}>{signingOut ? <UiText>{"Déconnexion…"}</UiText> : <UiText>{"Se déconnecter"}</UiText>}</button>
  }>
    <div className={styles.page}>
      <header className={styles.heading}>
        <div><p className="fe-eyebrow"><UiText>ENTRAÎNEMENT · BIBLIOTHÈQUE</UiText></p><h1 className="fe-title"><UiText>Tes exercices.</UiText></h1>
          <p><UiText>Prépare les mouvements réutilisables dans tes futurs programmes. Aucune modification ici ne publie un programme chez un client.</UiText></p></div>
        <button className="fe-button fe-button-primary" type="button" disabled={saving || uncertain} onClick={() => edit(null)}><UiText>Nouvel exercice</UiText></button>
      </header>
      <button className="fe-button" type="button" aria-expanded={showPilot} onClick={() => setShowPilot(!showPilot)}>{showPilot ? <UiText>{"Fermer le catalogue"}</UiText> : <UiText>{"Explorer le catalogue Legacy"}</UiText>}</button>
      {showPilot ? <ExercisePilot /> : null}
      <div className={styles.columns}>
        <section className={styles.panel} aria-label={c("Bibliothèque d’exercices")}>
          <h2><UiText>Bibliothèque</UiText></h2>
          <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); setFilters((value) => ({ ...value, query, page: 0 })); }}>
            <label htmlFor="exercise-search"><UiText>Rechercher par nom</UiText><input id="exercise-search" type="search" maxLength={120} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <div><label htmlFor="exercise-status"><UiText>Afficher</UiText></label><select id="exercise-status" value={filters.archived} onChange={(event) => setFilters((value) => ({ ...value, archived: event.target.value, page: 0 }))}><option value="false"><UiText>Exercices actifs</UiText></option><option value="true"><UiText>Exercices archivés</UiText></option></select></div>
            <button className="fe-button" type="submit"><UiText>Rechercher</UiText></button>
          </form>
          {list.kind === "loading" ? <Loading><UiText>Chargement de la bibliothèque…</UiText></Loading> : list.kind === "error" ? <Feedback><UiText>Impossible de charger la bibliothèque. Aucun exercice n’a été supprimé.</UiText></Feedback> : <>
            <p>{list.value.total}<UiText> exercice</UiText>{list.value.total === 1 ? "" : "s"}</p>
            {!list.value.items.length ? <p>{filters.query ? <UiText>{"Aucun exercice ne correspond à cette recherche."}</UiText> : filters.archived === "true" ? <UiText>{"Aucun exercice archivé."}</UiText> : <UiText>{"Ta bibliothèque est vide. Ajoute ton premier exercice avec le formulaire."}</UiText>}</p> : <ul className={styles.list}>
              {list.value.items.map((item) => <li key={item.id}>
                <h3>{item.name}</h3><p>{item.equipment || <UiText>{"Sans équipement précisé"}</UiText>} · <UiText>{UNIT_LABELS[item.defaultUnit]}</UiText></p>
                <p>{item.cue[language] || item.cue.fr || item.cue.en || <UiText>{"Aucune consigne ajoutée."}</UiText>}</p>
                <button type="button" className="fe-button" disabled={saving || uncertain} onClick={() => edit(item)}>{item.canEdit ? "Modifier" : <UiText>{"Consulter"}</UiText>} {item.name}</button>
              </li>)}
            </ul>}
            <div className={styles.actions}>
              <button className="fe-button" type="button" disabled={filters.page === 0} onClick={() => setFilters((value) => ({ ...value, page: value.page - 1 }))}><UiText>Précédente</UiText></button>
              <span><UiText>Page </UiText>{filters.page + 1}</span>
              <button className="fe-button" type="button" disabled={(filters.page + 1) * 50 >= list.value.total} onClick={() => setFilters((value) => ({ ...value, page: value.page + 1 }))}><UiText>Suivante</UiText></button>
            </div>
          </>}
          <button className="fe-button" type="button" onClick={() => setReload((value) => value + 1)}><UiText>Recharger la liste</UiText></button>
        </section>
        <section className={styles.panel} aria-labelledby="exercise-editor-title">
          <h2 id="exercise-editor-title">{selected ? <UiText>{"Fiche exercice"}</UiText> : <UiText>{"Nouvel exercice"}</UiText>}</h2>
          <form onSubmit={(event) => void save(event)} className={styles.form}>
            {error ? <Feedback>{error}</Feedback> : null}
            {success ? <Feedback tone="success">{success}</Feedback> : null}
            <fieldset disabled={saving || uncertain || conflict || (selected !== null && !selected.canEdit)}>
              <legend className="fe-sr-only"><UiText>Informations de l’exercice</UiText></legend>
              <label htmlFor="exercise-name"><UiText>Nom de l’exercice (anglais)</UiText><input id="exercise-name" ref={nameInput} required maxLength={160} value={draft.name} onChange={(event) => change({ name: event.target.value })} /></label>
              <label htmlFor="exercise-equipment"><UiText>Équipement</UiText><input id="exercise-equipment" maxLength={120} placeholder={c("Ex. haltères, poulie, aucun")} value={draft.equipment} onChange={(event) => change({ equipment: event.target.value })} /></label>
              <div><label htmlFor="exercise-unit"><UiText>Unité par défaut</UiText></label><select id="exercise-unit" value={draft.defaultUnit} onChange={(event) => change({ defaultUnit: event.target.value as ExerciseDefinition["defaultUnit"] })}>{TRAINING_UNITS.filter((unit) => unit !== "configuration" || selected?.pilot).map((unit) => <option key={unit} value={unit}><UiText>{UNIT_LABELS[unit]}</UiText></option>)}</select></div>
              <label htmlFor="exercise-cue-fr"><UiText>Consigne courte · français</UiText><textarea id="exercise-cue-fr" maxLength={300} value={draft.cue.fr} onChange={(event) => change({ cue: { ...draft.cue, fr: event.target.value } })} /></label>
              <label htmlFor="exercise-cue-en"><UiText>Consigne courte · anglais</UiText><textarea id="exercise-cue-en" maxLength={300} value={draft.cue.en} onChange={(event) => change({ cue: { ...draft.cue, en: event.target.value } })} /></label>
              {selected ? <label className={styles.check}><input type="checkbox" checked={draft.archived} onChange={(event) => change({ archived: event.target.checked })} /><UiText>Archiver cet exercice (sans le supprimer)</UiText></label> : null}
            </fieldset>
            <p className={styles.note}><UiText>Images et vidéos : leur association sera ajoutée avec le stockage privé des médias. Aucun lecteur ni téléversement n’est encore actif.</UiText></p>
            {selected && !selected.canEdit ? <p><UiText>Tu peux consulter cet exercice. Sa modification est réservée à son créateur ou à un administrateur.</UiText></p> : <button className="fe-button fe-button-primary" type="submit" disabled={saving || conflict}>{saving ? <UiText>{"Enregistrement…"}</UiText> : uncertain ? <UiText>{"Réessayer l’enregistrement"}</UiText> : <UiText>{"Enregistrer l’exercice"}</UiText>}</button>}
            {dirty ? <p className={styles.note}><UiText>Modifications non enregistrées.</UiText></p> : null}
          </form>
        </section>
      </div>
    </div>
  </AppShell>;
}
