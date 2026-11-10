"use client";

import { usePortalLanguage } from "@/components/fe/portal-preferences";
import { UiText, useUiCopy } from "@/components/fe/ui-text";
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
  const c = useUiCopy();
  const instanceId = useId();
  const [filter, setFilter] = useState<ExercisePilotQuery>({ query: "", equipment: "", stabilizers: "false" });
  const [query, setQuery] = useState("");
  const [equipment, setEquipment] = useState<ExercisePilotQuery["equipment"]>("");
  const [stabilizers, setStabilizers] = useState(false);
  const { language, setLanguage, t } = usePortalLanguage();
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
    items.map((item) => item.labels[language]).join(", ") || c("Aucun indiqué");

  return <section className={styles.pilot} aria-labelledby={`${instanceId}-title`}>
    <header className={styles.heading}>
      <div><p className="fe-eyebrow"><UiText>LEGACY · CATALOGUE</UiText></p>
        <h2 id={`${instanceId}-title`}><UiText>Catalogue d’exercices.</UiText></h2>
        <p>{onSelect
          ? <UiText>{"Choisis un exercice pour ta séance de test staging. Les consignes complètes seront conservées avec le programme. Les modèles de machines restent à vérifier et ne sont pas sélectionnables."}</UiText>
          : <UiText>{"Recherche tes exercices, compare les équipements et relis les fiches. Ces fiches restent en revue : sa sélection pour un programme est réservée au test staging dans le créateur de programmes."}</UiText>}</p>
      </div>
      <span className={styles.badge}><UiText>Brouillons · revue Coach</UiText></span>
    </header>

    <form className={styles.filters} onSubmit={search}>
      <label htmlFor={`${instanceId}-search`}><UiText>Nom, muscle ou identifiant
        </UiText><input id={`${instanceId}-search`} ref={searchInput} data-autofocus type="search" value={query} maxLength={120}
          placeholder={c("Ex. ischio-fessiers, chest, DB_025")}
          onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className={styles.field}><label htmlFor={`${instanceId}-equipment`}><UiText>Équipement</UiText></label>
        <select id={`${instanceId}-equipment`} value={equipment} onChange={(event) => setEquipment(event.target.value as ExercisePilotQuery["equipment"])}>
          <option value=""><UiText>Tous les équipements</UiText></option>
          {PILOT_EQUIPMENT.map((id) => <option key={id} value={id}><UiText>{EQUIPMENT_LABELS[id]}</UiText></option>)}
        </select>
      </div>
      <label className={styles.checkbox}><input type="checkbox" checked={stabilizers} onChange={(event) => setStabilizers(event.target.checked)} /><UiText>Inclure les muscles stabilisateurs dans la recherche</UiText></label>
      <button className="fe-button fe-button-primary" type="submit"><UiText>Rechercher dans le catalogue</UiText></button>
    </form>
    <p className={styles.note}><UiText>La recherche comprend les noms français et anglais. Pour les muscles, les cibles principales et secondaires sont incluses par défaut.</UiText></p>

    {load.kind === "loading" ? <Loading><UiText>Chargement des fiches du catalogue…</UiText></Loading> : load.kind === "error" ? <div className={styles.retry}>
      <Feedback><UiText>Impossible de charger le catalogue. Tes exercices et programmes existants restent inchangés.</UiText></Feedback>
      <button className="fe-button" type="button" onClick={() => setReload((value) => value + 1)}><UiText>Réessayer le chargement du catalogue</UiText></button>
    </div> : <>
      <p className={styles.resultCount} role="status">{t(`${load.value.total} fiche${load.value.total === 1 ? "" : "s"} trouvée${load.value.total === 1 ? "" : "s"} sur ${load.value.catalogSize}`, `${load.value.total} record${load.value.total === 1 ? "" : "s"} found out of ${load.value.catalogSize}`)}</p>
      <div className={styles.columns}>
        <div>
          {!load.value.items.length ? <p><UiText>Aucune fiche ne correspond à ces critères. Essaie un autre nom ou retire le filtre d’équipement.</UiText></p> : <ul className={styles.list} aria-label={c("Résultats du catalogue")}>
            {load.value.items.map((exercise) => <li key={exercise.id}>
              <h3>{exercise.name[language]}</h3>
              <p>{exercise.equipment.labels[language]} · <span className={styles.source}>{exercise.id}</span></p>
              <p className={styles.note}>{muscleNames(exercise.muscles.primary)}</p>
              {catalogueSelectionMessage(exercise, language) ? <p className={styles.note}>{catalogueSelectionMessage(exercise, language)}</p> : null}
              <div className={styles.resultActions}><button className="fe-button" type="button" aria-controls={`${instanceId}-detail`}
                ref={(element) => { resultButtons.current[exercise.id] = element; }}
                aria-pressed={selected?.id === exercise.id} onClick={() => setSelected(exercise)}><UiText>Consulter </UiText>{exercise.name[language]}</button>
              {onSelect ? <button className="fe-button fe-button-primary" type="button" disabled={selectionBusy || exercise.selection?.canSelect === false}
                onClick={() => { if (exercise.selection?.canSelect !== false) onSelect(exercise); }}>{selectionBusy ? <UiText>{"Préparation…"}</UiText> : `${t("Choisir", "Choose")} ${exercise.name[language]}`}</button> : null}
              </div>
            </li>)}
          </ul>}
          {load.value.pagination && (offset > 0 || load.value.pagination.hasMore) ? <nav className={styles.resultActions} aria-label={c("Pages du catalogue")}>
            <button className="fe-button" type="button" disabled={offset === 0 || selectionBusy} onClick={() => setOffset(value => Math.max(0, value - 50))}><UiText>Page précédente</UiText></button>
            <span><UiText>Page </UiText>{Math.floor(offset / 50) + 1} / {Math.max(1, Math.ceil(load.value.total / 50))}</span>
            <button className="fe-button" type="button" disabled={!load.value.pagination.hasMore || selectionBusy} onClick={() => setOffset(value => value + 50)}><UiText>Page suivante</UiText></button>
          </nav> : null}
        </div>
        <section id={`${instanceId}-detail`} className={styles.detail} aria-label={c("Fiche détaillée")}>
          {!selected ? <p><UiText>Choisis une fiche pour lire ses consignes et vérifier les conventions de saisie.</UiText></p> : <>
            <button className="fe-button" type="button" onClick={returnToResults}><UiText>Retour aux résultats</UiText></button>
            <div className={styles.detailTop}>
              <span className={styles.badge}><UiText>Brouillon · consignes à valider</UiText></span>
              <div className={styles.field}><label htmlFor={`${instanceId}-language`}><UiText>Langue de la fiche</UiText></label><select id={`${instanceId}-language`} value={language} onChange={(event) => setLanguage(event.target.value as "fr" | "en")}><option value="fr"><UiText>Français</UiText></option><option value="en">English</option></select></div>
            </div>
            <h3 ref={detailHeading} tabIndex={-1}>{selected.name[language]}</h3>
            <p className={styles.note}>{selected.id}<UiText> · version </UiText>{selected.sourceVersion} · {selected.equipment.labels[language]}</p>
            {onSelect ? <div className={styles.selection}>
              <p><UiText>Test staging seulement. Cet ajout ne vaut pas validation professionnelle des consignes et ne publie rien chez le client.</UiText></p>
              <button className="fe-button fe-button-primary" type="button" disabled={selectionBusy || selected.selection?.canSelect === false}
                onClick={() => { if (selected.selection?.canSelect !== false) onSelect(selected); }}>{selectionBusy ? <UiText>{"Préparation de l’exercice…"}</UiText> : `Ajouter ${selected.name[language]} à la séance`}</button>
            </div> : null}
            {catalogueSelectionMessage(selected, language) ? <p className={styles.note}>{catalogueSelectionMessage(selected, language)}</p> : null}
            <dl className={styles.muscles}>
              <div><dt><UiText>Muscles principaux</UiText></dt><dd>{muscleNames(selected.muscles.primary)}</dd></div>
              <div><dt><UiText>Muscles secondaires</UiText></dt><dd>{muscleNames(selected.muscles.secondary)}</dd></div>
              <div><dt><UiText>Stabilisateurs</UiText></dt><dd>{muscleNames(selected.muscles.stabilizers)}</dd></div>
            </dl>
            <section aria-label={c("Aperçu des consignes réservé au Coach")}>
              <p className={styles.note}><UiText>Aperçu des consignes — visible ici pour la revue Coach seulement.</UiText></p>
              <PilotExercisePreview exercise={selected} language={language} />
            </section>
            <section aria-labelledby={`${instanceId}-machines-title`}>
              <h4 id={`${instanceId}-machines-title`}><UiText>Variantes de machines</UiText></h4>
              {!selected.machines.length ? <p><UiText>Aucun modèle de machine associé à cette fiche.</UiText></p> : <ul className={styles.machines}>
                {selected.machines.map((machine) => <li key={machine.id}>
                  <h5>{machine.manufacturer} · {machine.name}</h5>
                  <p>{machine.evidence === "inferred_family" ? <UiText>{"Rapprochement de famille — modèle à confirmer."}</UiText> : <UiText>{"Modèle identifié — correspondance à valider."}</UiText>}</p>
                  <p>{machine.warning[language]}</p>
                  <p className={styles.note}><UiText>Non disponible pour prescription · </UiText>{machine.modelId}<UiText> · version </UiText>{machine.modelVersion}</p>
                </li>)}
              </ul>}
            </section>
            <p className={styles.mediaNote}><UiText>Aucune image ni vidéo livrée pour cette fiche. Aucun visuel générique ne remplace l’exercice ou la machine.</UiText></p>
          </>}
        </section>
      </div>
      <p className={styles.note}><UiText>Lot source </UiText>{load.value.sourceCatalogVersion}<UiText> · intégration </UiText>{load.value.integrationVersion}<UiText>. La consultation ne valide aucune fiche et ne modifie aucun programme publié.</UiText></p>
    </>}
  </section>;
}
