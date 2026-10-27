"use client";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { AppShell } from "@/components/fe/app-shell";
import { Feedback, Loading } from "@/components/fe/feedback";
import { requestCoachLogout } from "@/features/coach/auth/request-coach-logout";
import { TRAINING_UNITS } from "@/lib/contracts/training";
import { programListSchema, programSnapshotSchema, saveProgramRequestSchema, type DraftExercise, type DraftSession, type ProgramEditor, type ProgramList, type ProgramSnapshot, type SaveProgramRequest } from "@/lib/contracts/training-drafts";
import { addLibraryExercise, compactUniformSets, duplicateWeek, moveItem, newBlock, newProgram, newSession } from "@/lib/training/program-editor";
import styles from "./program-builder.module.css";
import { ProgramPublish } from "./program-publish";
import { CopyWeekDialog } from "./copy-week-dialog";
import { ProgramVersionHistory } from "./program-version-history";
import { UnifiedExercisePicker } from "./unified-exercise-picker";
import { useProgramConfirmation } from "./program-confirmation";
import { ProgramNumberInput, ProgramTempoInput, selectProgramInput } from "./program-inputs";
import { programIssues, type ProgramIssue } from "@/lib/training/program-issues";
import { pilotAllowedUnits, type PilotProgramExercise } from "@/lib/contracts/training-pilot";
import { PublishedExerciseGuidance } from "@/features/training/shared/published-exercise-guidance";

type Text = { fr: string; en: string };
function RequiredMark() { return <span className={styles.required} aria-hidden="true" />; }
function TextPair({ label, value, change, field, required = false }: { label: string; value: Text; change: (value: Text) => void; field?: string; required?: boolean }) {
  return <div className={styles.grid}>{(["fr", "en"] as const).map((locale) => <label key={locale}><span>{label} · {locale === "fr" ? "français" : "anglais"}{required ? <RequiredMark /> : null}</span><input data-program-field={field ? `${field}.${locale}` : undefined} maxLength={300} value={value[locale]} onChange={(event) => change({ ...value, [locale]: event.target.value })} /></label>)}</div>;
}
function authRedirect(response: Response) {
  if (response.status !== 401 && response.status !== 403) return false;
  window.location.replace(response.status === 401 ? "/login" : "/verify-email"); return true;
}
function PrescriptionFields({ value, change, prefix = "", pilot, field }: { value: Omit<DraftExercise["prescription"], "sets" | "prescribedSets">; change: (value: Omit<DraftExercise["prescription"], "sets" | "prescribedSets">) => void; prefix?: string; pilot?: PilotProgramExercise; field: string }) {
  const unitId = useId();
  const measure = pilot?.performance.measure;
  const targetLabel = measure === "duration" ? "Durée cible (secondes)" : measure === "distance" ? "Distance cible (mètres)" : value.unit === "configuration" ? "Configuration cible" : "Charge cible";
  const units = { lb: "lb", kg: "kg", min: "min", sec: "secondes", distance: "mètres", level: "niveau", configuration: "configuration — sans conversion en poids" };
  const allowedUnits = pilot ? pilotAllowedUnits(pilot) : TRAINING_UNITS.filter((unit) => unit !== "configuration");
  return <div className={styles.fields}>
    <label><span>{prefix}{measure && measure !== "repetitions" ? "Passages par série" : "Répétitions"}<RequiredMark /></span><input data-program-field={`${field}.reps`} required maxLength={40} value={value.reps} onFocus={selectProgramInput} onChange={(e) => change({ ...value, reps: e.target.value })} /></label>
    <label><span>{prefix}RIR cible<RequiredMark /></span><ProgramNumberInput data-program-field={`${field}.targetRir`} required min={0} max={10} step={1} value={Number.isFinite(value.targetRir) ? value.targetRir : ""} onChange={(e) => change({ ...value, targetRir: e.target.valueAsNumber })} /></label>
    <label><span>{prefix}Repos (secondes)<RequiredMark /></span><ProgramNumberInput data-program-field={`${field}.restSeconds`} required min={0} max={3600} step={1} value={Number.isFinite(value.restSeconds) ? value.restSeconds : ""} onChange={(e) => change({ ...value, restSeconds: e.target.valueAsNumber })} /></label>
    <label>{prefix}Tempo<ProgramTempoInput data-program-field={`${field}.tempo`} value={value.tempo} change={(tempo) => change({ ...value, tempo })} /></label>
    <label><span>{prefix}{targetLabel}{pilot && ["sec", "distance", "configuration"].includes(value.unit) ? <RequiredMark /> : null}</span><input data-program-field={`${field}.loadTarget`} maxLength={120} value={value.loadTarget} onFocus={selectProgramInput} onChange={(e) => change({ ...value, loadTarget: e.target.value })} /></label>
    <div className={styles.unitField}><label htmlFor={unitId}>{prefix}Unité</label><select data-program-field={`${field}.unit`} id={unitId} value={value.unit} disabled={allowedUnits.length === 1} onChange={(e) => change({ ...value, unit: e.target.value as typeof value.unit })}>{allowedUnits.map((unit) => <option key={unit} value={unit}>{units[unit]}</option>)}</select>{allowedUnits.includes("kg") ? <small className={styles.note}>Choisis l’unité de la charge saisie. Aucun chiffre n’est converti automatiquement.</small> : null}</div>
  </div>;
}

export function ProgramBuilder() {
  const [document, setDocument] = useState<ProgramEditor>(newProgram);
  const [selected, setSelected] = useState<ProgramSnapshot | null>(null);
  const [list, setList] = useState<ProgramList | null>(null); const [listError, setListError] = useState(false);
  const [page, setPage] = useState(0); const [reload, setReload] = useState(0);
  const [weekIndex, setWeekIndex] = useState(0); const [sessionIndex, setSessionIndex] = useState(0);
  const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false); const [opening, setOpening] = useState(false);
  const [uncertain, setUncertain] = useState(false); const [conflict, setConflict] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copyingWeek, setCopyingWeek] = useState(false);
  const copyWeekButton = useRef<HTMLButtonElement>(null);
  const wasCopyingWeek = useRef(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pilotTarget, setPilotTarget] = useState<{ week: number; session: string; block: string; afterExerciseId?: string } | null>(null);
  const pilotButton = useRef<HTMLButtonElement | null>(null);
  const wasChoosingPilot = useRef(false);
  const [error, setError] = useState<string | null>(null); const [success, setSuccess] = useState<string | null>(null);
  const pending = useRef<SaveProgramRequest | null>(null); const busy = useRef(false);
  const { confirm, confirmation } = useProgramConfirmation();
  const editorRef = useRef<HTMLElement>(null); const publicationRef = useRef<HTMLDivElement>(null);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [saveIssues, setSaveIssues] = useState<ProgramIssue[]>([]);
  const [savedScroll, setSavedScroll] = useState(0);
  const locked = saving || opening || uncertain || conflict || publishing || historyLoading;
  const restoreState = useRef({ selected, saving, opening, uncertain, conflict, publishing });
  restoreState.current = { selected, saving, opening, uncertain, conflict, publishing };
  const week = document.weeks[weekIndex]; const session = week.sessions[sessionIndex];
  const warnings = programIssues(document, "publish");
  const sessionField = `weeks.${weekIndex}.sessions.${sessionIndex}`;

  useEffect(() => {
    if (wasCopyingWeek.current && !copyingWeek) copyWeekButton.current?.focus();
    wasCopyingWeek.current = copyingWeek;
  }, [copyingWeek]);

  function onFocusIssue(issue: ProgramIssue) {
    const nextWeek = issue.path[0] === "weeks" && typeof issue.path[1] === "number" ? issue.path[1] : weekIndex;
    const nextSession = issue.path[2] === "sessions" && typeof issue.path[3] === "number" ? issue.path[3] : 0;
    setWeekIndex(nextWeek); setSessionIndex(nextSession); setFocusPath(issue.path.join("."));
  }
  useEffect(() => {
    if (!focusPath) return;
    const frame = requestAnimationFrame(() => {
      let path = focusPath; let field: HTMLElement | null = null;
      while (path && !field) {
        field = editorRef.current?.querySelector<HTMLElement>(`[data-program-field="${CSS.escape(path)}"]`) ?? null;
        path = path.includes(".") ? path.slice(0, path.lastIndexOf(".")) : "";
      }
      if (field) { field.focus({ preventScroll: true }); field.scrollIntoView({ block: "center", behavior: "smooth" }); }
      setFocusPath(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusPath, weekIndex, sessionIndex]);
  useEffect(() => {
    if (!savedScroll) return;
    const frame = requestAnimationFrame(() => { publicationRef.current?.focus({ preventScroll: true }); publicationRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }); });
    return () => cancelAnimationFrame(frame);
  }, [savedScroll]);

  useEffect(() => {
    if (wasChoosingPilot.current && !pilotTarget) pilotButton.current?.focus();
    wasChoosingPilot.current = Boolean(pilotTarget);
  }, [pilotTarget]);

  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const timeout = setTimeout(() => controller.abort(), 8000); setList(null); setListError(false);
    void (async () => {
      try {
        const response = await fetch(`/api/v1/coach/programs?page=${page}`, { cache: "no-store", signal: controller.signal });
        if (authRedirect(response)) return;
        if (!response.ok) throw new Error("LOAD");
        const value = programListSchema.parse((await response.json()).data); if (active) setList(value);
      } catch { if (active) setListError(true); } finally { clearTimeout(timeout); }
    })(); return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [page, reload]);
  useEffect(() => {
    if (!dirty && !uncertain && !publishing && !historyLoading) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect); return () => window.removeEventListener("beforeunload", protect);
  }, [dirty, uncertain, publishing, historyLoading]);

  function change(edit: (copy: ProgramEditor) => void) {
    if (locked) return;
    setDocument((current) => { const copy = structuredClone(current); edit(copy); return copy; }); setDirty(true); setSuccess(null); setError(null); setSaveIssues([]);
  }
  function editSession(edit: (copy: DraftSession) => void) { change((copy) => edit(copy.weeks[weekIndex].sessions[sessionIndex])); }
  function reset(snapshot: ProgramSnapshot | null) {
    setSelected(snapshot); setDocument(snapshot?.document ?? newProgram()); setWeekIndex(0); setSessionIndex(0);
    setDirty(false); setUncertain(false); setConflict(false); setError(null); setSuccess(null); setSaveIssues([]); pending.current = null;
  }
  async function open(id: string | null) {
    if (busy.current || uncertain || (dirty && !await confirm("Abandonner les modifications non enregistrées pour ouvrir un autre brouillon ?", "Ouvrir le brouillon"))) return;
    if (!id) { reset(null); return; }
    busy.current = true; setOpening(true); setError(null);
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`/api/v1/coach/programs/${id}`, { signal: controller.signal, cache: "no-store" });
      if (authRedirect(response)) return;
      if (!response.ok) throw new Error("LOAD");
      const value = programSnapshotSchema.parse((await response.json()).data?.program);
      if (value.id !== id) throw new Error("MISMATCH"); reset(value);
    } catch { setError("Impossible d’ouvrir ce brouillon. Les saisies actuelles sont conservées."); }
    finally { clearTimeout(timeout); setOpening(false); busy.current = false; }
  }
  async function save() {
    if (busy.current || conflict) return;
    const parsed = saveProgramRequestSchema.safeParse(pending.current ?? { id: selected?.id ?? null, expectedVersion: selected?.version ?? 0,
      clientMutationId: crypto.randomUUID(), document: compactUniformSets(document) });
    if (!parsed.success) { setSaveIssues(programIssues(document, "save")); setError("Quelques valeurs doivent être corrigées avant l’enregistrement. Choisis un élément ci-dessous pour y aller directement."); return; }
    pending.current = parsed.data; busy.current = true; setSaving(true); setError(null); setSuccess(null);
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("/api/v1/coach/programs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending.current), signal: controller.signal });
      if (authRedirect(response)) return;
      if ([404,409].includes(response.status)) { pending.current = null; setUncertain(false); setConflict(true); setError("Ce brouillon a changé ou n’est plus accessible. Tes saisies sont conservées. Ouvre sa version actuelle dans la liste avant de reprendre."); return; }
      if (response.status === 400) { pending.current = null; setUncertain(false); setError("Le brouillon contient une valeur invalide ou un exercice indisponible. Vérifie le contenu; rien n’a été publié."); return; }
      if (!response.ok) throw new Error("SAVE");
      const snapshot = programSnapshotSchema.parse((await response.json()).data?.program);
      if ((pending.current.id && snapshot.id !== pending.current.id) || snapshot.document.phaseId !== pending.current.document.phaseId || snapshot.version !== pending.current.expectedVersion + 1) throw new Error("MISMATCH");
      setSelected(snapshot); setDocument(snapshot.document); pending.current = null;
      setDirty(false); setUncertain(false); setSaveIssues([]); setSuccess("Brouillon enregistré. Aucun client ne voit ces modifications."); setReload((value) => value + 1); setSavedScroll((value) => value + 1);
    } catch { setUncertain(true); setError("La confirmation n’est pas arrivée. Réessaie exactement cet enregistrement : aucun doublon ne sera créé."); }
    finally { clearTimeout(timeout); setSaving(false); busy.current = false; }
  }
  async function logout() {
    if (busy.current || uncertain || (dirty && !await confirm("Quitter sans enregistrer le brouillon ?", "Se déconnecter"))) return;
    busy.current = true; setOpening(true);
    if (!await requestCoachLogout(() => window.location.replace("/login"))) { setError("La déconnexion a échoué. Réessaie."); busy.current = false; setOpening(false); }
  }
  async function removeWeek() {
    if (document.weeks.length < 2 || !await confirm("Retirer cette semaine du brouillon ? Les autres semaines seront renumérotées.", "Retirer cette semaine")) return;
    change((copy) => { copy.weeks.splice(weekIndex,1); copy.weeks.forEach((w,i) => { w.number=i+1; }); }); setWeekIndex(0); setSessionIndex(0);
  }

  return <AppShell space="coach" current="programs" documentNavigation accountAction={<button type="button" className="fe-button" disabled={saving || opening || uncertain || publishing || historyLoading} onClick={() => void logout()}>Se déconnecter</button>}>
    <div className={styles.page}>
      <header className={styles.heading}><div><p className="fe-kicker">Entraînement · Brouillons</p><h1 className="fe-title">Construction de programme</h1></div><button type="button" className="fe-button" disabled={saving || opening || uncertain || publishing || historyLoading} onClick={() => void open(null)}>Nouveau programme</button></header>
      <div className={styles.columns}>
        <aside className={styles.drafts} aria-label="Brouillons enregistrés"><h2>Mes brouillons</h2><div className={styles.draftList}>
          {listError ? <Feedback>Impossible de charger les brouillons. Aucun programme n’a été supprimé.</Feedback> : !list ? <Loading>Chargement…</Loading> : <>
            {!list.items.length ? <p>Aucun brouillon enregistré.</p> : <ul className={styles.list}>{list.items.map((item) => <li key={item.id}><strong>{item.title.fr || item.title.en}</strong><p>{item.weekCount} semaine(s) · version {item.version}</p><button className="fe-button" type="button" disabled={saving || opening || uncertain || publishing || historyLoading} onClick={() => void open(item.id)}>Ouvrir {item.title.fr || item.title.en}</button></li>)}</ul>}
            <div className={styles.actions}><button className="fe-button" type="button" disabled={!page} onClick={() => setPage(page-1)}>Précédents</button><span>Page {page+1}</span><button className="fe-button" type="button" disabled={(page+1)*20>=list.total} onClick={() => setPage(page+1)}>Suivants</button></div>
          </>}
          <button className="fe-button" type="button" onClick={() => setReload(reload+1)}>Recharger les brouillons</button>
          </div>
          <div className={styles.save}>
            <p>{dirty ? "Modifications non enregistrées." : selected ? `Brouillon enregistré · version ${selected.version}.` : "Brouillon non enregistré."}</p>
            <button className="fe-button fe-button-primary" type="button" disabled={saving || opening || conflict || publishing || historyLoading} onClick={() => void save()}>{saving ? "Enregistrement…" : uncertain ? "Réessayer le même enregistrement" : "Enregistrer le brouillon"}</button>
          </div>
        </aside>
        <section ref={editorRef} className={styles.editor} aria-label="Constructeur de programme">
          {opening ? <Loading>Ouverture…</Loading> : null}
          {error ? <Feedback>{error}</Feedback> : null}
          {success && !selected ? <Feedback tone="success">{success}</Feedback> : null}
          {saveIssues.length ? <ul className={styles.warning}>{saveIssues.map((issue, index) => <li key={index}><button type="button" className={styles.issueLink} onClick={() => onFocusIssue(issue)}>{issue.message}</button></li>)}</ul> : null}
          <fieldset disabled={locked}><legend className="fe-sr-only">Contenu du brouillon</legend>
            <div className={styles.panel}><h2>{selected ? "Modifier le brouillon" : "Nouveau brouillon"}</h2><p className={styles.note}>* À renseigner. Pour les titres, une langue suffit ; l’autre peut être complétée ensuite. Les objectifs pilotes sont requis avant publication, pas pour garder un brouillon.</p><TextPair required field="title" label="Titre du programme" value={document.title} change={(value) => change((copy) => { copy.title=value; })} />
              {selected ? <ProgramVersionHistory snapshot={selected} disabled={saving || opening || uncertain || conflict || publishing} onLoading={(value) => { busy.current = value; setHistoryLoading(value); }} onRestore={async (previous, version) => {
                const expected = selected;
                const canRestore = () => {
                  const latest = restoreState.current;
                  return !latest.saving && !latest.opening && !latest.uncertain && !latest.conflict && !latest.publishing && latest.selected?.id === expected.id && latest.selected?.version === expected.version;
                };
                if (!canRestore()) return;
                if (!await confirm(`Reprendre les données de la version ${version} dans ce brouillon ?${dirty ? " Les modifications non enregistrées seront remplacées." : ""} La sauvegarde actuelle et les programmes publiés seront conservés.`, `Reprendre la version ${version}`, "Reprendre une sauvegarde")) return;
                if (!canRestore()) return;
                setDocument(structuredClone(previous)); setDirty(true); setSuccess(null); setError(null); setSaveIssues([]); setWeekIndex(0); setSessionIndex(0);
              }} /> : null}
            </div>
            <div className={styles.panel}>
              <div className={styles.tabs} aria-label="Semaines">{document.weeks.map((w,i) => <button className="fe-button" type="button" key={w.number} aria-pressed={i===weekIndex} onClick={() => { setWeekIndex(i); setSessionIndex(0); }}>Semaine {w.number}</button>)}</div>
              <div className={styles.actions}>
                <button className="fe-button" type="button" disabled={document.weeks.length>=52} onClick={() => { change((copy) => { copy.weeks.push({ number: copy.weeks.length+1, objective: {fr:"",en:""}, sessions:[] }); }); setWeekIndex(document.weeks.length); setSessionIndex(0); }}>Ajouter une semaine</button>
                <button className="fe-button" type="button" disabled={document.weeks.length>=52} onClick={() => { change((copy) => { copy.weeks=duplicateWeek(copy,weekIndex).weeks; }); setWeekIndex(weekIndex+1); setSessionIndex(0); }}>Dupliquer cette semaine</button>
                <button ref={copyWeekButton} className="fe-button" type="button" onClick={() => setCopyingWeek(true)}>Copier vers d’autres semaines</button>
                <button className="fe-button" type="button" disabled={document.weeks.length<2} onClick={() => void removeWeek()}>Retirer cette semaine</button>
              </div>
              <TextPair field={`weeks.${weekIndex}.objective`} label="Objectif de la semaine" value={week.objective} change={(value) => change((copy) => { copy.weeks[weekIndex].objective=value; })} />
              <button data-program-field={`weeks.${weekIndex}.sessions`} className="fe-button" type="button" disabled={week.sessions.length>=14} onClick={() => { change((copy) => { copy.weeks[weekIndex].sessions.push(newSession()); }); setSessionIndex(week.sessions.length); }}>Ajouter une séance</button>
              <div className={styles.tabs} aria-label="Séances">{week.sessions.map((s,i) => <button className="fe-button" type="button" key={s.id} aria-pressed={i===sessionIndex} onClick={() => setSessionIndex(i)}>{s.title.fr || s.title.en || `Séance ${i+1}`}</button>)}</div>
              {!session ? <p>Aucune séance pour cette semaine. Tu peux déjà enregistrer ce brouillon.</p> : <>
                <TextPair required field={`${sessionField}.title`} label="Titre de la séance" value={session.title} change={(value) => editSession((s) => { s.title=value; })} />
                <div className={styles.grid}>
                  <label>Type de séance<select data-program-field={`${sessionField}.type`} value={session.type} onChange={async (e) => { const type=e.target.value as DraftSession["type"]; if (type==="complete-rest" && session.blocks.length && !await confirm("Passer au repos complet retirera les blocs de cette séance. Continuer ?", "Passer au repos complet")) return; editSession((s) => { s.type=type; if(type==="complete-rest") s.blocks=[]; }); }}>{[["training","Entraînement"],["active-recovery","Récupération active"],["complete-rest","Repos complet"],["posing","Posing"],["mobility","Mobilité"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className={styles.check}><input type="checkbox" checked={session.required} onChange={(e) => editSession((s) => { s.required=e.target.checked; })} />Séance obligatoire</label>
                  <label>Planification<select value={session.schedule.mode} onChange={(e) => editSession((s) => { s.schedule={ mode:e.target.value as DraftSession["schedule"]["mode"], day:e.target.value==="flexible" ? null : s.schedule.day ?? 1 }; })}><option value="flexible">Flexible — sans jour imposé</option><option value="suggested">Jour suggéré</option><option value="fixed">Jour fixe</option></select></label>
                  {session.schedule.mode!=="flexible" ? <label>Jour<select value={session.schedule.day ?? 1} onChange={(e) => editSession((s) => { s.schedule.day=Number(e.target.value); })}>{["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"].map((label,i) => <option key={label} value={i+1}>{label}</option>)}</select></label> : null}
                </div>
                <TextPair field={`${sessionField}.warmup`} label="Consignes / but de la séance" value={session.warmup} change={(value) => editSession((s) => { s.warmup=value; })} />
                {session.type !== "complete-rest" ? <div className={styles.actions}>
                  <button data-program-field={`${sessionField}.blocks`} className="fe-button" type="button" disabled={session.blocks.length>=20} onClick={() => editSession((s) => { s.blocks.push(newBlock()); })}>Ajouter un bloc</button>
                  <button className="fe-button" type="button" disabled={session.blocks.length>=20} onClick={() => editSession((s) => { const block = newBlock(); block.label = { fr: "Échauffement", en: "Warm-up" }; s.blocks.unshift(block); })}>Ajouter un bloc d’échauffement</button>
                </div> : null}
                <div className={styles.actions}>
                  {([-1,1] as const).map((direction) => <button className="fe-button" type="button" key={direction} disabled={sessionIndex+direction<0 || sessionIndex+direction>=week.sessions.length} onClick={() => { change((copy) => { copy.weeks[weekIndex].sessions=moveItem(copy.weeks[weekIndex].sessions,sessionIndex,direction); }); setSessionIndex(sessionIndex+direction); }}>{direction===-1 ? "Avancer la séance" : "Reculer la séance"}</button>)}
                  <button className="fe-button" type="button" onClick={async () => { if(await confirm("Retirer cette séance et ses blocs du brouillon ?", "Retirer la séance")) { change((copy) => { copy.weeks[weekIndex].sessions.splice(sessionIndex,1); }); setSessionIndex(0); } }}>Retirer la séance</button>
                </div>
              </>}
            </div>
            {session?.blocks.map((block,b) => <section className={styles.block} key={block.id} aria-label={`Bloc ${b+1}`}>
              <h3 className={styles.blockTitle}>Bloc {b+1}{block.label.fr || block.label.en ? ` · ${block.label.fr || block.label.en}` : ""}</h3><TextPair field={`${sessionField}.blocks.${b}.label`} label="Nom du bloc" value={block.label} change={(value) => editSession((s) => { s.blocks[b].label=value; })} />
              <div className={styles.grid}><label>Mode du bloc<select data-program-field={`${sessionField}.blocks.${b}.mode`} value={block.mode} onChange={(e) => editSession((s) => { s.blocks[b].mode=e.target.value as typeof block.mode; })}><option value="standard">Standard</option><option value="superset">Superset — deux exercices</option><option value="finisher">Finisher — deux exercices ou plus</option></select></label><label>Repos après le tour (secondes)<ProgramNumberInput data-program-field={`${sessionField}.blocks.${b}.restSeconds`} min={0} max={3600} value={Number.isFinite(block.restSeconds) ? block.restSeconds : ""} onChange={(e) => editSession((s) => { s.blocks[b].restSeconds=e.target.valueAsNumber; })} /></label></div>
              {block.mode!=="standard" ? <p className={styles.note}>Les exercices du tour doivent avoir le même nombre de séries. Un groupe incomplet reste enregistrable en brouillon.</p> : null}
              <div className={styles.actions}>{([-1,1] as const).map((direction) => <button className="fe-button" type="button" key={direction} disabled={b+direction<0 || b+direction>=session.blocks.length} onClick={() => editSession((s) => { s.blocks=moveItem(s.blocks,b,direction); })}>{direction===-1 ? "Monter le bloc" : "Descendre le bloc"}</button>)}<button className="fe-button" type="button" onClick={async () => { if(await confirm("Retirer ce bloc et ses exercices ?", "Retirer le bloc")) editSession((s) => { s.blocks.splice(b,1); }); }}>Retirer le bloc</button></div>
              {block.exercises.map((exercise,e) => {
                const p=exercise.prescription;
                const update=(edit:(copy:DraftExercise)=>void) => editSession((s) => edit(s.blocks[b].exercises[e]));
                const { sets: _sets, prescribedSets: _details, ...common }=p; void _sets; void _details;
                const exerciseField = `${sessionField}.blocks.${b}.exercises.${e}`;
                return <Fragment key={exercise.id}><article className={styles.exercise} aria-label={`Exercice ${e+1}`}>
                  <h4 className={styles.exerciseTitle}>{exercise.pilot?.name.fr ?? exercise.name}</h4>
                  {exercise.pilot ? <div className={styles.pilotSnapshot}>
                    <p className={styles.note}>Exercice pilote · test staging · {exercise.pilot.sourceId} · version {exercise.pilot.sourceVersion}</p>
                    <p>{exercise.pilot.performance.counting.fr}</p>
                    <p>{exercise.pilot.performance.load.fr}</p>
                    <details><summary>Lire les consignes complètes conservées avec ce programme</summary>
                      {(["fr", "en"] as const).map((locale) => <section key={locale} lang={locale}>
                        <h5>{exercise.pilot!.name[locale]} · {locale === "fr" ? "Français" : "English"}</h5>
                        <PublishedExerciseGuidance exercise={exercise} french={locale === "fr"} coach />
                      </section>)}
                    </details>
                    {p.unit === "sec" || p.unit === "distance" || p.unit === "configuration" ? <p className={styles.note}>Choisis {p.unit === "sec" ? "la durée cible en secondes" : p.unit === "distance" ? "la distance cible en mètres" : "la configuration à utiliser"} avant de publier. Aucun objectif n’est inventé pour ton client.</p> : null}
                  </div> : null}
                  <TextPair field={`${exerciseField}.cue`} label="Consigne de l’exercice" value={exercise.cue} change={(value) => update((x) => { x.cue=value; })} />
                  <label><span>Nombre de séries<RequiredMark /></span><ProgramNumberInput required data-program-field={`${exerciseField}.prescription.sets`} min={1} max={20} value={Number.isFinite(p.sets) ? p.sets : ""} onChange={async (event) => { const count=event.target.valueAsNumber; if(p.prescribedSets && count<p.sets && !await confirm("Réduire le nombre de séries retire les prescriptions des dernières séries. Continuer ?", "Réduire les séries")) return; update((x) => { x.prescription.sets=count; if(x.prescription.prescribedSets && Number.isInteger(count) && count>=1 && count<=20) x.prescription.prescribedSets=Array.from({length:count},(_,i)=> x.prescription.prescribedSets?.[i] ?? {...common}); }); }} /></label>
                  <PrescriptionFields field={`${exerciseField}.prescription`} value={common} pilot={exercise.pilot} change={(value) => update((x) => { x.prescription={...x.prescription,...value}; })} />
                  <label className={styles.check}><input type="checkbox" checked={Boolean(p.prescribedSets)} disabled={!Number.isInteger(p.sets) || p.sets<1 || p.sets>20} onChange={async (event) => { const checked=event.target.checked; if(!checked && !await confirm("Utiliser la prescription commune pour toutes les séries ?", "Utiliser la prescription commune")) return; update((x) => { if(checked) x.prescription.prescribedSets=Array.from({length:p.sets},()=>({...common})); else delete x.prescription.prescribedSets; }); }} />Prescriptions différentes selon la série</label>
                  {p.prescribedSets?.map((set,i) => <div key={i}><h5>Série {i+1}</h5><PrescriptionFields field={`${exerciseField}.prescription.prescribedSets.${i}`} prefix={`Série ${i+1} · `} value={set} pilot={exercise.pilot} change={(value) => update((x) => { x.prescription.prescribedSets![i]=value; })} /></div>)}
                  <div className={styles.actions}>{([-1,1] as const).map((direction) => <button className="fe-button" type="button" key={direction} disabled={e+direction<0 || e+direction>=block.exercises.length} onClick={() => editSession((s) => { s.blocks[b].exercises=moveItem(s.blocks[b].exercises,e,direction); })}>{direction===-1 ? "Monter l’exercice" : "Descendre l’exercice"}</button>)}<button className="fe-button" type="button" onClick={async () => { if(await confirm("Retirer cet exercice de la séance ? La bibliothèque reste intacte.", "Retirer l’exercice")) editSession((s) => { s.blocks[b].exercises.splice(e,1); }); }}>Retirer l’exercice</button></div>
                </article>{block.exercises.length<30 ? <button data-program-field={e === 0 ? `${sessionField}.blocks.${b}.exercises` : undefined} className={`fe-button ${styles.addExercise}`} type="button" onClick={(event) => { pilotButton.current = event.currentTarget; setPilotTarget({ week: week.number, session: session.id, block: block.id, afterExerciseId: exercise.id }); }} aria-label={`Ajouter un exercice après ${exercise.pilot?.name.fr ?? exercise.name}`}>+ Ajouter un exercice</button> : null}</Fragment>;
              })}
              {!block.exercises.length ? <button data-program-field={`${sessionField}.blocks.${b}.exercises`} className={`fe-button ${styles.addExercise}`} type="button" onClick={(event) => { pilotButton.current = event.currentTarget; setPilotTarget({ week: week.number, session: session.id, block: block.id }); }}>Ajouter un exercice</button> : null}
              {block.exercises.length>=30 ? <p>Limite de 30 exercices dans ce bloc.</p> : null}
            </section>)}
            {session && session.type!=="complete-rest" && session.blocks.length>0 ? <button className="fe-button" type="button" disabled={session.blocks.length>=20} onClick={() => editSession((s) => { s.blocks.push(newBlock()); })}>Ajouter un autre bloc</button> : null}
          </fieldset>
          {(dirty || !selected) && warnings.length ? <div className={styles.panel}><button className={styles.issueSummary} type="button" disabled={locked} onClick={() => onFocusIssue(warnings[0])}>{warnings.length} élément(s) à compléter · Aller au premier</button><details><summary>{warnings.length} élément(s) à compléter — sauvegarde autorisée</summary><ul className={styles.warning}>{warnings.map((issue,i) => <li key={i}><button type="button" className={styles.issueLink} onClick={() => onFocusIssue(issue)}>{issue.message}</button></li>)}</ul></details></div> : null}
          {selected ? <div ref={publicationRef} className={`${styles.panel} ${styles.publication}`} tabIndex={-1} aria-label="Étape de publication">
            {success ? <Feedback tone="success">{success}</Feedback> : null}
            <ProgramPublish key={selected.id} snapshot={selected} disabled={dirty || locked} onIssue={onFocusIssue} lock={(value) => { setPublishing(value); busy.current=value; }} />
          </div> : null}
        </section>
      </div>
    </div>
    {confirmation}
    {copyingWeek ? <CopyWeekDialog program={document} sourceIndex={weekIndex} locked={locked}
      onClose={() => setCopyingWeek(false)} onCopy={(next, count) => {
        if (locked) return;
        change((copy) => { copy.weeks = next.weeks; });
        setSuccess(`Semaine ${weekIndex + 1} copiée vers ${count} semaine${count > 1 ? "s" : ""}. Enregistre ton brouillon pour conserver ces copies. Rien n’a été publié.`);
        setCopyingWeek(false);
      }} /> : null}
    {pilotTarget ? <UnifiedExercisePicker onClose={() => setPilotTarget(null)} onAdd={(exercise) => {
      if (locked) return;
      change((copy) => {
        const target = copy.weeks.find((w) => w.number === pilotTarget.week)?.sessions.find((s) => s.id === pilotTarget.session)?.blocks.find((b) => b.id === pilotTarget.block);
        if (target && target.exercises.length < 30) {
          const after = pilotTarget.afterExerciseId ? target.exercises.findIndex((item) => item.id === pilotTarget.afterExerciseId) : target.exercises.length - 1;
          target.exercises.splice(after + 1, 0, addLibraryExercise(exercise));
        }
      });
      setPilotTarget(null);
    }} /> : null}
  </AppShell>;
}
