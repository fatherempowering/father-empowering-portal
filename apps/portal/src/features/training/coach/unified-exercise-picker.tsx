"use client";

import { usePortalLanguage } from "@/components/fe/portal-preferences";
import { UiText, useUiCopy } from "@/components/fe/ui-text";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Feedback, Loading } from "@/components/fe/feedback";
import { Modal } from "@/components/fe/modal";
import { Icon } from "@/components/fe/icon";
import { exerciseListSchema, type ExerciseSnapshot } from "@/lib/contracts/training";
import { exercisePilotListSchema, PILOT_EQUIPMENT, type PilotExercise } from "@/lib/contracts/exercise-pilot";
import { librarySearchTerms, matchesLibraryEquipment, matchesLibrarySearch, splitExerciseSearch } from "@/lib/training/pilot/search-aliases";
import { PilotExercisePreview } from "@/features/training/shared/pilot-exercise-preview";
import { usePilotSelection } from "./use-pilot-selection";
import styles from "./unified-exercise-picker.module.css";
import { CATALOGUE_EQUIPMENT_LABELS as equipmentLabels, catalogueSelectionMessage } from "./catalogue-presentation";

import { EXERCISE_MUSCLE_GROUPS, type ExerciseMuscleGroup } from "@/lib/training/exercise-picker-groups";

type Result = { key: string; kind: "library"; exercise: ExerciseSnapshot } | { key: string; kind: "pilot"; exercise: PilotExercise };

export function mergeExerciseSearchResults(library: ExerciseSnapshot[], pilots: PilotExercise[]): Result[] {
  const matchingVersions = new Set(pilots.map(item => `${item.id}@${item.sourceVersion}`));
  const results = new Map<string, Result>();
  for (const exercise of library) {
    if (exercise.archived || (exercise.pilot && !matchingVersions.has(`${exercise.pilot.sourceId}@${exercise.pilot.sourceVersion}`))) continue;
    const key = exercise.pilot ? `pilot:${exercise.pilot.sourceId}@${exercise.pilot.sourceVersion}` : `library:${exercise.id}`;
    results.set(key, { key, kind: "library", exercise });
  }
  // Keep the complete review card for a pilot already present in the library.
  // Its selection still calls the protected import endpoint, never a local bypass.
  for (const exercise of pilots) {
    const key = `pilot:${exercise.id}@${exercise.sourceVersion}`;
    results.set(key, { key, kind: "pilot", exercise });
  }
  return [...results.values()];
}

export function UnifiedExercisePicker({ onAdd, onAddMany, maxSelection = 30, onClose }: {
  onAddMany?: (exercises: ExerciseSnapshot[]) => void;
  maxSelection?: number;
  onAdd: (exercise: ExerciseSnapshot) => void;
  onClose?: () => void;
}) {
  const c = useUiCopy();
  const { language } = usePortalLanguage();
  const id = useId();
  const [basket, setBasket] = useState<Result[]>([]);
  const [addingBatch, setAddingBatch] = useState(false);
  const batchInFlight = useRef(false);
  const [query, setQuery] = useState("");
  const [equipment, setEquipment] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<ExerciseMuscleGroup>("all");
  const [filter, setFilter] = useState({ query: "", equipment: "", muscleGroup: "all" as ExerciseMuscleGroup });
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [usageAvailable, setUsageAvailable] = useState(false);
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [library, setLibrary] = useState<ExerciseSnapshot[]>([]);
  const [pilots, setPilots] = useState<PilotExercise[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Result | null>(null);
  const detail = useRef<HTMLHeadingElement>(null);
  const { busy: selecting, error, select } = usePilotSelection(() => {});
  const busy = selecting || addingBatch;
  const results = useMemo(() => mergeExerciseSearchResults(library, pilots).sort((a, b) => {
    const usageKey = (result: Result) => result.kind === "pilot" ? `pilot:${result.exercise.id}` : result.exercise.pilot ? `pilot:${result.exercise.pilot.sourceId}` : `library:${result.exercise.id}`;
    return (usageCounts[usageKey(b)] ?? 0) - (usageCounts[usageKey(a)] ?? 0) || name(a).localeCompare(name(b), language) || a.key.localeCompare(b.key);
  // name derives only from language and its argument.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [library, pilots, usageCounts, language]);
  useEffect(() => { if (selected) detail.current?.focus(); }, [selected]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    setLoading(true); setFailed(false); setSelected(null);
    const search = splitExerciseSearch(filter.query);
    const effectiveEquipment = filter.equipment || search.equipment;
    async function get(url: string) {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (response.status === 401 || response.status === 403) {
        if (active) window.location.replace(response.status === 401 ? "/login" : "/verify-email");
        throw new Error("AUTH");
      }
      if (!response.ok) throw new Error("SEARCH_FAILED");
      return (await response.json()).data;
    }
    void (async () => {
      try {
        const terms = [...new Set(librarySearchTerms(filter.query))];
        const [pilotData, ...libraryData] = await Promise.all([
          get(`/api/v1/coach/exercise-pilot?${new URLSearchParams({ query: filter.query, equipment: filter.equipment, muscleGroup: filter.muscleGroup, sort: "usage", stabilizers: "false", offset: String(page * 50), limit: "50" })}`),
          ...terms.map(term => get(`/api/v1/coach/exercises?${new URLSearchParams({ query: term, page: String(page), archived: "false", muscleGroup: filter.muscleGroup, sort: "usage" })}`)),
        ]);
        const nextPilots = exercisePilotListSchema.parse(pilotData);
        const pages = libraryData.map(value => exerciseListSchema.parse(value));
        if (pages.some(value => value.page !== page)) throw new Error("SEARCH_PAGE_MISMATCH");
        const conflictingEquipment = Boolean(filter.equipment && search.equipment && filter.equipment !== search.equipment);
        const rows = conflictingEquipment ? [] : pages.flatMap(value => value.items).filter(item =>
          item.pilot || (matchesLibrarySearch(item.name, filter.query) && matchesLibraryEquipment(item.equipment, effectiveEquipment)));
        if (!active || controller.signal.aborted) return;
        setUsageCounts(previous => Object.assign({}, page ? previous : {}, nextPilots.usageCounts, ...pages.map(value => value.usageCounts)));
        setUsageAvailable(nextPilots.usageAvailable === true && pages.every(value => value.usageAvailable === true));
        setLibrary(previous => [...new Map([...(page ? previous : []), ...rows].map(item => [item.id, item])).values()]);
        if (nextPilots.pagination && nextPilots.pagination.offset !== page * 50) throw new Error("CATALOGUE_PAGE_MISMATCH");
        setPilots(previous => [...new Map([...(page ? previous : []), ...nextPilots.items].map(item => [item.id, item])).values()]);
        setHasMore(!conflictingEquipment && (Boolean(nextPilots.pagination?.hasMore) || pages.some(value => (page + 1) * value.pageSize < value.total)));
      } catch { if (active) setFailed(true); }
      finally { clearTimeout(timeout); if (active) setLoading(false); }
    })();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [filter, page, attempt]);

  function search(event: FormEvent) { event.preventDefault(); if (busy) return; setPage(0); setFilter({ query, equipment, muscleGroup }); }
  function name(result: Result) { return result.kind === "pilot" ? result.exercise.name[language] : result.exercise.pilot?.name[language] ?? result.exercise.name; }
  async function choose(result: Result) {
    if (busy || basket.length || loading || failed || (result.kind === "pilot" && result.exercise.selection?.canSelect === false)) return;
    const exercise = await resolve(result);
    if (exercise) onAdd(exercise);
  }
  async function resolve(result: Result) {
    if (result.kind === "pilot") return select(result.exercise);
    if (result.exercise.pilot) return select({ id: result.exercise.pilot.sourceId, sourceVersion: result.exercise.pilot.sourceVersion });
    return result.exercise;
  }
  function toggle(result: Result) {
    if (busy) return;
    setBasket(current => current.some(item => item.key === result.key)
      ? current.filter(item => item.key !== result.key)
      : current.length < maxSelection ? [...current, result] : current);
  }
  async function addBasket() {
    if (batchInFlight.current || busy || !basket.length || !onAddMany) return;
    batchInFlight.current = true; setAddingBatch(true);
    try {
      const exercises: ExerciseSnapshot[] = [];
      // Resolve protected imports first. A failed import leaves the entire draft
      // unchanged; retry receipts make completed imports idempotent.
      for (const result of basket) {
        const exercise = await resolve(result);
        if (!exercise) return;
        exercises.push(exercise);
      }
      onAddMany(exercises);
    } finally { batchInFlight.current = false; setAddingBatch(false); }
  }
  const content = <>
    <header className="fe-dialog-header">
      <div><h2 id={`${id}-title`}><UiText>Choisir un exercice</UiText></h2><p id={`${id}-description`}><UiText>Choisis tes exercices, puis règle les séries, répétitions et repos dans la séance.</UiText></p></div>
      {onClose ? <button type="button" className="fe-icon-button" aria-label={c("Fermer le choix d’exercice")} disabled={busy} onClick={onClose}><Icon name="close" /></button> : null}
    </header>
    <div className={`fe-dialog-content ${styles.picker}`}>
      <form className={styles.search} onSubmit={search}>
        <label htmlFor={`${id}-query`}><UiText>Rechercher un exercice</UiText><input id={`${id}-query`} data-autofocus type="search" value={query} maxLength={120} disabled={busy} placeholder={c("Nom, muscle… ex. chest, pompes, haut du corps")} onChange={event => setQuery(event.target.value)} /></label>
        <div className={styles.field}><label htmlFor={`${id}-equipment`}><UiText>Équipement</UiText></label><select id={`${id}-equipment`} value={equipment} disabled={busy} onChange={event => setEquipment(event.target.value)}>
          <option value=""><UiText>Tous les équipements</UiText></option>{PILOT_EQUIPMENT.map(value => <option key={value} value={value}>{equipmentLabels[value]}</option>)}
        </select></div>
        <button type="submit" className="fe-button fe-button-primary" disabled={busy}><UiText>Rechercher</UiText></button>
      </form>
      <div className={styles.muscleTabs} role="group" aria-label={c("Groupes musculaires")}>
        {EXERCISE_MUSCLE_GROUPS.map(group => <button key={group.id} type="button" className="fe-button" aria-pressed={muscleGroup === group.id} disabled={busy} onClick={() => { setMuscleGroup(group.id); setPage(0); setFilter({ query, equipment, muscleGroup: group.id }); }}>{group.label[language]}</button>)}
      </div>
      <p className={styles.help}>{usageAvailable ? c("Tes exercices les plus utilisés dans tes brouillons enregistrés apparaissent en premier.") : c("Tri selon l’utilisation disponible, puis par nom.")}</p>
      <p className={styles.help}><UiText>Noms français et anglais. Les muscles du catalogue sont indexés ; les exercices personnels sont retrouvés par leur nom et les familles de mouvements reconnues.</UiText></p>
      {onAddMany && basket.length ? <section className={styles.basket} aria-label={c("Exercices à ajouter")}>
        <p role="status">{basket.length} / {maxSelection} {c("exercices sélectionnés")}</p>
        <ol>{basket.map(result => <li key={result.key}><span>{name(result)}</span><button type="button" className="fe-icon-button" disabled={busy} aria-label={`${c("Retirer de la sélection")} ${name(result)}`} onClick={() => toggle(result)}><Icon name="close" /></button></li>)}</ol>
        <button type="button" className="fe-button fe-button-primary" disabled={busy || loading || failed} onClick={() => void addBasket()}>{addingBatch ? c("Préparation…") : `${c("Ajouter la sélection")} (${basket.length})`}</button>
      </section> : null}
      {error ? <Feedback>{error}</Feedback> : null}
      {loading ? <Loading><UiText>Recherche des exercices…</UiText></Loading> : failed ? <div><Feedback><UiText>La recherche n’a pas pu être chargée complètement. Aucun exercice n’a été ajouté et ton brouillon est conservé.</UiText></Feedback><button type="button" className="fe-button" onClick={() => setAttempt(value => value + 1)}><UiText>Réessayer la recherche</UiText></button></div> : <>
        <p role="status">{results.length}<UiText> exercice</UiText>{results.length === 1 ? "" : "s"}<UiText> affiché</UiText>{results.length === 1 ? "" : "s"}{hasMore ? <UiText>{" · d’autres résultats sont disponibles"}</UiText> : ""}</p>
        {!results.length ? <p><UiText>Aucun exercice pour ces critères. Essaie un autre nom ou enlève le filtre d’équipement.</UiText></p> : <ul className={styles.results} aria-label={c("Résultats des exercices")}>
          {results.map(result => <li key={result.key}>
            <div className={styles.resultTitle}>{onAddMany ? <input type="checkbox" aria-label={`${c("Sélectionner")} ${name(result)}`} checked={basket.some(item => item.key === result.key)} disabled={busy || (result.kind === "pilot" && result.exercise.selection?.canSelect === false) || (basket.length >= maxSelection && !basket.some(item => item.key === result.key))} onChange={() => toggle(result)} /> : null}<div><h3>{name(result)}</h3><p>{result.kind === "pilot" ? `${result.exercise.equipment.labels[language]} · ${c("Catalogue staging")}` : `${result.exercise.equipment || c("Équipement non précisé")}${result.exercise.pilot ? ` · ${c("Catalogue staging")}` : ` · ${c("Bibliothèque")}`}`}</p></div></div>
            {result.kind === "pilot" && catalogueSelectionMessage(result.exercise) ? <p className={styles.help}>{catalogueSelectionMessage(result.exercise)}</p> : null}
            <div className={styles.actions}><button type="button" className="fe-button" disabled={busy} onClick={() => setSelected(result)}><UiText>Consulter </UiText>{name(result)}</button><button type="button" className="fe-button fe-button-primary" disabled={busy || basket.length > 0 || (result.kind === "pilot" && result.exercise.selection?.canSelect === false)} onClick={() => choose(result)}>{busy ? <UiText>{"Préparation…"}</UiText> : `Choisir ${name(result)}`}</button></div>
          </li>)}
        </ul>}
        {hasMore ? <button type="button" className="fe-button" disabled={busy} onClick={() => setPage(value => value + 1)}><UiText>Afficher plus de résultats</UiText></button> : null}
        {selected ? <section className={styles.detail} aria-label={c("Fiche de l’exercice sélectionné")}>
          <h3 ref={detail} tabIndex={-1}>{name(selected)}</h3>
          {selected.kind === "pilot" ? <PilotExercisePreview exercise={selected.exercise} language={language} /> : <p>{selected.exercise.cue[language] || selected.exercise.cue.fr || selected.exercise.cue.en || <UiText>{"Aucune consigne enregistrée."}</UiText>}</p>}
          {selected.kind === "pilot" && selected.exercise.machines.length ? <section aria-label={c("Modèles de machines à vérifier")}><h4><UiText>Variantes de machines — non sélectionnables</UiText></h4><ul>
            {selected.exercise.machines.map(machine => <li key={machine.id}><strong>{machine.manufacturer} · {machine.name}</strong><p>{machine.warning[language]}</p><p><UiText>Non disponible pour prescription · </UiText>{machine.modelId}<UiText> · version </UiText>{machine.modelVersion}</p></li>)}
          </ul></section> : null}
          <button type="button" className="fe-button fe-button-primary" disabled={busy || basket.length > 0 || (selected.kind === "pilot" && selected.exercise.selection?.canSelect === false)} onClick={() => choose(selected)}>{busy ? <UiText>{"Préparation…"}</UiText> : `Ajouter ${name(selected)} à la séance`}</button>
        </section> : null}
      </>}
    </div>
  </>;
  return onClose ? <Modal open busy={busy} onClose={onClose} labelledBy={`${id}-title`} describedBy={`${id}-description`}>{content}</Modal> : <section aria-labelledby={`${id}-title`}>{content}</section>;
}
