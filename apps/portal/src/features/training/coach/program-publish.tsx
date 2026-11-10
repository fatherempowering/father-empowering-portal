"use client";
import { usePortalLanguage } from "@/components/fe/portal-preferences";
import { UiText, useUiCopy } from "@/components/fe/ui-text";
import { useEffect, useRef, useState } from "react";
import { Feedback, Loading } from "@/components/fe/feedback";
import { coachClientLabel } from "@/lib/clients/client-label";
import type { ProgramSnapshot } from "@/lib/contracts/training-drafts";
import { publicationClientsSchema, publicationResponseSchema, publishableProgramSchema,
  type PublicationClients, type ProgramPublication, type PublishProgramRequest } from "@/lib/contracts/training-publication";
import { programIssues, type ProgramIssue } from "@/lib/training/program-issues";
import { useProgramConfirmation } from "./program-confirmation";
import styles from "./program-builder.module.css";

export function ProgramPublish({ snapshot, disabled, lock, onIssue }: {
  snapshot: ProgramSnapshot; disabled: boolean; lock: (locked: boolean) => void; onIssue: (issue: ProgramIssue) => void;
}) {
  const c = useUiCopy();
  const { language } = usePortalLanguage();
  const [clients, setClients] = useState<PublicationClients | null>(null);
  const [page, setPage] = useState(0); const [retry, setRetry] = useState(0);
  const [clientId, setClientId] = useState("");
  const [current, setCurrent] = useState<ProgramPublication | null>(null);
  const [ready, setReady] = useState(false); const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false); const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null); const [success, setSuccess] = useState(false);
  const pending = useRef<PublishProgramRequest | null>(null);
  const busy = useRef(false);
  const { confirm, confirmation } = useProgramConfirmation();
  const issues = programIssues(snapshot.document, "publish", language);
  const complete = publishableProgramSchema.safeParse(snapshot.document).success && issues.length === 0;
  const containsPilot = snapshot.document.weeks.some((week) => week.sessions.some((session) => session.blocks.some((block) => block.exercises.some((exercise) => Boolean(exercise.pilot)))));
  function auth(response: Response) {
    if (![401,403].includes(response.status)) return false;
    window.location.replace(response.status === 401 ? "/login" : "/verify-email"); return true;
  }
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const timer = setTimeout(() => controller.abort(), 8000); setClients(null); setError(null);
    void (async () => {
      try {
        const response = await fetch(`/api/v1/coach/programs/recipients?page=${page}`, { cache: "no-store", signal: controller.signal });
        if (auth(response)) return;
        if (!response.ok) throw new Error("LOAD");
        const value = publicationClientsSchema.parse((await response.json()).data);
        if (active) setClients(value);
      } catch { if (active) setError("Impossible de charger les clients. Réessaie; rien n’a été publié."); }
      finally { clearTimeout(timer); }
    })();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [page, retry]);
  useEffect(() => {
    setReady(false); setCurrent(null); setSuccess(false);
    if (!clientId) return;
    const controller = new AbortController(); let active = true;
    const timer = setTimeout(() => controller.abort(), 8000); setLoading(true); setError(null);
    void (async () => {
      try {
        const response = await fetch(`/api/v1/coach/clients/${clientId}/program`, { cache: "no-store", signal: controller.signal });
        if (auth(response)) return;
        if (!response.ok) throw new Error("LOAD");
        const value = publicationResponseSchema.parse((await response.json()).data);
        if (active) { setCurrent(value.program); setReady(true); }
      } catch { if (active) setError("Impossible de vérifier le programme actuel. Réessaie avant de publier."); }
      finally { clearTimeout(timer); if (active) setLoading(false); }
    })();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [clientId, retry]);
  async function publish() {
    if (busy.current || (!pending.current && (!ready || disabled || !complete))) return;
    if (!pending.current) {
      const recipient = clients?.clients.find((client) => client.id === clientId);
      const name = recipient && coachClientLabel(recipient.name, recipient.isOwnProfile);
      if (!name || !await confirm(`Publier « ${snapshot.document.title.fr || snapshot.document.title.en} » pour ${name} ? Ce plan sera immédiatement visible dans son portail.${current ? " Son programme actuel sera remplacé; la version précédente sera conservée." : ""}`, "Confirmer la publication", "Publier ce programme")) return;
      pending.current = { clientId, programId: snapshot.id, draftVersion: snapshot.version,
        expectedPublicationId: current?.id ?? null, clientMutationId: crypto.randomUUID() };
    }
    busy.current = true; setSending(true); lock(true); setError(null); setSuccess(false);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("/api/v1/coach/programs/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending.current), signal: controller.signal });
      if (auth(response)) return;
      if ([400,404,409].includes(response.status)) {
        const body: unknown = await response.json().catch(() => null);
        const code = body && typeof body === "object" && "error" in body && body.error && typeof body.error === "object" && "code" in body.error ? body.error.code : null;
        pending.current = null; setUncertain(false); lock(false); setReady(false);
        setError(code === "PILOT_RECIPIENT_DISABLED" ? "Publication refusée : ce destinataire n’est pas autorisé pour le lot pilote staging. Choisis un compte test autorisé ou retire les exercices pilotes. Rien n’a été publié."
          : code === "PROGRAM_INCOMPLETE" ? "Publication refusée : des éléments du programme restent à compléter. Utilise les liens de correction, puis enregistre le brouillon."
          : code === "ALREADY_PUBLISHED" ? "Cette version est déjà publiée. Recharge l’état pour retrouver sa confirmation."
          : code === "NOT_FOUND" ? "Publication refusée : ce destinataire ou ce brouillon n’est plus accessible. Recharge les clients et le brouillon avant de reprendre."
          : code === "VERSION_CONFLICT" ? "Publication refusée : le brouillon ou le programme actuel a changé. Recharge son état avant de reprendre ; rien n’a été écrasé."
          : code === "VALIDATION_FAILED" ? "Publication refusée : une valeur ou un exercice n’est plus valide. Vérifie les éléments du brouillon avant de reprendre."
          : "Publication refusée. Recharge l’état du programme avant de reprendre."); return;
      }
      if (!response.ok) throw new Error("PUBLISH");
      const value = publicationResponseSchema.parse((await response.json()).data).program;
      if (!value || value.clientId !== pending.current.clientId || value.programId !== pending.current.programId || value.draftVersion !== pending.current.draftVersion) throw new Error("MISMATCH");
      setCurrent(value); setSuccess(true); pending.current = null; setUncertain(false); lock(false);
    } catch { setUncertain(true); setError("Confirmation non reçue. Réessaie la même publication pour vérifier son résultat sans créer de doublon."); }
    finally { clearTimeout(timer); busy.current = false; setSending(false); }
  }
  const alreadyPublished = current?.programId === snapshot.id && current.draftVersion === snapshot.version;
  return <section aria-label={c("Publication Client")}>
    <h2><UiText>Publier pour un client</UiText></h2>
    <p><UiText>Seule la version enregistrée est publiée. Tes prochaines modifications resteront en brouillon.</UiText></p>
    {disabled && !uncertain && !sending ? <p><UiText>Enregistre tes modifications avant de publier.</UiText></p> : null}
    {!complete ? <p><UiText>Complète chaque semaine, le titre des séances et les groupes d’exercices avant de publier.</UiText></p> : null}
    {!disabled && issues.length ? <div><button className={styles.issueSummary} type="button" onClick={() => onIssue(issues[0])}>{issues.length}<UiText> élément(s) à compléter · Aller au premier</UiText></button><details><summary>{issues.length}<UiText> élément(s) à compléter — sauvegarde autorisée</UiText></summary><ul className={styles.warning}>{issues.map((issue,index) => <li key={index}><button type="button" className={styles.issueLink} onClick={() => onIssue(issue)}>{issue.message}</button></li>)}</ul></details></div> : null}
    {containsPilot ? <p className={styles.note}><UiText>Ce programme contient des exercices pilotes. Il est réservé aux comptes de test autorisés dans le staging ; la publication reste bloquée pour les autres destinataires.</UiText></p> : null}
    {error ? <Feedback>{error}</Feedback> : null}
    {success ? <Feedback tone="success"><UiText>Programme publié. Le client peut maintenant le consulter dans son portail.</UiText></Feedback> : null}
    {clients ? <>
      <label><UiText>Client destinataire</UiText><select value={clientId} disabled={sending || uncertain || disabled} onChange={(e) => setClientId(e.target.value)}>
        <option value=""><UiText>Choisir un client actif</UiText></option>
        {clients.clients.map((client) => <option key={client.id} value={client.id}>{coachClientLabel(client.name, client.isOwnProfile, language)}</option>)}
      </select></label>
      {!clients.total ? <p><UiText>Aucun client actif assigné n’est disponible.</UiText></p> : null}
      <button className="fe-button" type="button" disabled={sending || uncertain || !page} onClick={() => { setClientId(""); setPage(page-1); }}><UiText>Clients précédents</UiText></button>
      <button className="fe-button" type="button" disabled={sending || uncertain || (page+1)*20>=clients.total} onClick={() => { setClientId(""); setPage(page+1); }}><UiText>Clients suivants</UiText></button>
    </> : !error ? <Loading><UiText>Chargement des clients…</UiText></Loading> : null}
    {loading ? <Loading><UiText>Vérification du programme actuel…</UiText></Loading> : ready ? <p>{current ? `Programme actuel : ${current.document.title.fr || current.document.title.en} · publication ${current.revision}.` : <UiText>{"Ce client n’a pas encore de programme publié."}</UiText>}</p> : null}
    {alreadyPublished ? <p><UiText>Cette version est déjà publiée pour ce client.</UiText></p> : null}
    <div>
      <button className="fe-button" type="button" disabled={sending || uncertain} onClick={() => setRetry(retry+1)}><UiText>Recharger l’état de publication</UiText></button>
      <button className="fe-button fe-button-primary" type="button" disabled={sending || (!uncertain && (disabled || !ready || !complete || alreadyPublished))} onClick={() => void publish()}>{sending ? <UiText>{"Publication…"}</UiText> : uncertain ? <UiText>{"Réessayer la même publication"}</UiText> : <UiText>{"Publier pour ce client"}</UiText>}</button>
    </div>
    {confirmation}
  </section>;
}
