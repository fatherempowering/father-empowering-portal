(function(global){
'use strict';

const FRENCH={
  "SETTINGS":"PARAMÈTRES","Check for updates":"Vérifier les mises à jour","Refresh training and nutrition plans":"Actualiser les plans d’entraînement et de nutrition",
  "Choose your portal language":"Choisis la langue de ton portail",
  "Export my data":"Exporter mes données","Download a private backup of your progress":"Télécharger une sauvegarde privée de ta progression",
  "Appearance":"APPARENCE","Choose how Legacy Protocol looks":"Choisis l’apparence du Legacy Protocol","LIGHT":"CLAIR","DARK":"SOMBRE",
  "About":"À PROPOS","Portal and protocol information":"Informations sur le portail et le protocole","Close settings":"Fermer les paramètres","Open settings":"Ouvrir les paramètres","Settings":"Paramètres",
  "HOME":"ACCUEIL","TRAINING":"ENTRAÎNEMENT","NUTRITION":"NUTRITION","CHECK-IN":"CHECK-IN","PROGRESSION":"PROGRESSION","HISTORY":"HISTORIQUE",
  "ONLINE":"EN LIGNE","OFFLINE":"HORS LIGNE","INSTALL":"INSTALLER","CLIENT PROTOCOL":"PROTOCOLE CLIENT","SELECT WEEK":"CHOISIR LA SEMAINE",
  "Welcome back.":"Bon retour.","Loading...":"Chargement…","START TODAY'S SESSION":"COMMENCER LA SÉANCE DU JOUR","Open today's training":"Ouvrir l’entraînement du jour",
  "Welcome back, {name}.":"Bon retour, {name}.","LANGUE / LANGUAGE":"LANGUE / LANGUAGE",
  "Open today's session.":"Ouvrir la séance du jour.","TODAY":"AUJOURD’HUI","READY":"PRÊT","WEEK EXECUTION":"EXÉCUTION DE LA SEMAINE",
  "Training completion for the active week.":"Progression des séances obligatoires de la semaine active.","DONE":"TERMINÉ","REST":"REPOS","RECOVERY":"RÉCUPÉRATION",
  "MONDAY":"LUNDI","TUESDAY":"MARDI","WEDNESDAY":"MERCREDI","THURSDAY":"JEUDI","FRIDAY":"VENDREDI","SATURDAY":"SAMEDI","SUNDAY":"DIMANCHE",
  "SESSIONS":"SÉANCES","CHECK-INS":"CHECK-INS","LBS CHANGE":"VARIATION LB","BODYWEIGHT THIS WEEK":"POIDS CORPOREL CETTE SEMAINE",
  "ARCHIVE WEEKLY CHECK-IN":"ARCHIVER LE CHECK-IN HEBDOMADAIRE","Archive this week":"Archiver cette semaine","Save your data, photos, and weekly notes":"Sauvegarder tes données, photos et notes hebdomadaires",
  "WEEK ZERO / ONBOARDING":"SEMAINE ZÉRO / ONBOARDING","FATHER EMPOWERING — ONBOARDING":"FATHER EMPOWERING — ONBOARDING","DATA ACQUISITION":"ACQUISITION DE DONNÉES",
  "Collect the starting data Max needs to build the protocol correctly.":"Recueille les données de départ dont Max a besoin pour construire correctement ton protocole.",
  "WEEK 0 — ONBOARDING":"SEMAINE 0 — ONBOARDING","Complete your onboarding before data acquisition begins.":"Complète ton onboarding avant de commencer l’acquisition de données.",
  "This first step gives Coach Max the context needed to build your protocol correctly.":"Cette première étape donne à Coach Max le contexte nécessaire pour construire correctement ton protocole.",
  "COMPLETE ONBOARDING":"COMPLÉTER L’ONBOARDING","I COMPLETED MY ONBOARDING":"J’AI TERMINÉ MON ONBOARDING",
  "This is the starting point of your protocol. Complete each step below so CoachMax can build your plan with precision.":"Voici le point de départ de ton protocole. Complète chaque étape afin que CoachMax puisse construire ton plan avec précision.",
  "No maxes. No failure. No guessing.":"Aucun maximum. Aucun échec. Aucune supposition.","Keep 2 to 4 reps in reserve on calibration lifts.":"Garde de 2 à 4 répétitions en réserve pendant les exercices de calibration.",
  "WEEK 0 STATUS":"STATUT DE LA SEMAINE 0","IN PROGRESS":"EN COURS","WEEK 0 PROGRESS":"PROGRESSION DE LA SEMAINE 0","START HERE":"COMMENCE ICI",
  "Your onboarding is complete. Now we need your starting data.":"Ton onboarding est terminé. Nous avons maintenant besoin de tes données de départ.",
  "Complete the steps in order. This should be simple. Take your photos, enter your measurements, record clean calibration loads, complete one easy cardio baseline, then send everything to CoachMax.":"Complète les étapes dans l’ordre. Prends tes photos, inscris tes mensurations, enregistre des charges de calibration propres, complète un test cardio de référence, puis envoie le tout à CoachMax.",
  "Take your photos":"Prends tes photos","Enter your measurements":"Inscris tes mensurations","Record calibration loads":"Enregistre tes charges de calibration","Complete baseline cardio":"Complète le test cardio de référence",
  "Add mobility and pain notes":"Ajoute tes notes de mobilité et de douleur","Review and send to CoachMax":"Révise et envoie à CoachMax","Important:":"Important :",
  "Do not chase numbers. Week 0 is not a test. It is a baseline.":"Ne cours pas après les chiffres. La Semaine 0 n’est pas un test, mais une référence.",
  "START HERE — TAKE PHOTOS":"COMMENCE ICI — PRENDS TES PHOTOS","Start with front, side, and back photos.":"Commence avec les photos de face, de profil et de dos.",
  "PHOTOS":"PHOTOS","Take your front, side, and back photos in consistent lighting.":"Prends tes photos de face, de profil et de dos avec un éclairage constant.",
  "FRONT":"FACE","SIDE":"PROFIL","BACK":"DOS","PHOTO NOTES":"NOTES SUR LES PHOTOS","NEXT — MEASUREMENTS":"SUIVANT — MENSURATIONS",
  "MEASUREMENTS":"MENSURATIONS","Take your measurements consistently. Repeat the same method in future check-ins.":"Prends tes mensurations de façon constante et répète la même méthode lors des prochains check-ins.",
  "MORNING BODYWEIGHT (LB)":"POIDS MATINAL (LB)","WAIST AT NAVEL (IN)":"TOUR DE TAILLE AU NOMBRIL (PO)","CHEST (IN)":"POITRINE (PO)","HIPS (IN)":"HANCHES (PO)",
  "RIGHT FLEX ARM (IN)":"BRAS DROIT FLÉCHI (PO)","RIGHT THIGH (IN)":"CUISSE DROITE (PO)","OTHER IMPORTANT MEASUREMENTS":"AUTRES MENSURATIONS IMPORTANTES","NEXT — LOADS":"SUIVANT — CHARGES",
  "CALIBRATION LOADS":"CHARGES DE CALIBRATION","Choose a comfortable load you can control while keeping 2 to 4 reps in reserve.":"Choisis une charge confortable que tu contrôles en gardant de 2 à 4 répétitions en réserve.",
  "If you do not know an exercise or you are not sure, ask Max. Do not attempt something that could get you injured.":"Si tu ne connais pas un exercice ou si tu hésites, demande à Max. Ne tente rien qui pourrait te blesser.",
  "NEXT — CARDIO":"SUIVANT — CARDIO","CONCEPT2 ROWER — 2000 M TEST":"RAMEUR CONCEPT2 — TEST DE 2000 M",
  "Complete a best-effort 2000 metre test on a Concept2 rower. Enter the monitor result below. The portal uses the official Concept2 VO₂ max formula.":"Effectue un test de 2000 mètres à ton meilleur effort sécuritaire sur un rameur Concept2. Inscris le résultat du moniteur ci-dessous. Le portail utilise la formule officielle Concept2 pour estimer le VO₂ max.",
  "Before starting:":"Avant de commencer :","Warm up properly. Use the damper setting that lets you produce your best safe result. Stop if you feel chest pain, dizziness, or unusual shortness of breath.":"Échauffe-toi correctement. Utilise le réglage qui te permet d’obtenir ton meilleur résultat sécuritaire. Arrête en cas de douleur thoracique, d’étourdissement ou d’essoufflement inhabituel.",
  "AGE":"ÂGE","BODYWEIGHT (LB)":"POIDS CORPOREL (LB)","SEX":"SEXE","Choose":"Choisir","Male":"Homme","Female":"Femme","TRAINING LEVEL":"NIVEAU D’ENTRAÎNEMENT",
  "Not highly trained":"Peu entraîné","Highly trained":"Très entraîné","2000 M TIME — MINUTES":"TEMPS 2000 M — MINUTES","2000 M TIME — SECONDS":"TEMPS 2000 M — SECONDES",
  "AVERAGE PACE / 500 M":"ALLURE MOYENNE / 500 M","AVERAGE POWER":"PUISSANCE MOYENNE","ESTIMATED VO₂ MAX":"VO₂ MAX ESTIMÉ","FITNESS CLASSIFICATION":"CLASSIFICATION DE LA CONDITION PHYSIQUE",
  "COACHMAX INTERPRETATION":"INTERPRÉTATION COACHMAX","COMMENT":"COMMENTAIRE","NEXT — MOBILITY":"SUIVANT — MOBILITÉ","MOBILITY & PAIN":"MOBILITÉ ET DOULEUR",
  "Record any movement limitations, stiffness, or pain CoachMax should account for.":"Note toute limitation de mouvement, raideur ou douleur dont CoachMax doit tenir compte.",
  "PAIN DURING SQUAT OR LEG WORK?":"DOULEUR PENDANT LES SQUATS OU LE TRAVAIL DES JAMBES?","PAIN DURING HINGE / RDL / DEADLIFT?":"DOULEUR PENDANT LES HINGES / RDL / DEADLIFTS?",
  "PAIN DURING PUSH / PRESS?":"DOULEUR PENDANT LES MOUVEMENTS DE POUSSÉE?","PAIN DURING PULL / ROW?":"DOULEUR PENDANT LES MOUVEMENTS DE TIRAGE?","PAIN DURING CARDIO?":"DOULEUR PENDANT LE CARDIO?",
  "MOST LIMITED MOVEMENT":"MOUVEMENT LE PLUS LIMITÉ","MOST COMFORTABLE MOVEMENT":"MOUVEMENT LE PLUS CONFORTABLE","TIGHT / STIFF AREA":"ZONE TENDUE OU RAIDE","No":"Non","Yes":"Oui",
  "If pain goes above 4/10 or feels sharp, stop the movement and write it down.":"Si la douleur dépasse 4/10 ou devient vive, arrête le mouvement et note-le.",
  "NEXT — REVIEW & SEND":"SUIVANT — RÉVISION ET ENVOI","REVIEW & SEND":"RÉVISER ET ENVOYER","Review your Week 0 data before sending it to CoachMax. Your answers stay saved locally on this device.":"Révise tes données de Semaine 0 avant de les envoyer à CoachMax. Tes réponses restent sauvegardées localement sur cet appareil.",
  "COPY SUMMARY":"COPIER LE RÉSUMÉ","SEND TO COACHMAX":"ENVOYER À COACHMAX","SEND TO MAX":"ENVOYER À MAX","EDIT ANSWERS":"MODIFIER LES RÉPONSES","Your data is saved automatically on this page.":"Tes données sont sauvegardées automatiquement sur cette page.",
  "ARCHIVE WEEK — CHECK-IN":"ARCHIVER LA SEMAINE — CHECK-IN","TRAINING VOLUME":"VOLUME D’ENTRAÎNEMENT","TOTAL LOAD":"CHARGE TOTALE","KEY PERFORMANCES":"PERFORMANCES CLÉS","ACTUAL LOAD":"CHARGE RÉELLE",
  "Selected week total":"Total de la semaine sélectionnée","LAST CHECK-IN":"DERNIER CHECK-IN","BODYWEIGHT":"POIDS CORPOREL","SLEEP":"SOMMEIL","ENERGY":"ÉNERGIE","STRESS":"STRESS","SORENESS":"COURBATURES","CARDIO":"CARDIO",
  "No check-in yet":"Aucun check-in pour le moment","PHOTOS PROGRESSION":"PHOTOS DE PROGRESSION","WEEKLY CHECK-IN":"CHECK-IN HEBDOMADAIRE",
  "Bodyweight · sleep · energy · stress · soreness · cardio · measurements · photos":"Poids · sommeil · énergie · stress · courbatures · cardio · mensurations · photos",
  "Bodyweight":"Poids corporel","Morning, fasted, same day each week":"Le matin, à jeun, la même journée chaque semaine","Sleep hours":"Heures de sommeil","Average per night this week":"Moyenne par nuit cette semaine",
  "Energy level":"Niveau d’énergie","1 = drained · 10 = machine":"1 = épuisé · 10 = machine","Sleep quality":"Qualité du sommeil","1 = terrible · 10 = perfect":"1 = terrible · 10 = parfaite",
  "Stress level":"Niveau de stress","1 = calm · 10 = overloaded":"1 = calme · 10 = surchargé","Pain / soreness":"Douleur / courbatures","1 = none · 10 = limiting · note where below":"1 = aucune · 10 = limitante · précise l’endroit ci-dessous",
  "Cardio completed":"Cardio effectué","Total weekly minutes + dominant zone":"Minutes totales de la semaine + zone dominante","Measurements":"Mensurations","(inches — optional, every 2 weeks)":"(pouces — facultatif, toutes les 2 semaines)",
  "WAIST":"TAILLE","CHEST":"POITRINE","FLEX ARM":"BRAS FLÉCHI","THIGH":"CUISSE","CALF":"MOLLET","Weekly notes":"Notes hebdomadaires","PROGRESS PHOTOS":"PHOTOS DE PROGRESSION",
  "Same place · same lighting · same pose, every week.":"Même endroit · même éclairage · même pose, chaque semaine.","Photos stay archived locally on this device.":"Les photos restent archivées localement sur cet appareil.",
  "📤 ARCHIVE WEEKLY CHECK-IN":"📤 ARCHIVER LE CHECK-IN HEBDOMADAIRE","Saves the week locally for your personal history and charts":"Sauvegarde la semaine localement dans ton historique et tes graphiques personnels",
  "DATA":"DONNÉES","100 DAYS":"100 JOURS","What gets measured gets improved":"Ce qui est mesuré peut être amélioré","MANUAL DATA MODE — CHECK-IN ENTRY":"MODE DE DONNÉES MANUELLES — SAISIE DU CHECK-IN",
  "Add or correct a check-in for any week":"Ajouter ou corriger un check-in pour n’importe quelle semaine","WEEK":"SEMAINE","SAVE CHECK-IN":"SAUVEGARDER LE CHECK-IN",
  "WEEKLY READINESS — ENERGY / SLEEP / STRESS / SORENESS":"ÉTAT HEBDOMADAIRE — ÉNERGIE / SOMMEIL / STRESS / COURBATURES","LOADS — KEY LIFTS (LBS)":"CHARGES — EXERCICES CLÉS (LB)",
  "START WEIGHT":"POIDS INITIAL","VARIATION":"VARIATION","CURRENT WEIGHT":"POIDS ACTUEL","START VS LATEST":"DÉPART VS PLUS RÉCENT","MEASUREMENT TREND (IN)":"TENDANCE DES MENSURATIONS (PO)",
  "Archive measurements to unlock this trend.":"Archive des mensurations pour afficher cette tendance.","CHANGE SINCE START":"CHANGEMENT DEPUIS LE DÉPART","BODYWEIGHT SEPARATE":"POIDS CORPOREL SÉPARÉ","SHAPE SCORE":"SCORE PHYSIQUE",
  "ARCHIVES":"ARCHIVES","SESSIONS + CHECK-INS":"SÉANCES + CHECK-INS","Everything archived locally · export and import your data at the bottom":"Tout est archivé localement · exporte ou importe tes données au bas de la page",
  "⬇ EXPORT":"⬇ EXPORTER","JSON backup":"Sauvegarde JSON","⬆ IMPORT":"⬆ IMPORTER","Restore JSON":"Restaurer le JSON","RESET":"RÉINITIALISER",
  "All local data will be erased: sessions, check-ins, photos. This cannot be undone. Export first if you want a backup.":"Toutes les données locales seront effacées : séances, check-ins et photos. Cette action est irréversible. Exporte d’abord une sauvegarde si tu veux conserver une copie.",
  "DELETE ALL":"TOUT EFFACER","CANCEL":"ANNULER","HOLD THE NAME FOR 3 SECONDS TO REOPEN":"MAINTIENS LE NOM 3 SECONDES POUR ROUVRIR","CLOSE":"FERMER","CONFIRM":"CONFIRMER","REST":"REPOS",
  "SESSION NOTES":"NOTES DE SÉANCE","SESSION COMPLETED ✓":"SÉANCE TERMINÉE ✓","SAVED ✓ — SESSION COMPLETED":"SAUVEGARDÉ ✓ — SÉANCE TERMINÉE","EXERCISE":"EXERCICE","SETS":"SÉRIES","REPS":"RÉPÉTITIONS","TARGET LOAD":"CHARGE CIBLE",
  "RESULTS PER SET":"RÉSULTATS PAR SÉRIE","LOAD · REPS · RIR":"CHARGE · RÉP. · RIR","SET":"SÉRIE","LOAD":"CHARGE","REPETITIONS":"RÉPÉTITIONS","REPS PER SIDE":"RÉP. PAR CÔTÉ","ESTIMATED RIR":"RIR ESTIMÉ","NOTE / PAIN":"NOTE / DOULEUR",
  "NUTRITION PLAN":"PLAN NUTRITIONNEL","NUTRITION BUILD":"CONSTRUCTION DU PLAN NUTRITIONNEL","NUTRITION BUILD IN PROGRESS":"PLAN NUTRITIONNEL EN CONSTRUCTION","BASE RULES":"RÈGLES DE BASE","MEAL TEMPLATE":"MODÈLE DE REPAS","NOTES FOR FUTURE UPDATES":"NOTES POUR LES PROCHAINES MISES À JOUR",
  "Nutrition targets and meal structure will appear here after Coach Max reviews the intake data.":"Les cibles nutritionnelles et la structure des repas apparaîtront ici après l’analyse des données par Coach Max.",
  "SESSION COMPLETE":"SÉANCE TERMINÉE","The work is logged.":"Le travail est enregistré.","You kept the standard today.":"Tu as respecté le standard aujourd’hui.","session completed":"séance terminée","this week":"cette semaine","CONTINUE":"CONTINUER","VIEW WEEK":"VOIR LA SEMAINE",
  "WEEK COMPLETE":"SEMAINE TERMINÉE","You did what you said you would do.":"Tu as fait ce que tu avais dit que tu ferais.","That is how a man rebuilds trust with himself.":"C’est ainsi qu’un homme rebâtit la confiance en lui-même.",
  "Archive your weekly check-in to unlock the next week.":"Archive ton check-in hebdomadaire pour débloquer la semaine suivante.","Check-in required to unlock next week.":"Check-in requis pour débloquer la semaine suivante.","Facts first. Then progression.":"Les faits d’abord. Ensuite, la progression.",
  "GO TO CHECK-IN":"ALLER AU CHECK-IN","REVIEW THIS WEEK":"RÉVISER CETTE SEMAINE","CHECK-IN ARCHIVED":"CHECK-IN ARCHIVÉ","Your data is locked in.":"Tes données sont enregistrées.","Now we adjust based on facts, not feelings.":"Nous ajustons maintenant selon les faits, pas les impressions.",
  "Progress updated":"Progression mise à jour","Week history saved":"Historique de la semaine sauvegardé","VIEW PROGRESSION":"VOIR LA PROGRESSION","BACK HOME":"RETOUR À L’ACCUEIL",
  "CHECK-IN REQUIRED":"CHECK-IN REQUIS","This week is locked for now.":"Cette semaine est verrouillée pour le moment.","Submit your weekly check-in to move forward.":"Envoie ton check-in hebdomadaire pour continuer.",
  "Required fields: bodyweight and sleep hours. Measurements, notes, and photos remain optional.":"Champs requis : poids corporel et heures de sommeil. Les mensurations, notes et photos restent facultatives.",
  "REQUIRED TO UNLOCK NEXT WEEK:":"REQUIS POUR DÉBLOQUER LA SEMAINE SUIVANTE :","COMPLETE CHECK-IN":"COMPLÉTER LE CHECK-IN","BACK TO HOME":"RETOUR À L’ACCUEIL",
  "MILESTONE HIT":"ÉTAPE FRANCHIE","This is not luck.":"Ce n’est pas de la chance.","This is repeated execution.":"C’est le résultat d’une exécution répétée.","You reached":"Tu as atteint","a new checkpoint.":"une nouvelle étape.","Keep the standard. Do not coast.":"Maintiens le standard. Ne relâche pas.","VIEW PROGRESS":"VOIR LA PROGRESSION",
  "TRAINING STREAK":"SÉRIE D’ENTRAÎNEMENT","You are building proof.":"Tu construis des preuves.","Consistency creates the man.":"La constance construit l’homme.","SESSIONS COMPLETED":"SÉANCES TERMINÉES","SINCE STARTING":"DEPUIS LE DÉPART","Standard is becoming identity.":"Le standard devient ton identité.","KEEP GOING":"CONTINUE","VIEW TRAINING":"VOIR L’ENTRAÎNEMENT",
  "INSTALL YOUR PORTAL":"INSTALLE TON PORTAIL","Installing gives you the full-screen app experience and keeps your portal one tap away.":"L’installation offre l’expérience plein écran et garde ton portail à portée d’un toucher.","Open in Safari":"Ouvrir dans Safari","Open in Browser":"Ouvrir dans le navigateur","Share":"Partager","Add to Home Screen":"Ajouter à l’écran d’accueil","Add":"Ajouter","GOT IT":"COMPRIS",
  "CLIENT RESULT":"RÉSULTAT CLIENT","RESULT POSTER":"AFFICHE DE RÉSULTAT","Before, after, result. Ready to share.":"Avant, après, résultat. Prêt à partager.","GENERATE POSTER":"GÉNÉRER L’AFFICHE","DOWNLOAD PNG":"TÉLÉCHARGER LE PNG","COPY CAPTION":"COPIER LA LÉGENDE","RESET DATA":"RÉINITIALISER LES DONNÉES",
  "BEFORE":"AVANT","AFTER":"APRÈS","DURATION":"DURÉE","RESULT":"RÉSULTAT","FAT LOSS":"PERTE DE GRAS","MASS GAIN":"GAIN DE MASSE","BODY RECOMP":"RECOMPOSITION","PENDING":"EN ATTENTE","PROGRESS":"PROGRESSION",
  "I FOLLOWED THE SYSTEM.":"J’AI SUIVI LE SYSTÈME.","I SHOWED UP.":"J’ÉTAIS PRÉSENT.","I CHANGED THE STANDARD.":"J’AI CHANGÉ LE STANDARD.","Saved":"Sauvegardé","Missing":"Manquant","Pending":"En attente",
  "MANUAL POSTER MODE":"MODE MANUEL DE L’AFFICHE","FINAL WEIGHT":"POIDS FINAL","RESULT HEADLINE":"TITRE DU RÉSULTAT","RESULT LABEL":"LIBELLÉ DU RÉSULTAT","REPLACE BEFORE PHOTO":"REMPLACER LA PHOTO AVANT","REPLACE AFTER PHOTO":"REMPLACER LA PHOTO APRÈS","SAVE MANUAL EDITS":"SAUVEGARDER LES MODIFICATIONS",
  "Data saved locally may not transfer between devices.":"Les données sauvegardées localement peuvent ne pas être transférées entre appareils.",
  "CHECKING…":"VÉRIFICATION…","CHECKING":"VÉRIFICATION","SAVING":"SAUVEGARDE","SAVED":"SAUVEGARDÉ","UPDATED":"MIS À JOUR","UPDATE":"METTRE À JOUR","UPDATE NOW":"METTRE À JOUR","NEW TRAINING PHASE":"NOUVELLE PHASE D’ENTRAÎNEMENT","PROTOCOL UPDATE":"MISE À JOUR DU PROTOCOLE",
  "ABOUT LEGACY PROTOCOL":"À PROPOS DU LEGACY PROTOCOL","NO UPDATE AVAILABLE":"AUCUNE MISE À JOUR","UPDATE CHECK FAILED":"ÉCHEC DE LA VÉRIFICATION","UPDATE NOT APPLIED":"MISE À JOUR NON APPLIQUÉE","PORTAL UPDATED":"PORTAIL MIS À JOUR","UPDATE COMPLETE":"MISE À JOUR TERMINÉE","COACHMAX UPDATE":"MISE À JOUR COACHMAX",
  "Portal Version":"Version du portail","Protocol Version":"Version du protocole","Last Updated":"Dernière mise à jour","Designed by Father Empowering.":"Conçu par Father Empowering.","Powered by CoachMax":"Propulsé par CoachMax",
  "Legacy Protocol is a high-performance coaching platform built to help you execute your training, nutrition, and recovery with precision. Every update is designed to improve your coaching experience while preserving your progress.":"Legacy Protocol est une plateforme de coaching haute performance conçue pour t’aider à exécuter ton entraînement, ta nutrition et ta récupération avec précision. Chaque mise à jour améliore ton expérience tout en préservant ta progression.",
  "PHOTO SAVE FAILED":"ÉCHEC DE LA SAUVEGARDE DE LA PHOTO","IMPORT BACKUP":"IMPORTER UNE SAUVEGARDE","IMPORT COMPLETE":"IMPORTATION TERMINÉE","IMPORT FAILED":"ÉCHEC DE L’IMPORTATION","BACKUP":"SAUVEGARDE",
  "Nothing yet — complete a session or archive a check-in.":"Rien pour le moment — termine une séance ou archive un check-in.","No key lifts configured":"Aucun exercice clé configuré","No measurement data yet.":"Aucune donnée de mensuration pour le moment.","Archive a check-in with measurements to unlock this section.":"Archive un check-in avec des mensurations pour afficher cette section.",
  "Close":"Fermer","Progression secondary sections":"Sections secondaires de progression","Shape score info":"Information sur le score physique","Timer repos":"Minuteur de repos",
  "Auto-filled from Measurements":"Rempli automatiquement depuis les mensurations","Calculated automatically":"Calculé automatiquement","Calculated from age and sex":"Calculé selon l’âge et le sexe","Enter N.A. if not applicable":"Inscris S.O. si non applicable",
  "Feel, soreness, adjustments...":"Sensations, courbatures, ajustements…","Lighting, timing, posture, anything to note...":"Éclairage, moment, posture ou autre détail…","Neck, calf, hips details, or anything useful...":"Cou, mollet, détails des hanches ou toute information utile…",
  "Pacing, breathing, legs, monitor details, anything CoachMax should know...":"Allure, respiration, jambes, données du moniteur ou information utile pour CoachMax…","Technique, pain, range of motion, confidence...":"Technique, douleur, amplitude de mouvement, confiance…","Wins, issues, pain points, adjustments needed...":"Victoires, problèmes, douleurs et ajustements nécessaires…","years":"ans",
  "DIRECTIVES":"DIRECTIVES","Understand what to complete.":"Comprends les étapes à compléter.","Front, side, and back.":"Face, profil et dos.","Weight and body measurements.":"Poids et mensurations corporelles.","LOADS":"CHARGES","Calibration loads only.":"Charges de calibration seulement.","One easy baseline test.":"Un test de référence contrôlé.","MOBILITY":"MOBILITÉ","Pain and movement notes.":"Notes sur la douleur et le mouvement.","REVIEW / SEND":"RÉVISER / ENVOYER","Send data to Coach Max.":"Envoie les données à Coach Max.",
  "ACTUAL RESULT":"RÉSULTAT RÉEL","WARM-UP — REQUIRED":"ÉCHAUFFEMENT — OBLIGATOIRE","PROTOCOL BUILD":"CONSTRUCTION DU PROTOCOLE","PROTOCOL BUILD IN PROGRESS":"CONSTRUCTION DU PROTOCOLE EN COURS","This session will be built after Coach Max reviews the Week 0 acquisition data.":"Cette séance sera construite après l’analyse des données de la Semaine 0 par Coach Max.",
  "Bodyweight":"Poids du corps","Calibration load":"Charge de calibration","result":"résultat","Rest: {seconds} sec":"Repos : {seconds} s","Tempo {tempo}":"Tempo {tempo}",
  "Poor":"Faible","Fair":"Sous la moyenne","Average":"Moyenne","Good":"Bonne","Excellent":"Excellente","Classification unavailable for age 70+":"Classification non disponible à partir de 70 ans",
  "Excellent aerobic engine. Preserve it while rebuilding training volume progressively.":"Excellent moteur aérobique. Préserve-le tout en reconstruisant progressivement le volume d’entraînement.","Excellent aerobic capacity. Maintain it with structured Zone 2 work and selective high-intensity intervals.":"Excellente capacité aérobique. Maintiens-la avec un travail structuré en zone 2 et quelques intervalles à haute intensité.",
  "Strong aerobic base after the training break. Rebuild workload gradually before pushing maximal intervals.":"Bonne base aérobique après l’arrêt d’entraînement. Reconstruis graduellement la charge de travail avant les intervalles maximaux.","Good aerobic base. Continue building Zone 2 capacity and rowing efficiency.":"Bonne base aérobique. Continue de développer ta capacité en zone 2 et ton efficacité au rameur.",
  "Functional aerobic baseline. Prioritize consistent Zone 2 work and progressive rowing technique before adding harder intervals.":"Base aérobique fonctionnelle. Priorise un travail constant en zone 2 et une technique de rame progressive avant d’ajouter des intervalles plus exigeants.","Aerobic capacity needs development. Start with low-impact Zone 2 work, controlled progression, and repeat the test later.":"La capacité aérobique doit être développée. Commence avec du travail à faible impact en zone 2, progresse de façon contrôlée et répète le test plus tard.",
  "Aerobic capacity is a priority. Begin conservatively with sustainable low-intensity work and build consistency first.":"La capacité aérobique est une priorité. Commence prudemment avec du travail soutenable à faible intensité et bâtis d’abord la constance.","VO₂ max estimated. Use the result as a rowing baseline and track change over time under similar test conditions.":"VO₂ max estimé. Utilise ce résultat comme référence au rameur et suis son évolution dans des conditions de test similaires.",
  "Your history, photos, measurements, check-ins and progress will remain intact.":"Ton historique, tes photos, tes mensurations, tes check-ins et ta progression resteront intacts.","Your protocol is up to date. Your history, photos, measurements, check-ins and progress were preserved.":"Ton protocole est à jour. Ton historique, tes photos, tes mensurations, tes check-ins et ta progression ont été préservés.","Your training and nutrition plans are already current.":"Tes plans d’entraînement et de nutrition sont déjà à jour.","Check your internet connection and try again. No client data was changed.":"Vérifie ta connexion Internet et réessaie. Aucune donnée client n’a été modifiée.",
  "CLIENT NAME":"NOM DU CLIENT","CLIENT NAME · PROGRAM TEMPLATE":"NOM DU CLIENT · MODÈLE DE PROGRAMME","FATHER EMPOWERING · LEGACY PROTOCOL":"FATHER EMPOWERING · LEGACY PROTOCOL","FATHER EMPOWERING — WEEK ZERO":"FATHER EMPOWERING — SEMAINE ZÉRO","Father Empowering Protocol — Blank Template":"Protocole Father Empowering — Modèle vierge","Coach":"Coach",
  "MANUAL DATA MODE — ALL WEEKS":"MODE DE DONNÉES MANUELLES — TOUTES LES SEMAINES","EXIT":"QUITTER","NOTE":"NOTE","BODYWEIGHT (LBS)":"POIDS CORPOREL (LB)","ENERGY /10":"ÉNERGIE /10","SLEEP /10":"SOMMEIL /10","STRESS /10":"STRESS /10","SORENESS /10":"COURBATURES /10","MOBILITY & PAIN":"MOBILITÉ ET DOULEUR",
  "Quick review before sending the acquisition data directly to Max on Telegram.":"Révise rapidement les données avant de les envoyer directement à Max sur Telegram.","Everything archived locally · export and import your data at the bottom":"Tout est archivé localement · exporte et importe tes données au bas de la page","Same place · same lighting · same pose, every week.":"Même endroit · même éclairage · même pose, chaque semaine.",
  "If this link opened inside":"Si ce lien s’est ouvert dans",", tap the menu and choose":", touche le menu et choisis","In Safari, tap the":"Dans Safari, touche le bouton","button at the bottom of the screen.":"au bas de l’écran.","Select":"Sélectionne",". Keep the suggested portal name, then tap":". Garde le nom de portail suggéré, puis touche","or":"ou",
  "Arms":"Bras","Chest":"Poitrine","Flex Arm":"Bras fléchi","Waist":"Taille","Zone":"Zone","Zone 1":"Zone 1","Zone 2":"Zone 2","Zone 3":"Zone 3","PROTOCOL":"PROTOCOLE",
  "START NEW PHASE":"COMMENCER LA NOUVELLE PHASE","SAFE ROLLBACK":"RETOUR SÉCURISÉ","The update could not be applied. Your previous phase remains active.":"La mise à jour n’a pas pu être appliquée. Ta phase précédente demeure active.","Your current phase will be archived and {phase} will start at Week 1.":"Ta phase actuelle sera archivée et {phase} commencera à la Semaine 1.",
  "SUMMARY COPIED":"RÉSUMÉ COPIÉ","COPY FAILED":"ÉCHEC DE LA COPIE","Week 0 summary copied ✓":"Résumé de la Semaine 0 copié ✓","Copy failed. Select the summary and copy it manually.":"La copie a échoué. Sélectionne le résumé et copie-le manuellement.","WEEK 0 NOT COMPLETE":"SEMAINE 0 INCOMPLÈTE","Complete the following before sending:":"Complète les éléments suivants avant l’envoi :","TELEGRAM NOT CONFIGURED":"TELEGRAM NON CONFIGURÉ","The send did not work. Your data is saved on this page.":"L’envoi n’a pas fonctionné. Tes données sont sauvegardées sur cette page.","Click “Copy Summary” and send it directly to Max.":"Touche « Copier le résumé » et envoie-le directement à Max.","SEND WEEK 0":"ENVOYER LA SEMAINE 0","Send Week 0 acquisition data directly to Max on Telegram now?":"Envoyer maintenant les données d’acquisition de la Semaine 0 directement à Max sur Telegram?","WORKOUT BEING CREATED":"ENTRAÎNEMENT EN CRÉATION","Your workout is being created.":"Ton entraînement est en cours de création.","You'll hear from Coach Max as soon as it's ready.":"Coach Max te contactera dès qu’il sera prêt.","SEND FAILED":"ÉCHEC DE L’ENVOI","Error:":"Erreur :",
  "PHOTO":"PHOTO","This photo could not be saved on this device. Storage may be full or private browsing may be blocking photo storage.":"Cette photo n’a pas pu être sauvegardée sur cet appareil. Le stockage est peut-être plein ou la navigation privée bloque peut-être les photos.","Your text data was not erased. Free up storage or try again with a smaller image.":"Tes données textuelles n’ont pas été effacées. Libère de l’espace ou réessaie avec une image plus petite.",
  "This replaces the local portal data on this device.":"Cette opération remplace les données locales du portail sur cet appareil.","Export first if you want a copy of the current state.":"Exporte d’abord une copie si tu veux conserver l’état actuel.","IMPORT":"IMPORTER","Backup restored successfully.":"Sauvegarde restaurée avec succès.","This file could not be imported.":"Ce fichier n’a pas pu être importé.",
  "ARCHIVE CHECK-IN":"ARCHIVER LE CHECK-IN","This saves the weekly data locally.":"Cette opération sauvegarde les données hebdomadaires localement.","If Telegram is configured, a restore backup is sent automatically.":"Si Telegram est configuré, une sauvegarde de restauration est envoyée automatiquement.","CHECK-IN SENT":"CHECK-IN ENVOYÉ","SEND QUEUED":"ENVOI EN ATTENTE","TELEGRAM FAILED":"ÉCHEC TELEGRAM",
  "POSTER NOT READY":"AFFICHE NON PRÊTE","Week 0 side photo, start weight, final side photo, and final weight are required.":"La photo de profil de la Semaine 0, le poids initial, la photo finale de profil et le poids final sont requis.","CAPTION COPIED":"LÉGENDE COPIÉE","The result caption is ready to paste.":"La légende du résultat est prête à coller.","IMAGE TOO LARGE":"IMAGE TROP VOLUMINEUSE","This image is too large to save locally. Please upload a smaller image or use manual poster upload later.":"Cette image est trop volumineuse pour être sauvegardée localement. Téléverse une image plus petite ou utilise plus tard le mode manuel.","RESET POSTER DATA":"RÉINITIALISER LES DONNÉES DE L’AFFICHE","Are you sure? This will remove saved poster photos and result data from this device.":"Es-tu certain? Cette action supprimera de cet appareil les photos et les données de résultat de l’affiche."
};

const ENGLISH={
  "100 JOURS":"100 DAYS","MENSURATIONS":"MEASUREMENTS","Tour de taille":"Waist","Tour de poitrine":"Chest","Tour de cuisse":"Thigh","Tour de mollet":"Calf","PHOTOS PROGRESSION":"PROGRESS PHOTOS","FACE":"FRONT","PROFIL":"SIDE","DOS":"BACK","Timer repos":"Rest timer"
};

const state={language:'en',defaultLanguage:'en',storageKey:'',configured:false,observer:null};
const originalText=new WeakMap();
const originalAttrs=new WeakMap();

function normalizeLanguage(value){
  return String(value||'').toLowerCase().startsWith('fr')?'fr':'en';
}
function interpolate(text,vars){
  return String(text==null?'':text).replace(/\{([^}]+)\}/g,function(_,key){return vars&&vars[key]!=null?String(vars[key]):'';});
}
function translatePattern(text,language){
  const patterns=[
    [/^WEEK (\d+)$/,language==='fr'?'SEMAINE $1':'WEEK $1'],
    [/^Week (\d+) execution$/,language==='fr'?'Exécution de la semaine $1':'Week $1 execution'],
    [/^(\d+) \/ (\d+) DONE$/,language==='fr'?'$1 / $2 TERMINÉES':'$1 / $2 DONE'],
    [/^Week (\d+) check-in archived ✓$/,language==='fr'?'Check-in de la semaine $1 archivé ✓':'Week $1 check-in archived ✓'],
    [/^Week (\d+) check-in saved\.$/,language==='fr'?'Check-in de la semaine $1 sauvegardé.':'Week $1 check-in saved.'],
    [/^Week (\d+) · load × sets × reps$/,language==='fr'?'Semaine $1 · charge × séries × répétitions':'Week $1 · load × sets × reps'],
    [/^Sum of entered loads · week (\d+)$/,language==='fr'?'Somme des charges inscrites · semaine $1':'Sum of entered loads · week $1'],
    [/^No programmed session for (.+)\.$/,language==='fr'?'Aucune séance programmée pour $1.':'No programmed session for $1.'],
    [/^(.+) completed\.$/,language==='fr'?'$1 terminé.':'$1 completed.'],
    [/^(.+) is ready\.$/,language==='fr'?'$1 est prêt.':'$1 is ready.'],
    [/^(\d+) entries$/,language==='fr'?'$1 entrées':'$1 entries'],
    [/^(\d+) mesures$/,language==='fr'?'$1 mensurations':'$1 measurements'],
    [/^Rest: (\d+) sec$/,language==='fr'?'Repos : $1 s':'Rest: $1 sec'],
    [/^Load for (.+) set (\d+)$/,language==='fr'?'Charge pour $1, série $2':'Load for $1 set $2'],
    [/^Repetitions for (.+) set (\d+)$/,language==='fr'?'Répétitions pour $1, série $2':'Repetitions for $1 set $2'],
    [/^ARCHIVE WEEK (\d+)$/,language==='fr'?'ARCHIVER LA SEMAINE $1':'ARCHIVE WEEK $1'],
    [/^Week (\d+) check-in sent ✓(.*)$/,language==='fr'?'Check-in de la semaine $1 envoyé ✓$2':'Week $1 check-in sent ✓$2'],
    [/^Week (\d+) archived locally\.\n\nConnection issue: the report will retry automatically when the connection comes back\.$/,language==='fr'?'Semaine $1 archivée localement.\n\nProblème de connexion : le rapport sera renvoyé automatiquement au retour de la connexion.':'Week $1 archived locally.\n\nConnection issue: the report will retry automatically when the connection comes back.'],
    [/^Week (\d+) check-in archived locally ✓$/,language==='fr'?'Check-in de la semaine $1 archivé localement ✓':'Week $1 check-in archived locally ✓']
  ];
  for(const item of patterns)if(item[0].test(text))return text.replace(item[0],item[1]);
  return null;
}
function text(source,vars,language){
  const lang=normalizeLanguage(language||state.language);
  const raw=String(source==null?'':source);
  const canonical=ENGLISH[raw]||raw;
  let result=lang==='fr'?(FRENCH[canonical]||FRENCH[raw]||raw):canonical;
  const patterned=translatePattern(canonical,lang);
  if(patterned!=null)result=patterned;
  return interpolate(result,vars);
}
function localized(value,language){
  if(value==null)return '';
  if(typeof value!=='object'||Array.isArray(value))return String(value);
  const lang=normalizeLanguage(language||state.language);
  return String(value[lang]||value[lang==='fr'?'fr-ca':'en-ca']||value.en||value.fr||'');
}
function translateTextNode(node){
  if(!node||node.nodeType!==3||!/[A-Za-zÀ-ÿ]/.test(node.nodeValue||''))return;
  if(!originalText.has(node))originalText.set(node,node.nodeValue);
  const source=originalText.get(node);
  const leading=(source.match(/^\s*/)||[''])[0],trailing=(source.match(/\s*$/)||[''])[0];
  const core=source.trim();
  node.nodeValue=leading+text(core)+trailing;
}
function translateAttributes(node){
  if(!node||node.nodeType!==1)return;
  const names=['placeholder','title','aria-label','alt'];
  let saved=originalAttrs.get(node);
  if(!saved){saved={};originalAttrs.set(node,saved);}
  names.forEach(function(name){
    if(!node.hasAttribute(name))return;
    if(saved[name]==null)saved[name]=node.getAttribute(name);
    node.setAttribute(name,text(saved[name]));
  });
}
function translateTree(root){
  if(!root)return;
  if(root.nodeType===3){translateTextNode(root);return;}
  if(root.nodeType===1)translateAttributes(root);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())){
    if(node.nodeType===3)translateTextNode(node);else translateAttributes(node);
  }
}
function updateButtons(){
  if(typeof document==='undefined')return;
  document.querySelectorAll('[data-language-choice]').forEach(function(button){button.classList.toggle('active',button.getAttribute('data-language-choice')===state.language);});
}
function apply(language){
  state.language=normalizeLanguage(language||state.language);
  if(typeof document!=='undefined'){
    document.documentElement.setAttribute('lang',state.language==='fr'?'fr-CA':'en');
    translateTree(document.body);
    updateButtons();
    document.dispatchEvent(new CustomEvent('fe:languagechange',{detail:{language:state.language}}));
  }
  return state.language;
}
function setLanguage(language){
  const next=normalizeLanguage(language);
  try{if(state.storageKey)localStorage.setItem(state.storageKey,next);}catch(e){}
  return apply(next);
}
function configure(options){
  options=options||{};
  state.storageKey=String(options.storageKey||state.storageKey||'');
  state.defaultLanguage=normalizeLanguage(options.defaultLanguage||state.defaultLanguage);
  let saved='';
  try{saved=state.storageKey?localStorage.getItem(state.storageKey)||'':'';}catch(e){}
  state.language=normalizeLanguage(saved||state.defaultLanguage);
  state.configured=true;
  if(typeof document!=='undefined'){
    if(!state.observer&&document.body){
      state.observer=new MutationObserver(function(records){
        records.forEach(function(record){
          if(record.type==='characterData')translateTextNode(record.target);
          record.addedNodes.forEach(function(node){translateTree(node);});
        });
      });
      state.observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    }
    apply(state.language);
  }
  return state.language;
}

global.FE_I18N={configure:configure,setLanguage:setLanguage,apply:apply,t:text,localized:localized,translateTree:translateTree,getLanguage:function(){return state.language;},normalizeLanguage:normalizeLanguage,dictionaries:{en:ENGLISH,fr:FRENCH}};
})(window);
