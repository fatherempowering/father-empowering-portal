"use client";

import { useId, useRef, useState } from "react";
import { Modal } from "./modal";
import { Icon } from "./icon";
import { LanguageControl } from "./preference-controls";
import { usePortalLanguage, usePortalTheme } from "./portal-preferences";
import { exportClientProgress } from "@/features/client/dashboard/export-client-progress";

export function PortalSettings({ client = false }: { client?: boolean }) {
  const { t } = usePortalLanguage();
  const { theme, setTheme } = usePortalTheme();
  const [open, setOpen] = useState(false), [about, setAbout] = useState(false);
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState<"error" | "saved" | "partial" | null>(null);
  const titleId = useId(), descriptionId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  function close() { setOpen(false); trigger.current?.focus(); }
  async function download() {
    if (busy) return;
    setBusy(true); setFeedback(null);
    try {
      const data = await exportClientProgress();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = `father-empowering-progress-${new Date().toISOString().slice(0, 10)}.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setFeedback(data.truncated ? "partial" : "saved");
    } catch { setFeedback("error"); } finally { setBusy(false); }
  }
  return <>
    <button ref={trigger} className="fe-settings-trigger" type="button" aria-label={t("Ouvrir les réglages", "Open settings")} aria-haspopup="dialog" onClick={() => { setOpen(true); setAbout(false); setFeedback(null); }}><Icon name="settings" /></button>
    <Modal open={open} busy={busy} onClose={close} labelledBy={titleId} describedBy={descriptionId}>
      <div className="fe-settings-panel">
        <header><h2 id={titleId}>{t("Réglages", "Settings")}</h2><button type="button" className="fe-settings-close" data-autofocus onClick={close} disabled={busy} aria-label={t("Fermer les réglages", "Close settings")}><Icon name="close" /></button></header>
        <p id={descriptionId}>{t("Ton portail, comme tu l’aimes.", "Your portal, your way.")}</p>
        <section><h3>{t("Langue", "Language")}</h3><LanguageControl /></section>
        <section><h3>{t("Actualiser le portail", "Refresh portal")}</h3><p>{t("Retrouve les dernières informations enregistrées. Si une saisie est en cours, le navigateur te demandera de confirmer avant de quitter.", "Load the latest saved information. If you have unsaved changes, your browser will ask before leaving.")}</p><button type="button" className="fe-button" onClick={() => window.location.reload()}>{t("Actualiser", "Refresh")}</button></section>
        {client ? <section><h3>{t("Exporter mes données", "Export my data")}</h3><p>{t("Télécharge tes progrès enregistrés et les plans disponibles dans un fichier privé. Photos et saisies non enregistrées exclues. Ce fichier ne permet pas de restaurer un compte.", "Download your saved progress and available plans as a private file. Photos and unsaved entries are excluded. This file cannot restore an account.")}</p><button className="fe-button" type="button" disabled={busy} onClick={() => void download()}>{busy ? t("Préparation…", "Preparing…") : t("Télécharger mes progrès", "Download my progress")}</button>
          {feedback ? <p role={feedback === "error" ? "alert" : "status"}>{feedback === "error" ? t("L’export a échoué. Vérifie ta connexion et réessaie. Aucun fichier incomplet n’a été téléchargé.", "Export failed. Check your connection and try again. No incomplete file was downloaded.") : feedback === "partial" ? t("Fichier téléchargé. Il contient l’historique récent disponible, pas la totalité des données. Garde-le dans un endroit privé.", "File downloaded. It contains the available recent history, not all records. Keep it somewhere private.") : t("Fichier téléchargé. Il contient des données personnelles : conserve-le dans un endroit privé.", "File downloaded. It contains personal data: keep it somewhere private.")}</p> : null}
        </section> : null}
        <section><h3>{t("Apparence", "Appearance")}</h3><div className="fe-language-control" role="group" aria-label={t("Apparence", "Appearance")}>{(["light", "dark"] as const).map(value => <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}>{value === "light" ? t("Claire", "Light") : t("Sombre", "Dark")}</button>)}</div></section>
        <section><button type="button" className="fe-button" aria-expanded={about} onClick={() => setAbout(!about)}>{t("À propos", "About")}</button>{about ? <div className="fe-settings-about"><h3>Father Empowering — Legacy Protocol</h3><p>{t("Ton entraînement, ton alimentation et tes progrès, réunis avec ton Coach. Tes données enregistrées restent liées à ton compte, pas à cet appareil.", "Your training, nutrition and progress, together with your Coach. Your saved data belongs to your account, not this device.")}</p><p>{t("L’actualisation et les réglages ne changent ni tes programmes ni tes accès.", "Refreshing and changing display settings do not change your programs or access permissions.")}</p><small>Powered by Coach Max</small></div> : null}</section>
      </div>
    </Modal>
  </>;
}
