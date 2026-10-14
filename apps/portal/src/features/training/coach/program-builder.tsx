"use client";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/fe/app-shell";
import { Feedback, Loading } from "@/components/fe/feedback";
import { requestCoachLogout } from "@/features/coach/auth/request-coach-logout";
import { TRAINING_UNITS, exerciseListSchema, type ExerciseList, type ExerciseSnapshot } from "@/lib/contracts/training";
import { programListSchema, programSnapshotSchema, saveProgramRequestSchema, type DraftExercise, type DraftSession, type ProgramEditor, type ProgramList, type ProgramSnapshot, type SaveProgramRequest } from "@/lib/contracts/training-drafts";
import { addLibraryExercise, compactUniformSets, draftWarnings, duplicateWeek, moveItem, newBlock, newProgram, newSession } from "@/lib/training/program-editor";
import styles from "./program-builder.module.css";
import { ProgramPublish } from "./program-publish";

type Text = { fr: string; en: string };
function TextPair({ label, value, change }: { label: string; value: Text; change: (value: Text) => void }) {
  return <div className={styles.grid}>{(["fr", "en"] as const).map((locale) => <label key={locale}>{label} · {locale === "fr" ? "français" : "anglais"}<input maxLength={300} value={value[locale]} onChange={(event) => change({ ...value, [locale]: event.target.value })} /></label>)}</div>;
}
function authRedirect(response: Response) {
  if (response.status !== 401 && response.status !== 403) return false;
  window.location.replace(response.status === 401 ? "/login" : "/verify-email"); return true;
}
function PrescriptionFields({ value, change, prefix = "" }: { value: Omit<DraftExercise["prescription"], "sets" | "prescribedSets">; change: (value: Omit<DraftExercise["prescription"], "sets" | "prescribedSets">) => void; prefix?: string }) {
  return <div className={styles.fields}>
    <label>{prefix}Répétitions<input maxLength={40} value={value.reps} onChange={(e) => change({ ...value, reps: e.target.value })} /></label>
    <label>{prefix}RIR cible<input type="number" min={0} max={10} step={1} value={Number.isFinite(value.targetRir) ? value.targetRir : ""} onChange={(e) => change({ ...value, targetRir: e.target.valueAsNumber })} /></label>
    <label>{prefix}Repos (secondes)<input type="number" min={0} max={3600} step={1} value={Number.isFinite(value.restSeconds) ? value.restSeconds : ""} onChange={(e) => change({ ...value, restSeconds: e.target.valueAsNumber })} /></label>
    <label>{prefix}Tempo<input maxLength={40} value={value.tempo} onChange={(e) => change({ ...value, tempo: e.target.value })} /></label>
    <label>{prefix}Charge cible<input maxLength={120} value={value.loadTarget} onChange={(e) => change({ ...value, loadTarget: e.target.value })} /></label>
    <label>{prefix}Unité<select value={value.unit} onChange={(e) => change({ ...value, unit: e.target.value as typeof value.unit })}>{TRAINING_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
  </div>;
}
function ExercisePicker({ add }: { add: (exercise: ExerciseSnapshot) => void }) {
  const [query, setQuery] = useState(""); const [filter, setFilter] = useState({ query: "", page: 0 });
  const [list, setList] = useState<ExerciseList | null>(null); const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const timeout = setTimeout(() => controller.abort(), 8000); setList(null); setError(false);
    void (async () => {
      try {
        const response = await fetch(`/api/v1/coach/exercises?${new URLSearchParams({ query: filter.query, page: String(filter.page), archived: "false" })}`, { signal: controller.signal, cache: "no-store" });
        if (authRedirect(response)) return;
        if (!response.ok) throw new Error("LOAD");
        const value = exerciseListSchema.parse((await response.json()).data); if (active) setList(value);
      } catch { if (active) setError(true); } finally { clearTimeout(timeout); }
    })();
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [filter]);
  return <div className={styles.picker}>
    <label>Rechercher un exercice<input value={query} maxLength={120} onChange={(e) => setQuery(e.target.value)} /></label>
    <button className="fe-button" type="button" onClick={() => setFilter({ query, page: 0 })}>Chercher dans la bibliothèque</button>
    {error ? <Feedback>Bibliothèque indisponible. Réessaie la recherche; tes prescriptions sont conservées.</Feedback> : !list ? <Loading>Chargement des exercices…</Loading> : <>
      {!list.items.length ? <p>Aucun exercice disponible. Crée-le dans la bibliothèque après avoir enregistré ton brouillon.</p> : <ul>{list.items.map((item) => <li key={item.id}><span>{item.name} · {item.equipment || "Sans équipement précisé"}</span><button className="fe-button" type="button" onClick={() => add(item)}>Ajouter {item.name}</button></li>)}</ul>}
      <div className={styles.actions}><button className="fe-button" type="button" disabled={!filter.page} onClick={() => setFilter({ ...filter, page: filter.page - 1 })}>Exercices précédents</button><span>Page {filter.page + 1}</span><button className="fe-button" type="button" disabled={(filter.page + 1) * 50 >= list.total} onClick={() => setFilter({ ...filter, page: filter.page + 1 })}>Exercices suivants</button></div>
    </>}
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
  const [error, setError] = useState<string | null>(null); const [success, setSuccess] = useState<string | null>(null);
  const pending = useRef<SaveProgramRequest | null>(null); const busy = useRef(false);
  const locked = saving || opening || uncertain || conflict || publishing;
  const week = document.weeks[weekIndex]; const session = week.sessions[sessionIndex];
  const warnings = draftWarnings(document);

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
    if (!dirty && !uncertain && !publishing) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect); return () => window.removeEventListener("beforeunload", protect);
  }, [dirty, uncertain, publishing]);

  function change(edit: (copy: ProgramEditor) => void) {
    if (locked) return;
    setDocument((current) => { const copy = structuredClone(current); edit(copy); return copy; }); setDirty(true); setSuccess(null); setError(null);
  }
  function editSession(edit: (copy: DraftSession) => void) { change((copy) => edit(copy.weeks[weekIndex].sessions[sessionIndex])); }
  function reset(snapshot: ProgramSnapshot | null) {
    setSelected(snapshot); setDocument(snapshot?.document ?? newProgram()); setWeekIndex(0); setSessionIndex(0);
    setDirty(false); setUncertain(false); setConflict(false); setError(null); setSuccess(null); pending.current = null;
  }
  async function open(id: string | null) {
    if (busy.current || uncertain || (dirty && !window.confirm("Abandonner les modifications non enregistrées pour ouvrir un autre brouillon ?"))) return;
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
    if (!parsed.success) { setError("Vérifie le titre, les répétitions et les valeurs numériques (séries 1–20, RIR 0–10, repos 0–3600). Les brouillons peuvent rester incomplets."); return; }
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
      setDirty(false); setUncertain(false); setSuccess("Brouillon enregistré. Aucun client ne voit ces modifications."); setReload((value) => value + 1);
    } catch { setUncertain(true); setError("La confirmation n’est pas arrivée. Réessaie exactement cet enregistrement : aucun doublon ne sera créé."); }
    finally { clearTimeout(timeout); setSaving(false); busy.current = false; }
  }
  async function logout() {
    if (busy.current || uncertain || (dirty && !window.confirm("Quitter sans enregistrer le brouillon ?"))) return;
    busy.current = true; setOpening(true);
    if (!await requestCoachLogout(() => window.location.replace("/login"))) { setError("La déconnexion a échoué. Réessaie."); busy.current = false; setOpening(false); }
  }
  function removeWeek() {
    if (document.weeks.length < 2 || !window.confirm("Retirer cette semaine du brouillon ? Les autres semaines seront renumérotées.")) return;
    change((copy) => { copy.weeks.splice(weekIndex,1); copy.weeks.forEach((w,i) => { w.number=i+1; }); }); setWeekIndex(0); setSessionIndex(0);
  }

  return <AppShell space="coach" current="programs" documentNavigation accountAction={<button type="button" className="fe-button" disabled={saving || opening || uncertain || publishing} onClick={() => void logout()}>Se déconnecter</button>}>
    <div className={styles.page}>
      <header className={styles.heading}><div><p className="fe-kicker">ENTRAÎNEMENT · BROUILLONS</p><h1 className="fe-title">Tes programmes.</h1><p>Construis ton plan à ton rythme. Rien n’est transmis sans publication.</p></div><button type="button" className="fe-button" disabled={saving || opening || uncertain || publishing} onClick={() => void open(null)}>Nouveau programme</button></header>
      <div className={styles.columns}>
        <aside className={styles.panel} aria-label="Brouillons enregistrés"><h2>Mes brouillons</h2>
          {listError ? <Feedback>Impossible de charger les brouillons. Aucun programme n’a été supprimé.</Feedback> : !list ? <Loading>Chargement…</Loading> : <>
            {!list.items.length ? <p>Aucun brouillon enregistré.</p> : <ul className={styles.list}>{list.items.map((item) => <li key={item.id}><strong>{item.title.fr || item.title.en}</strong><p>{item.weekCount} semaine(s) · version {item.version}</p><button className="fe-button" type="button" disabled={saving || opening || uncertain || publishing} onClick={() => void open(item.id)}>Ouvrir {item.title.fr || item.title.en}</button></li>)}</ul>}
            <div className={styles.actions}><button className="fe-button" type="button" disabled={!page} onClick={() => setPage(page-1)}>Précédents</button><span>Page {page+1}</span><button className="fe-button" type="button" disabled={(page+1)*20>=list.total} onClick={() => setPage(page+1)}>Suivants</button></div>
          </>}
          <button className="fe-button" type="button" onClick={() => setReload(reload+1)}>Recharger les brouillons</button>
        </aside>
        <section className={styles.editor} aria-label="Constructeur de programme">
          {opening ? <Loading>Ouverture…</Loading> : null}
          <fieldset disabled={locked}><legend className="fe-sr-only">Contenu du brouillon</legend>
            <div className={styles.panel}><h2>{selected ? "Modifier le brouillon" : "Nouveau brouillon"}</h2><TextPair label="Titre du programme" value={document.title} change={(value) => change((copy) => { copy.title=value; })} /></div>
            <div className={styles.panel}>
              <div className={styles.tabs} aria-label="Semaines">{document.weeks.map((w,i) => <button className="fe-button" type="button" key={w.number} aria-pressed={i===weekIndex} onClick={() => { setWeekIndex(i); setSessionIndex(0); }}>Semaine {w.number}</button>)}</div>
              <div className={styles.actions}>
                <button className="fe-button" type="button" disabled={document.weeks.length>=52} onClick={() => { change((copy) => { copy.weeks.push({ number: copy.weeks.length+1, objective: {fr:"",en:""}, sessions:[] }); }); setWeekIndex(document.weeks.length); setSessionIndex(0); }}>Ajouter une semaine</button>
                <button className="fe-button" type="button" disabled={document.weeks.length>=52} onClick={() => { change((copy) => { copy.weeks=duplicateWeek(copy,weekIndex).weeks; }); setWeekIndex(weekIndex+1); setSessionIndex(0); }}>Dupliquer cette semaine</button>
                <button className="fe-button" type="button" disabled={document.weeks.length<2} onClick={removeWeek}>Retirer cette semaine</button>
              </div>
              <TextPair label="Objectif de la semaine" value={week.objective} change={(value) => change((copy) => { copy.weeks[weekIndex].objective=value; })} />
              <div className={styles.tabs} aria-label="Séances">{week.sessions.map((s,i) => <button className="fe-button" type="button" key={s.id} aria-pressed={i===sessionIndex} onClick={() => setSessionIndex(i)}>{s.title.fr || s.title.en || `Séance ${i+1}`}</button>)}</div>
              <button className="fe-button" type="button" disabled={week.sessions.length>=14} onClick={() => { change((copy) => { copy.weeks[weekIndex].sessions.push(newSession()); }); setSessionIndex(week.sessions.length); }}>Ajouter une séance</button>
              {!session ? <p>Aucune séance pour cette semaine. Tu peux déjà enregistrer ce brouillon.</p> : <>
                <TextPair label="Titre de la séance" value={session.title} change={(value) => editSession((s) => { s.title=value; })} />
                <div className={styles.grid}>
                  <label>Type de séance<select value={session.type} onChange={(e) => { const type=e.target.value as DraftSession["type"]; if (type==="complete-rest" && session.blocks.length && !window.confirm("Passer au repos complet retirera les blocs de cette séance. Continuer ?")) return; editSession((s) => { s.type=type; if(type==="complete-rest") s.blocks=[]; }); }}>{[["training","Entraînement"],["active-recovery","Récupération active"],["complete-rest","Repos complet"],["posing","Posing"],["mobility","Mobilité"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className={styles.check}><input type="checkbox" checked={session.required} onChange={(e) => editSession((s) => { s.required=e.target.checked; })} />Séance obligatoire</label>
                  <label>Planification<select value={session.schedule.mode} onChange={(e) => editSession((s) => { s.schedule={ mode:e.target.value as DraftSession["schedule"]["mode"], day:e.target.value==="flexible" ? null : s.schedule.day ?? 1 }; })}><option value="flexible">Flexible — sans jour imposé</option><option value="suggested">Jour suggéré</option><option value="fixed">Jour fixe</option></select></label>
                  {session.schedule.mode!=="flexible" ? <label>Jour<select value={session.schedule.day ?? 1} onChange={(e) => editSession((s) => { s.schedule.day=Number(e.target.value); })}>{["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"].map((label,i) => <option key={label} value={i+1}>{label}</option>)}</select></label> : null}
                </div>
                <TextPair label="Échauffement et consignes" value={session.warmup} change={(value) => editSession((s) => { s.warmup=value; })} />
                <div className={styles.actions}>
                  {([-1,1] as const).map((direction) => <button className="fe-button" type="button" key={direction} disabled={sessionIndex+direction<0 || sessionIndex+direction>=week.sessions.length} onClick={() => { change((copy) => { copy.weeks[weekIndex].sessions=moveItem(copy.weeks[weekIndex].sessions,sessionIndex,direction); }); setSessionIndex(sessionIndex+direction); }}>{direction===-1 ? "Avancer la séance" : "Reculer la séance"}</button>)}
                  <button className="fe-button" type="button" onClick={() => { if(window.confirm("Retirer cette séance et ses blocs du brouillon ?")) { change((copy) => { copy.weeks[weekIndex].sessions.splice(sessionIndex,1); }); setSessionIndex(0); } }}>Retirer la séance</button>
                </div>
              </>}
            </div>
            {session?.blocks.map((block,b) => <section className={styles.block} key={block.id} aria-label={`Bloc ${b+1}`}>
              <h3>Bloc {b+1}</h3><TextPair label="Nom du bloc" value={block.label} change={(value) => editSession((s) => { s.blocks[b].label=value; })} />
              <div className={styles.grid}><label>Mode du bloc<select value={block.mode} onChange={(e) => editSession((s) => { s.blocks[b].mode=e.target.value as typeof block.mode; })}><option value="standard">Standard</option><option value="superset">Superset — deux exercices</option><option value="finisher">Finisher — deux exercices ou plus</option></select></label><label>Repos après le tour (secondes)<input type="number" min={0} max={3600} value={Number.isFinite(block.restSeconds) ? block.restSeconds : ""} onChange={(e) => editSession((s) => { s.blocks[b].restSeconds=e.target.valueAsNumber; })} /></label></div>
              {block.mode!=="standard" ? <p className={styles.note}>Les exercices du tour doivent avoir le même nombre de séries. Un groupe incomplet reste enregistrable en brouillon.</p> : null}
              <div className={styles.actions}>{([-1,1] as const).map((direction) => <button className="fe-button" type="button" key={direction} disabled={b+direction<0 || b+direction>=session.blocks.length} onClick={() => editSession((s) => { s.blocks=moveItem(s.blocks,b,direction); })}>{direction===-1 ? "Monter le bloc" : "Descendre le bloc"}</button>)}<button className="fe-button" type="button" onClick={() => { if(window.confirm("Retirer ce bloc et ses exercices ?")) editSession((s) => { s.blocks.splice(b,1); }); }}>Retirer le bloc</button></div>
              {block.exercises.map((exercise,e) => {
                const p=exercise.prescription;
                const update=(edit:(copy:DraftExercise)=>void) => editSession((s) => edit(s.blocks[b].exercises[e]));
                const { sets: _sets, prescribedSets: _details, ...common }=p; void _sets; void _details;
                return <article className={styles.exercise} key={exercise.id} aria-label={`Exercice ${e+1}`}>
                  <h4>{exercise.name}</h4><TextPair label="Consigne de l’exercice" value={exercise.cue} change={(value) => update((x) => { x.cue=value; })} />
                  <label>Nombre de séries<input type="number" min={1} max={20} value={Number.isFinite(p.sets) ? p.sets : ""} onChange={(event) => { const count=event.target.valueAsNumber; if(p.prescribedSets && count<p.sets && !window.confirm("Réduire le nombre de séries retire les prescriptions des dernières séries. Continuer ?")) return; update((x) => { x.prescription.sets=count; if(x.prescription.prescribedSets && Number.isInteger(count) && count>=1 && count<=20) x.prescription.prescribedSets=Array.from({length:count},(_,i)=> x.prescription.prescribedSets?.[i] ?? {...common}); }); }} /></label>
                  <PrescriptionFields value={common} change={(value) => update((x) => { x.prescription={...x.prescription,...value}; })} />
                  <label className={styles.check}><input type="checkbox" checked={Boolean(p.prescribedSets)} disabled={!Number.isInteger(p.sets) || p.sets<1 || p.sets>20} onChange={(event) => { if(!event.target.checked && !window.confirm("Utiliser la prescription commune pour toutes les séries ?")) return; update((x) => { if(event.target.checked) x.prescription.prescribedSets=Array.from({length:p.sets},()=>({...common})); else delete x.prescription.prescribedSets; }); }} />Prescriptions différentes selon la série</label>
                  {p.prescribedSets?.map((set,i) => <div key={i}><h5>Série {i+1}</h5><PrescriptionFields prefix={`Série ${i+1} · `} value={set} change={(value) => update((x) => { x.prescription.prescribedSets![i]=value; })} /></div>)}
                  <div className={styles.actions}>{([-1,1] as const).map((direction) => <button className="fe-button" type="button" key={direction} disabled={e+direction<0 || e+direction>=block.exercises.length} onClick={() => editSession((s) => { s.blocks[b].exercises=moveItem(s.blocks[b].exercises,e,direction); })}>{direction===-1 ? "Monter l’exercice" : "Descendre l’exercice"}</button>)}<button className="fe-button" type="button" onClick={() => { if(window.confirm("Retirer cet exercice de la séance ? La bibliothèque reste intacte.")) editSession((s) => { s.blocks[b].exercises.splice(e,1); }); }}>Retirer l’exercice</button></div>
                </article>;
              })}
              {block.exercises.length<30 ? <ExercisePicker key={block.id} add={(exercise) => editSession((s) => { s.blocks[b].exercises.push(addLibraryExercise(exercise)); })} /> : <p>Limite de 30 exercices dans ce bloc.</p>}
            </section>)}
            {session && session.type!=="complete-rest" ? <button className="fe-button" type="button" disabled={session.blocks.length>=20} onClick={() => editSession((s) => { s.blocks.push(newBlock()); })}>Ajouter un bloc</button> : null}
          </fieldset>
          <div className={styles.save}>
            {error ? <Feedback>{error}</Feedback> : null}{success ? <Feedback tone="success">{success}</Feedback> : null}
            <p>{dirty ? "Modifications non enregistrées." : selected ? `Brouillon enregistré · version ${selected.version}.` : "Ce nouveau brouillon n’est pas encore enregistré."}</p>
            {warnings.length ? <details><summary>{warnings.length} élément(s) à compléter — sauvegarde autorisée</summary><ul className={styles.warning}>{warnings.map((warning,i) => <li key={i}>{warning}</li>)}</ul></details> : null}
            <button className="fe-button fe-button-primary" type="button" disabled={saving || opening || conflict || publishing} onClick={() => void save()}>{saving ? "Enregistrement…" : uncertain ? "Réessayer le même enregistrement" : "Enregistrer le brouillon"}</button>
            <p className={styles.note}>Brouillon privé Coach/Admin. Seule une publication explicite rend le plan visible au Client.</p>
          </div>
          {selected ? <div className={styles.panel}><ProgramPublish key={selected.id} snapshot={selected} disabled={dirty || locked} lock={(value) => { setPublishing(value); busy.current=value; }} /></div> : null}
        </section>
      </div>
    </div>
  </AppShell>;
}
