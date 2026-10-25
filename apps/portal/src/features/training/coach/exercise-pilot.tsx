"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Feedback, Loading } from "@/components/fe/feedback";
import {
  PILOT_EQUIPMENT, exercisePilotListSchema,
  type ExercisePilotList, type ExercisePilotQuery, type PilotExercise,
} from "@/lib/contracts/exercise-pilot";
import { PilotExercisePreview } from "@/features/training/shared/pilot-exercise-preview";
import styles from "./exercise-pilot.module.css";
import { CATALOGUE_EQUIPMENT_LABELS as EQUIPMENT_LABELS, catalogueSelectionMessage } from "./catalogue-presentation";

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; value: ExercisePilotList };

export function ExercisePilot({ onSelect, selectionBusy = false }: {
  onSelect?: (exercise: PilotExercise) => void;
  selectionBusy?: boolean;
} = {}) {
  const instanceId = useId();
  const [filter, setFilter] = useState<ExercisePilotQuery>({ query: "", equipment: "", stabilizers: "false" });
  const [query, setQuery] = useState("");
  const [equipment, setEquipment] = useState<ExercisePilotQuery["equipment"]>("");
  const [stabilizers, setStabilizers] = useState(false);
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [selected, setSelected] = useState<PilotExercise | null>(null);
  const [reload, setReload] = useState(0);
  const [offset, setOffset] = useState(0);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const resultButtons = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    const timeout = setTimeout(() => controller.abort(), 8_000);
    setLoad({ kind: "loading" });
    setSelected(null);
    void (async () => {
      try {
        const response = await fetch(`/api/v1/coach/exercise-pilot?${new URLSearchParams({ query: filter.query, equipment: filter.equipment, stabilizers: filter.stabilizers, offset: String(offset), limit: "50" })}`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!mounted) return;
        if (controller.signal.aborted) throw new Error("PILOT_LOAD_ABORTED");
        if (response.status === 401 || response.status === 403) {
          window.location.replace(response.status === 401 ? "/login" : "/verify-email");
          return;
        }
        if (!response.ok) throw new Error("PILOT_LOAD_FAILED");
        const value = exercisePilotListSchema.parse((await response.json()).data);
        if (value.pagination && value.pagination.offset !== offset) throw new Error("CATALOGUE_PAGE_MISMATCH");
        if (mounted) setLoad({ kind: "ready", value });
      } catch {
        if (mounted) setLoad({ kind: "error" });
      } finally { clearTimeout(timeout); }
    })();
    return () => { mounted = false; controller.abort(); clearTimeout(timeout); };
  }, [filter, reload, offset]);

  useEffect(() => { if (selected) detailHeading.current?.focus(); }, [selected]);

  function search(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    setFilter({ query, equipment, stabilizers: stabilizers ? "true" : "false" });
  }

  function returnToResults() {
    const target = (selected && resultButtons.current[selected.id]) || searchInput.current;
    target?.focus();
    target?.scrollIntoView({ block: "center", behavior: "auto" });
  }

  const muscleNames = (items: PilotExercise["muscles"]["primary"]) =>
    items.map((item) => item.labels[language]).join(", ") || "Aucun indiqué";

  return <section className={styles.pilot} aria-labelledby={`${instanceId}-title`}>
    <header className={styles.heading}>
      <div><p className="fe-eyebrow">LEGACY · CATALOGUE</p>
        <h2 id={`${instanceId}-title`}>Catalogue d’exercices.</h2>
        <p>{onSelect
          ? "Choisis un exercice pour ta séance de test staging. Les consignes complètes seront conservées avec le programme. Les modèles de machines restent à vérifier et ne sont pas sélectionnables."
          : "Recherche tes exercices, compare les équipements et relis les fiches. Ces fiches restent en revue : sa sélection pour un programme est réservée au test staging dans le créateur de programmes."}</p>
      </div>
      <span className={styles.badge}>Brouillons · revue Coach</span>
    </header>

    <form className={styles.filters} onSubmit={search}>
      <label htmlFor={`${instanceId}-search`}>Nom, muscle ou identifiant
        <input id={`${instanceId}-search`} ref={searchInput} data-autofocus type="search" value={query} maxLength={120}
          placeholder="Ex. ischio-fessiers, chest, DB_025"
          onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className={styles.field}><label htmlFor={`${instanceId}-equipment`}>Équipement</label>
        <select id={`${instanceId}-equipment`} value={equipment} onChange={(event) => setEquipment(event.target.value as ExercisePilotQuery["equipment"])}>
          <option value="">Tous les équipements</option>
          {PILOT_EQUIPMENT.map((id) => <option key={id} value={id}>{EQUIPMENT_LABELS[id]}</option>)}
        </select>
      </div>
      <label className={styles.checkbox}><input type="checkbox" checked={stabilizers} onChange={(event) => setStabilizers(event.target.checked)} />Inclure les muscles stabilisateurs dans la recherche</label>
      <button className="fe-button fe-button-primary" type="submit">Rechercher dans le catalogue</button>
    </form>
    <p className={styles.note}>La recherche comprend les noms français et anglais. Pour les muscles, les cibles principales et secondaires sont incluses par défaut.</p>

    {load.kind === "loading" ? <Loading>Chargement des fiches du catalogue…</Loading> : load.kind === "error" ? <div className={styles.retry}>
      <Feedback>Impossible de charger le catalogue. Tes exercices et programmes existants restent inchangés.</Feedback>
      <button className="fe-button" type="button" onClick={() => setReload((value) => value + 1)}>Réessayer le chargement du catalogue</button>
    </div> : <>
      <p className={styles.resultCount} role="status">{load.value.total} fiche{load.value.total === 1 ? "" : "s"} trouvée{load.value.total === 1 ? "" : "s"} sur {load.value.catalogSize}</p>
      <div className={styles.columns}>
        <div>
          {!load.value.items.length ? <p>Aucune fiche ne correspond à ces critères. Essaie un autre nom ou retire le filtre d’équipement.</p> : <ul className={styles.list} aria-label="Résultats du catalogue">
            {load.value.items.map((exercise) => <li key={exercise.id}>
              <h3>{exercise.name[language]}</h3>
              <p>{exercise.equipment.labels[language]} · <span className={styles.source}>{exercise.id}</span></p>
              <p className={styles.note}>{muscleNames(exercise.muscles.primary)}</p>
              {catalogueSelectionMessage(exercise, language) ? <p className={styles.note}>{catalogueSelectionMessage(exercise, language)}</p> : null}
              <div className={styles.resultActions}><button className="fe-button" type="button" aria-controls={`${instanceId}-detail`}
                ref={(element) => { resultButtons.current[exercise.id] = element; }}
                aria-pressed={selected?.id === exercise.id} onClick={() => setSelected(exercise)}>Consulter {exercise.name[language]}</button>
              {onSelect ? <button className="fe-button fe-button-primary" type="button" disabled={selectionBusy || exercise.selection?.canSelect === false}
                onClick={() => { if (exercise.selection?.canSelect !== false) onSelect(exercise); }}>{selectionBusy ? "Préparation…" : `Choisir ${exercise.name[language]}`}</button> : null}
              </div>
            </li>)}
          </ul>}
          {load.value.pagination && (offset > 0 || load.value.pagination.hasMore) ? <nav className={styles.resultActions} aria-label="Pages du catalogue">
            <button className="fe-button" type="button" disabled={offset === 0 || selectionBusy} onClick={() => setOffset(value => Math.max(0, value - 50))}>Page précédente</button>
            <span>Page {Math.floor(offset / 50) + 1} / {Math.max(1, Math.ceil(load.value.total / 50))}</span>
            <button className="fe-button" type="button" disabled={!load.value.pagination.hasMore || selectionBusy} onClick={() => setOffset(value => value + 50)}>Page suivante</button>
          </nav> : null}
        </div>
        <section id={`${instanceId}-detail`} className={styles.detail} aria-label="Fiche détaillée">
          {!selected ? <p>Choisis une fiche pour lire ses consignes et vérifier les conventions de saisie.</p> : <>
            <button className="fe-button" type="button" onClick={returnToResults}>Retour aux résultats</button>
            <div className={styles.detailTop}>
              <span className={styles.badge}>Brouillon · consignes à valider</span>
              <div className={styles.field}><label htmlFor={`${instanceId}-language`}>Langue de la fiche</label><select id={`${instanceId}-language`} value={language} onChange={(event) => setLanguage(event.target.value as "fr" | "en")}><option value="fr">Français</option><option value="en">English</option></select></div>
            </div>
            <h3 ref={detailHeading} tabIndex={-1}>{selected.name[language]}</h3>
            <p className={styles.note}>{selected.id} · version {selected.sourceVersion} · {selected.equipment.labels[language]}</p>
            {onSelect ? <div className={styles.selection}>
              <p>Test staging seulement. Cet ajout ne vaut pas validation professionnelle des consignes et ne publie rien chez le client.</p>
              <button className="fe-button fe-button-primary" type="button" disabled={selectionBusy || selected.selection?.canSelect === false}
                onClick={() => { if (selected.selection?.canSelect !== false) onSelect(selected); }}>{selectionBusy ? "Préparation de l’exercice…" : `Ajouter ${selected.name[language]} à la séance`}</button>
            </div> : null}
            {catalogueSelectionMessage(selected, language) ? <p className={styles.note}>{catalogueSelectionMessage(selected, language)}</p> : null}
            <dl className={styles.muscles}>
              <div><dt>Muscles principaux</dt><dd>{muscleNames(selected.muscles.primary)}</dd></div>
              <div><dt>Muscles secondaires</dt><dd>{muscleNames(selected.muscles.secondary)}</dd></div>
              <div><dt>Stabilisateurs</dt><dd>{muscleNames(selected.muscles.stabilizers)}</dd></div>
            </dl>
            <section aria-label="Aperçu des consignes réservé au Coach">
              <p className={styles.note}>Aperçu des consignes — visible ici pour la revue Coach seulement.</p>
              <PilotExercisePreview exercise={selected} language={language} />
            </section>
            <section aria-labelledby={`${instanceId}-machines-title`}>
              <h4 id={`${instanceId}-machines-title`}>Variantes de machines</h4>
              {!selected.machines.length ? <p>Aucun modèle de machine associé à cette fiche.</p> : <ul className={styles.machines}>
                {selected.machines.map((machine) => <li key={machine.id}>
                  <h5>{machine.manufacturer} · {machine.name}</h5>
                  <p>{machine.evidence === "inferred_family" ? "Rapprochement de famille — modèle à confirmer." : "Modèle identifié — correspondance à valider."}</p>
                  <p>{machine.warning[language]}</p>
                  <p className={styles.note}>Non disponible pour prescription · {machine.modelId} · version {machine.modelVersion}</p>
                </li>)}
              </ul>}
            </section>
            <p className={styles.mediaNote}>Aucune image ni vidéo livrée pour cette fiche. Aucun visuel générique ne remplace l’exercice ou la machine.</p>
          </>}
        </section>
      </div>
      <p className={styles.note}>Lot source {load.value.sourceCatalogVersion} · intégration {load.value.integrationVersion}. La consultation ne valide aucune fiche et ne modifie aucun programme publié.</p>
    </>}
  </section>;
}
