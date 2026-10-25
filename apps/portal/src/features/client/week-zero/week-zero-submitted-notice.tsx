"use client";

import { useEffect, useState } from "react";
import { Feedback } from "@/components/fe/feedback";
import { weekZeroAcquisitionSnapshotSchema } from "@/lib/contracts/week-zero-acquisition";

/** The URL is only a display hint. A server-confirmed submission is required. */
export function WeekZeroSubmittedNotice({ french }: { french: boolean }) {
  const [confirmed, setConfirmed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("weekZero") !== "submitted") return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let active = true;
    void fetch("/api/v1/client/week-zero/acquisition", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        const parsed = weekZeroAcquisitionSnapshotSchema.safeParse(payload.data?.acquisition);
        if (active && parsed.success && parsed.data.status === "SUBMITTED") setConfirmed(true);
      }).catch(() => { /* Never claim success when the server cannot confirm it. */ })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, []);
  if (!confirmed || dismissed) return null;
  return <Feedback tone="success">
    <strong>{french ? "Ta semaine zéro est envoyée. Une vraie étape de franchie." : "Your Week Zero has been sent. A real step forward."}</strong>
    <p>{french ? "Ton Coach a maintenant tes photos, tes mesures et tes résultats pour préparer la suite." : "Your Coach now has your photos, measurements and results to prepare what comes next."}</p>
    <button className="fe-button" type="button" onClick={() => {
      setDismissed(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("weekZero");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }}>{french ? "C’est noté" : "Got it"}</button>
  </Feedback>;
}
