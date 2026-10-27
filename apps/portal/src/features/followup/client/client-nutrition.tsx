"use client";

import { useEffect, useState } from "react";
import type { z } from "zod";
import { clientNutritionResponseSchema } from "@/lib/contracts/client-followup";
import { followupRequest } from "./followup-http";
import { displayDate, FollowupFrame, FollowupLoadError, FollowupLoading, localized, useFollowupLanguage, useFollowupLifecycle } from "./followup-frame";
import styles from "./followup.module.css";

export function ClientNutrition() {
  const { french, changeLanguage } = useFollowupLanguage();
  const { pause, resume, signal } = useFollowupLifecycle();
  const t = (fr: string, en: string) => french ? fr : en;
  const [data, setData] = useState<z.infer<typeof clientNutritionResponseSchema> | null>(null);
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [section, setSection] = useState<"meals" | "preparation" | "grocery">("meals");
  useEffect(() => {
    let active = true; const requestSignal = signal(); setLoading(true); setFailed(false);
    void followupRequest("/api/v1/client/nutrition", value => clientNutritionResponseSchema.parse(value), undefined, requestSignal).then(result => { if (active && !requestSignal.aborted) setData(result); }).catch(() => { if (active && !requestSignal.aborted) setFailed(true); }).finally(() => { if (active && !requestSignal.aborted) setLoading(false); });
    return () => { active = false; };
  }, [attempt, signal]);
  const publications = data ? [data.publication, ...data.history].filter((item, index, items) => item !== null && items.findIndex(candidate => candidate?.id === item.id) === index) : [];
  const publication = (selectedId ? publications.find(item => item?.id === selectedId) : null) ?? data?.publication;
  const document = publication?.document;
  const visibleSection = section !== "meals" && !localized(document?.[section] ?? { fr: "", en: "" }, french).trim() ? "meals" : section;
  const refresh = <button type="button" className={styles.quietButton} disabled={loading} onClick={() => setAttempt(value => value + 1)}>{t("Actualiser le plan", "Refresh plan")}</button>;
  const targets = document ? [
    { label: t("Énergie", "Energy"), value: document.targets.calories, unit: "kcal" },
    { label: t("Protéines", "Protein"), value: document.targets.proteinG, unit: "g" },
    { label: t("Glucides", "Carbohydrates"), value: document.targets.carbohydrateG, unit: "g" },
    { label: t("Lipides", "Fat"), value: document.targets.fatG, unit: "g" },
  ] : [];
  return <FollowupFrame current="nutrition" title={t("Ton plan nutritionnel.", "Your nutrition plan.")} subtitle={t("Tes repas et les consignes de ton coach, au même endroit.", "Your meals and your coach’s guidance, in one place.")} french={french} changeLanguage={changeLanguage} onBeforeLogout={pause} onLogoutFailure={() => { resume(); setAttempt(value => value + 1); }}>
    {!document || loading || failed ? <div className={styles.toolbar}>{refresh}</div> : null}
    {!loading && !failed && !data?.publication ? <section className={styles.panel}><h2>{t("Ton plan est en préparation.", "Your plan is being prepared.")}</h2><p>{data?.history.length ? t("Aucun plan nutritionnel actif pour le moment. Ton coach prépare la suite; tes versions précédentes restent consultables.", "No active nutrition plan right now. Your coach is preparing what comes next; your previous versions remain available.") : t("Ton coach n’a pas encore publié de plan nutritionnel. Tu le retrouveras ici dès qu’il sera disponible.", "Your coach has not published a nutrition plan yet. It will appear here when available.")}</p><a href="/client" className={styles.link}>{t("Retour à l’accueil", "Back to home")} →</a></section> : null}
    {!loading && !failed && (publications.length > 1 || !data?.publication && publications.length) ? <div className={styles.planControls}><label>{t("Version du plan", "Plan version")}<select value={publication?.id ?? ""} onChange={event => { setSelectedId(event.target.value || null); setSection("meals"); }}>{!data?.publication ? <option value="">{t("Choisir une version conservée", "Choose a saved version")}</option> : null}{publications.map(item => item ? <option key={item.id} value={item.id}>V{item.revision} · {displayDate(item.publishedAt, french)}</option> : null)}</select></label></div> : null}
    {!loading && !failed && data?.historyTruncated ? <p className={styles.meta}>{t("Les 50 versions les plus récentes sont affichées.", "The 50 most recent versions are shown.")}</p> : null}
    {loading ? <FollowupLoading french={french} /> : failed ? <FollowupLoadError french={french} retry={() => setAttempt(value => value + 1)} /> : !document || !publication ? null : <>
      <div className={styles.toolbar}>
        <div><h2>{localized(document.title, french) || t("Plan nutritionnel", "Nutrition plan")}</h2><p className={styles.meta}>{t("Publié le", "Published on")} <time dateTime={publication.publishedAt}>{displayDate(publication.publishedAt, french)}</time> · {t("Version", "Version")} {publication.revision}</p><p className={styles.meta}>{publication.withdrawnAt ? t("Plan retiré · consultation uniquement.", "Withdrawn plan · view only.") : publication.id === data?.publication?.id ? t("Ton plan actuel, jusqu’à la prochaine publication de ton coach.", "Your current plan, until your coach publishes the next version.") : t("Version précédente · consultation uniquement.", "Previous version · view only.")}</p></div>
        <div className={styles.planControls}>{refresh}</div>
      </div>
      <nav className={styles.sectionNav} aria-label={t("Sections nutrition", "Nutrition sections")}>
        <button type="button" aria-pressed={visibleSection === "meals"} onClick={() => setSection("meals")}>{t("Repas", "Meals")}</button>
        {localized(document.preparation, french).trim() ? <button type="button" aria-pressed={visibleSection === "preparation"} onClick={() => setSection("preparation")}>{t("Préparation", "Meal prep")}</button> : null}
        {localized(document.grocery, french).trim() ? <button type="button" aria-pressed={visibleSection === "grocery"} onClick={() => setSection("grocery")}>{t("Épicerie", "Grocery list")}</button> : null}
      </nav>
      {visibleSection === "meals" ? <>
        <section className={styles.panel} aria-labelledby="nutrition-targets"><h2 id="nutrition-targets" className={styles.kicker}>{t("Cibles prescrites", "Prescribed targets")}</h2><div className={styles.targets}>{targets.map(target => <div key={target.label}><strong>{target.value === null ? "—" : new Intl.NumberFormat(french ? "fr-CA" : "en-CA").format(target.value)}{target.value !== null ? <small> {target.unit}</small> : null}</strong><span>{target.label}</span>{target.value === null ? <span className={styles.meta}>{t("Non renseignée", "Not provided")}</span> : null}</div>)}</div><p className={styles.meta}>{t("Ces valeurs sont prescrites par ton coach. Elles ne représentent pas une consommation enregistrée.", "These values are prescribed by your coach. They do not represent recorded consumption.")}</p></section>
        <div className={styles.columns}><section aria-labelledby="nutrition-meals"><h2 id="nutrition-meals">{t("Tes repas", "Your meals")}</h2><div className={styles.stack}>{document.meals.length ? document.meals.map((meal, index) => <details className={styles.meal} key={meal.id} open={index === 0}><summary><span className={styles.mealTime}>{meal.timeLabel ? localized(meal.timeLabel, french) : ""}</span><strong>{localized(meal.title, french) || t("Repas", "Meal")}</strong></summary><div className={styles.mealContent}>{localized(meal.portions, french).trim() ? <p>{localized(meal.portions, french)}</p> : <p className={styles.meta}>{t("Aucune portion précisée pour ce repas.", "No portions specified for this meal.")}</p>}{localized(meal.notes, french).trim() ? <div><h3>{t("Consignes", "Guidance")}</h3><p>{localized(meal.notes, french)}</p></div> : null}</div></details>) : <p className={styles.panel}>{t("Aucun repas détaillé dans cette version. Consulte les consignes de ton coach.", "No detailed meals in this version. Read your coach’s guidance.")}</p>}</div></section>
          {localized(document.instructions, french).trim() ? <aside className={`${styles.panel} ${styles.accent}`}><h2>{t("Notes de ton coach", "Your coach’s notes")}</h2><p className={styles.multiline}>{localized(document.instructions, french)}</p></aside> : null}
        </div>
      </> : <section className={styles.panel}><h2>{visibleSection === "preparation" ? t("Préparer tes repas", "Prepare your meals") : t("Ta liste d’épicerie", "Your grocery list")}</h2><p className={styles.multiline}>{localized(document[visibleSection], french)}</p><button type="button" className={styles.quietButton} onClick={() => setSection("meals")}>{t("Retour aux repas", "Back to meals")}</button></section>}
    </>}
  </FollowupFrame>;
}
