"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { uuidSchema } from "@/lib/contracts/m1";
import {
  photoSlotSchema,
  weekZeroPhotoUploadResponseSchema,
  type WeekZeroAcquisitionSnapshot,
  type WeekZeroPhotoSlot,
} from "@/lib/contracts/week-zero-acquisition";
import styles from "./client-reference-panel.module.css";
import { LatestCheckInPanel } from "./latest-checkin-panel";

const REQUEST_TIMEOUT = 8_000;
const MAX_PHOTO_BYTES = 4_194_304;

export class ClientReferenceReadError extends Error {
  constructor(readonly code: "AUTH_REQUIRED" | "UNAVAILABLE") {
    super(code);
    this.name = "ClientReferenceReadError";
  }
}

function requireReadable(response: Response) {
  if (response.status === 401 || response.status === 403) throw new ClientReferenceReadError("AUTH_REQUIRED");
  if (!response.ok) throw new ClientReferenceReadError("UNAVAILABLE");
}

/** Own-client routes only. No organization/client identifier or storage URL is accepted. */
export async function readClientReference(signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const response = await fetcher("/api/v1/client/week-zero/acquisition", {
    signal, cache: "no-store", credentials: "same-origin", redirect: "error",
  });
  requireReadable(response);
  return weekZeroPhotoUploadResponseSchema.parse(await response.json()).data.acquisition;
}

export async function readClientReferencePhoto(slot: WeekZeroPhotoSlot, assetId: string, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const params = new URLSearchParams({ slot: photoSlotSchema.parse(slot), assetId: uuidSchema.parse(assetId) });
  const response = await fetcher(`/api/v1/client/week-zero/photos?${params}`, {
    signal, cache: "no-store", credentials: "same-origin", redirect: "error",
  });
  requireReadable(response);
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!contentType || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) throw new ClientReferenceReadError("UNAVAILABLE");
  const declaredSize = response.headers.get("content-length");
  if (declaredSize !== null && (!/^\d+$/.test(declaredSize) || Number(declaredSize) > MAX_PHOTO_BYTES)) throw new ClientReferenceReadError("UNAVAILABLE");
  if (!response.body) throw new ClientReferenceReadError("UNAVAILABLE");
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PHOTO_BYTES) {
        await reader.cancel();
        throw new ClientReferenceReadError("UNAVAILABLE");
      }
      const chunk = new Uint8Array(value.byteLength);
      chunk.set(value); chunks.push(chunk);
    }
  } finally { reader.releaseLock(); }
  if (!total) throw new ClientReferenceReadError("UNAVAILABLE");
  return new Blob(chunks, { type: contentType });
}

export function clientReferenceMeasurements(snapshot: WeekZeroAcquisitionSnapshot | null, french: boolean) {
  const values = snapshot?.responses.measurements;
  const number = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat(french ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(value);
  return [
    { label: french ? "Poids de départ" : "Starting bodyweight", value: number(values?.bodyWeightLb), unit: "lb" },
    { label: french ? "Tour de taille" : "Waist", value: number(values?.waistIn), unit: french ? "po" : "in" },
    { label: french ? "Tour de poitrine" : "Chest", value: number(values?.chestIn), unit: french ? "po" : "in" },
    { label: french ? "Tour de hanches" : "Hips", value: number(values?.hipsIn), unit: french ? "po" : "in" },
    { label: french ? "Bras gauche" : "Left arm", value: number(values?.leftArmIn), unit: french ? "po" : "in" },
    { label: french ? "Bras droit" : "Right arm", value: number(values?.rightArmIn), unit: french ? "po" : "in" },
    { label: french ? "Cuisse droite" : "Right thigh", value: number(values?.rightThighIn), unit: french ? "po" : "in" },
    { label: french ? "Mollet gauche" : "Left calf", value: number(values?.leftCalfIn), unit: french ? "po" : "in" },
    { label: french ? "Mollet droit" : "Right calf", value: number(values?.rightCalfIn), unit: french ? "po" : "in" },
  ];
}

function ReferencePhoto({ slot, assetId, french, snapshotLoading, snapshotFailed, onAuthRequired }: {
  slot: WeekZeroPhotoSlot; assetId: string | null; french: boolean; snapshotLoading: boolean; snapshotFailed: boolean; onAuthRequired: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const label = { front: french ? "Face" : "Front", side: french ? "Profil" : "Side", back: french ? "Dos" : "Back" }[slot];
  useEffect(() => {
    setUrl(null); setFailed(false);
    if (!assetId) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    let active = true;
    let objectUrl: string | null = null;
    void readClientReferencePhoto(slot, assetId, controller.signal)
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(error => {
        if (!active) return;
        if (error instanceof ClientReferenceReadError && error.code === "AUTH_REQUIRED") onAuthRequired();
        setFailed(true);
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false; clearTimeout(timeout); controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, slot, onAuthRequired]);
  return <div className={styles.photo}>
    {url ? <>
      {/* A private, authenticated blob; never a public image optimizer URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`${french ? "Photo de départ" : "Starting photo"} · ${label}`} referrerPolicy="no-referrer" onError={() => { setUrl(null); setFailed(true); }} />
      <span className={styles.photoCaption}>{label}</span>
    </> : <>
      <span className={styles.photoIcon} aria-hidden="true">▧</span>
      <span className={styles.photoLabel}>{label}</span>
      <span className={styles.photoState}>{snapshotLoading ? (french ? "Chargement…" : "Loading…") : snapshotFailed || failed ? (french ? "Indisponible" : "Unavailable") : !assetId ? (french ? "Non ajoutée" : "Not added") : (french ? "Chargement…" : "Loading…")}</span>
    </>}
  </div>;
}

/** Presentation is exported separately so absent/live references can be tested without fake sessions. */
export function ClientReferencePanelContent({ french, snapshot, loading = false, failed = false, onRetry, onAuthRequired }: {
  french: boolean; snapshot: WeekZeroAcquisitionSnapshot | null; loading?: boolean; failed?: boolean;
  onRetry: () => void; onAuthRequired: () => void;
}) {
  const t = (fr: string, en: string) => french ? fr : en;
  const source = snapshot?.status === "DRAFT"
    ? t("Semaine zéro · brouillon enregistré", "Week Zero · saved draft")
    : t("Référence · Semaine zéro", "Reference · Week Zero");
  return <>
    <LatestCheckInPanel french={french} onAuthRequired={onAuthRequired} />
    <section className={styles.card} aria-label={t("Mensurations de départ", "Starting measurements")}>
      <div className={styles.cardHeader}><span className={styles.dot} /><h2>{t("Mensurations", "Measurements")}</h2><span className={styles.badge}>{t("PO", "IN")}</span></div>
      <p className={styles.provenance}>{source}</p>
      {loading && <p className={styles.state} role="status">{t("Chargement de tes repères…", "Loading your references…")}</p>}
      {failed && <div className={styles.state} role="alert"><p>{t("Tes repères ne sont pas disponibles pour le moment.", "Your references are temporarily unavailable.")}</p><button type="button" onClick={onRetry}>{t("Réessayer", "Try again")}</button></div>}
      <dl className={styles.measurements}>
        {clientReferenceMeasurements(snapshot, french).map(row => <div className={styles.measurementRow} key={row.label}>
          <dt>{row.label}</dt><dd>{row.value}{row.value !== "—" && <small> {row.unit}</small>}</dd>
        </div>)}
      </dl>
      {!loading && !failed && snapshot?.status === "NOT_STARTED" && <p className={styles.state}>{t("Tes mesures apparaîtront après leur enregistrement dans la semaine zéro.", "Your measurements will appear after you save them in Week Zero.")}</p>}
    </section>
    <section className={styles.card} aria-label={t("Photos de départ", "Starting photos")}>
      <div className={styles.cardHeader}><span className={styles.dot} /><h2>{t("Photos progression", "Progress photos")}</h2></div>
      <p className={styles.provenance}>{source} · {t("photos privées", "private photos")}</p>
      <div className={styles.photos}>
        {(["front", "side", "back"] as const).map(slot => <ReferencePhoto key={slot} slot={slot} assetId={snapshot?.responses.photos[slot] ?? null} french={french} snapshotLoading={loading} snapshotFailed={failed} onAuthRequired={onAuthRequired} />)}
      </div>
      <Link className={styles.referenceLink} href="/client/week-zero">{t("Consulter ma semaine zéro", "View my Week Zero")}</Link>
    </section>
  </>;
}

export function ClientReferencePanel({ french }: { french: boolean }) {
  const [snapshot, setSnapshot] = useState<WeekZeroAcquisitionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const requireAuth = useCallback(() => {
    setSnapshot(null); setAuthRequired(true);
    window.location.assign("/client-login");
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    let active = true;
    setLoading(true); setFailed(false); setSnapshot(null);
    void readClientReference(controller.signal)
      .then(value => { if (active) setSnapshot(value); })
      .catch(error => {
        if (!active) return;
        if (error instanceof ClientReferenceReadError && error.code === "AUTH_REQUIRED") requireAuth();
        else setFailed(true);
      })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt, requireAuth]);
  return <aside className={styles.panel} data-testid="client-reference-panel" aria-label={french ? "Mes repères" : "My references"}>
    {authRequired ? <div className={styles.state} role="alert"><p>{french ? "Reconnecte-toi pour consulter tes repères privés." : "Sign in again to view your private references."}</p><Link href="/client-login">{french ? "Me reconnecter" : "Sign in again"}</Link></div>
      : <ClientReferencePanelContent french={french} snapshot={snapshot} loading={loading} failed={failed} onRetry={() => setAttempt(value => value + 1)} onAuthRequired={requireAuth} />}
  </aside>;
}
