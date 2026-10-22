"use client";
import { useEffect, useRef, useState } from "react";
import { Feedback, Loading } from "@/components/fe/feedback";
import type { ProgramSnapshot } from "@/lib/contracts/training-drafts";
import { publicationClientsSchema, publicationResponseSchema, publishableProgramSchema,
  type PublicationClients, type ProgramPublication, type PublishProgramRequest } from "@/lib/contracts/training-publication";

export function ProgramPublish({ snapshot, disabled, lock }: {
  snapshot: ProgramSnapshot; disabled: boolean; lock: (locked: boolean) => void;
}) {
  const [clients, setClients] = useState<PublicationClients | null>(null);
  const [page, setPage] = useState(0); const [retry, setRetry] = useState(0);
  const [clientId, setClientId] = useState("");
  const [current, setCurrent] = useState<ProgramPublication | null>(null);
  const [ready, setReady] = useState(false); const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false); const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null); const [success, setSuccess] = useState(false);
  const pending = useRef<PublishProgramRequest | null>(null);
  const busy = useRef(false);
  const complete = publishableProgramSchema.safeParse(snapshot.document).success;
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
      const name = clients?.clients.find((client) => client.id === clientId)?.name;
      if (!name || !window.confirm(`Publier « ${snapshot.document.title.fr || snapshot.document.title.en} » pour ${name} ? Ce plan sera immédiatement visible dans son portail.${current ? " Son programme actuel sera remplacé; la version précédente sera conservée." : ""}`)) return;
      pending.current = { clientId, programId: snapshot.id, draftVersion: snapshot.version,
        expectedPublicationId: current?.id ?? null, clientMutationId: crypto.randomUUID() };
    }
    busy.current = true; setSending(true); lock(true); setError(null); setSuccess(false);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("/api/v1/coach/programs/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending.current), signal: controller.signal });
      if (auth(response)) return;
      if ([400,404,409].includes(response.status)) {
        pending.current = null; setUncertain(false); lock(false); setReady(false);
        setError("Publication refusée : plan incomplet, accès modifié ou version déjà changée. Recharge l’état avant de reprendre; rien n’a été écrasé."); return;
      }
      if (!response.ok) throw new Error("PUBLISH");
      const value = publicationResponseSchema.parse((await response.json()).data).program;
      if (!value || value.clientId !== pending.current.clientId || value.programId !== pending.current.programId || value.draftVersion !== pending.current.draftVersion) throw new Error("MISMATCH");
      setCurrent(value); setSuccess(true); pending.current = null; setUncertain(false); lock(false);
    } catch { setUncertain(true); setError("Confirmation non reçue. Réessaie la même publication pour vérifier son résultat sans créer de doublon."); }
    finally { clearTimeout(timer); busy.current = false; setSending(false); }
  }
  const alreadyPublished = current?.programId === snapshot.id && current.draftVersion === snapshot.version;
  return <section aria-label="Publication Client">
    <h2>Publier pour un client</h2>
    <p>Seule la version enregistrée est publiée. Tes prochaines modifications resteront en brouillon.</p>
    {disabled && !uncertain && !sending ? <p>Enregistre tes modifications avant de publier.</p> : null}
    {!complete ? <p>Complète chaque semaine, le titre des séances et les groupes d’exercices avant de publier.</p> : null}
    {error ? <Feedback>{error}</Feedback> : null}
    {success ? <Feedback tone="success">Programme publié. Le client peut maintenant le consulter dans son portail.</Feedback> : null}
    {clients ? <>
      <label>Client destinataire<select value={clientId} disabled={sending || uncertain || disabled} onChange={(e) => setClientId(e.target.value)}>
        <option value="">Choisir un client actif</option>
        {clients.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
      </select></label>
      {!clients.total ? <p>Aucun client actif assigné n’est disponible.</p> : null}
      <button className="fe-button" type="button" disabled={sending || uncertain || !page} onClick={() => { setClientId(""); setPage(page-1); }}>Clients précédents</button>
      <button className="fe-button" type="button" disabled={sending || uncertain || (page+1)*20>=clients.total} onClick={() => { setClientId(""); setPage(page+1); }}>Clients suivants</button>
    </> : !error ? <Loading>Chargement des clients…</Loading> : null}
    {loading ? <Loading>Vérification du programme actuel…</Loading> : ready ? <p>{current ? `Programme actuel : ${current.document.title.fr || current.document.title.en} · publication ${current.revision}.` : "Ce client n’a pas encore de programme publié."}</p> : null}
    {alreadyPublished ? <p>Cette version est déjà publiée pour ce client.</p> : null}
    <div>
      <button className="fe-button" type="button" disabled={sending || uncertain} onClick={() => setRetry(retry+1)}>Recharger l’état de publication</button>
      <button className="fe-button fe-button-primary" type="button" disabled={sending || (!uncertain && (disabled || !ready || !complete || alreadyPublished))} onClick={() => void publish()}>{sending ? "Publication…" : uncertain ? "Réessayer la même publication" : "Publier pour ce client"}</button>
    </div>
  </section>;
}
