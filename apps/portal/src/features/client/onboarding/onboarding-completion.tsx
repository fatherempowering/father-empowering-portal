import styles from "./onboarding.module.css";

// Separate language slots, following the same saved locale as the Client UI.
// Max's FR/EN videos have not been supplied: no fake player, media request,
// or fallback to a video in the other language is presented.
const VIDEO_SLOTS = {
  fr: { title: "La semaine zéro, expliquée par Max.", pending: "Vidéo à venir", description: "La vidéo en français sera disponible ici." },
  en: { title: "Week Zero, explained by Max.", pending: "Video coming soon", description: "The English video will be available here." },
};

export function OnboardingCompletion({ french }: { french: boolean }) {
  const language = french ? "fr" : "en";
  const video = VIDEO_SLOTS[language];
  return <div className={styles.completion} data-onboarding-completion="">
    <p className={styles.status} role="status">{french ? "Questionnaire envoyé à ton coach" : "Questionnaire sent to your coach"}</p>
    <p>{french ? "Tes réponses sont bien envoyées. Max peut maintenant les consulter pour préparer la suite." : "Your answers have been sent. Max can now review them to prepare what comes next."}</p>
    <section className={styles.videoIntroduction} aria-labelledby="week-zero-video-title" data-video-language={language}>
      <h2 id="week-zero-video-title">{video.title}</h2>
      <div className={styles.videoPlaceholder}>
        <strong>{video.pending}</strong>
        <p>{video.description}</p>
      </div>
    </section>
    <div className={styles.actions}>
      <a className="fe-button fe-button-primary" href="/client">{french ? "Retour à mon accueil" : "Back to my home"}</a>
    </div>
  </div>;
}
