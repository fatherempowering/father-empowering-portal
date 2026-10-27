"use client";
import { useEffect, useRef, useState } from "react";
import { Feedback } from "@/components/fe/feedback";
import { programSnapshotSchema, type ProgramEditor, type ProgramSnapshot } from "@/lib/contracts/training-drafts";
import { programHistorySchema, type ProgramHistory } from "@/lib/contracts/training-history";

export function ProgramVersionHistory({ snapshot, disabled, onRestore, onLoading }: {
  snapshot: ProgramSnapshot; disabled: boolean; onRestore: (document: ProgramEditor, version: number) => void | Promise<void>;
  onLoading: (loading: boolean) => void;
}) {
  const [history, setHistory] = useState<ProgramHistory | null>(null);
  const [page, setPage] = useState(0); const [retry, setRetry] = useState(0);
  const [error, setError] = useState(false); const [loadingVersion, setLoadingVersion] = useState<number | null>(null);
  const request = useRef<AbortController | null>(null); const current = useRef({ id: snapshot.id, version: snapshot.version });
  const loadingCallback = useRef(onLoading); loadingCallback.current = onLoading;
  current.current = { id: snapshot.id, version: snapshot.version };
  useEffect(() => {
    setPage(0);
    return () => { request.current?.abort(); request.current = null; loadingCallback.current(false); };
  }, [snapshot.id]);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const timeout = setTimeout(() => controller.abort(), 8000);
    setHistory(null); setError(false); setLoadingVersion(null);
    if (request.current) { request.current.abort(); request.current = null; loadingCallback.current(false); }
    void (async () => {
      try {
        const response = await fetch(`/api/v1/coach/programs/${snapshot.id}/history?page=${page}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("HISTORY");
        const data = programHistorySchema.parse((await response.json()).data);
        if (active) setHistory(data);
      } catch { if (active) setError(true); } finally { clearTimeout(timeout); }
    })();
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [snapshot.id, snapshot.version, page, retry]);
  async function restore(version: number) {
    if (disabled || request.current || version === snapshot.version) return;
    const id = snapshot.id; const baseVersion = snapshot.version; const controller = new AbortController(); request.current = controller;
    loadingCallback.current(true);
    setLoadingVersion(version); setError(false); const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`/api/v1/coach/programs/${id}/history/${version}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("HISTORY");
      const old = programSnapshotSchema.parse((await response.json()).data?.program);
      if (old.id !== id || old.version !== version || old.document.phaseId !== snapshot.document.phaseId) throw new Error("HISTORY");
      clearTimeout(timeout);
      if (!controller.signal.aborted && current.current.id === id && current.current.version === baseVersion) await onRestore(old.document, old.version);
    } catch { if (request.current === controller && current.current.id === id) setError(true); }
    finally { clearTimeout(timeout); if (request.current === controller) { request.current = null; setLoadingVersion(null); loadingCallback.current(false); } }
  }
  return <section aria-label="Versions enregistrées">
    <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", alignItems: "center" }}>
      <strong>Versions</strong>
      {history ? [...history.items].reverse().map((item) => <button type="button" className="fe-button" key={item.version}
        disabled={disabled || loadingVersion !== null || item.version === snapshot.version}
        aria-current={item.version === snapshot.version ? "true" : undefined}
        aria-label={item.version === snapshot.version ? `Version ${item.version} actuelle` : `Reprendre la version ${item.version}`}
        onClick={() => void restore(item.version)}>V{item.version}</button>) : <span>{error ? "" : "Chargement…"}</span>}
    </div>
    {history && history.total > 20 ? <div>
      <button type="button" className="fe-button" disabled={disabled || loadingVersion !== null || !page} onClick={() => setPage(page - 1)}>Versions plus récentes</button>
      <button type="button" className="fe-button" disabled={disabled || loadingVersion !== null || (page + 1) * 20 >= history.total} onClick={() => setPage(page + 1)}>Versions plus anciennes</button>
    </div> : null}
    {loadingVersion !== null ? <p role="status">Ouverture de V{loadingVersion}…</p> : null}
    {error ? <Feedback>Impossible de lire cette sauvegarde. Ton brouillon est conservé. <button type="button" className="fe-button" onClick={() => setRetry(retry + 1)}>Réessayer les versions</button></Feedback> : null}
  </section>;
}
