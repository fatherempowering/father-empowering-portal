# Questionnaire d’accueil natif — mapping Tally

Source publique du questionnaire appartenant à Max : https://tally.so/r/44zdvk,
relevée le 22 septembre 2026. Aucune réponse Tally n’a été lue, créée ou importée.
La définition native comporte 64 questions dans les 6 sections d’origine :
54 réponses obligatoires avant transmission, 10 facultatives. Chaque question
conserve son `sourceId`; les valeurs sont stockées sous des clés métier stables.

## Adaptations explicites

- Les questions et options anglaises sont conservées; une traduction française
  canadienne permet l’usage dans le portail FR. Les coquilles `Excelent`,
  `Afternooon` et `5+times per week` sont corrigées dans les libellés, sans changer
  leur sens. Les réponses de choix sont des codes stables, pas les traductions.
- Deux titres annoncent une échelle **1 à 10** (engagement et confiance), tandis
  que Tally propose techniquement 0 à 10. Le natif suit le libellé 1 à 10 pour
  ces deux questions. Qualité du sommeil et stress conservent 0 à 10.
- Âge, taille et poids actuel restent des champs texte comme Tally. Taille et
  poids demandent de préciser l’unité; aucune conversion ni copie automatique
  dans le bilan de mesures existant n’est réalisée.
- Les nombres ont des bornes de cohérence : jours d’entraînement 0–7 entiers,
  années 0–100 (décimales permises), sommeil 0–24 h (décimales permises), repas
  0–24 entiers. Les textes sont bornés à 1 500 caractères pour les réponses
  longues. Ces limites sont affichées et contrôlées par le serveur.
- Les trois questions multi-choix restent multi-choix, y compris les lieux
  d’entraînement. Aucune réponse « Oui », « Non » ou note n’est précochée.
- Les explications « Si oui » restent facultatives comme la source, sans ajout
  de condition de soumission cachée.
- Nom/courriel sont des réponses de contact : elles ne changent ni l’identité
  authentifiée, ni le courriel de connexion, ni l’assignation au Coach.
  Le préremplissage accepte les limites existantes de M1 : nom complet jusqu’à
  241 caractères (120 + espace + 120), courriel jusqu’à 320 caractères.
- Le texte d’engagement original est présenté avant la confirmation explicite;
  aucun nouveau contrat, consentement juridique ou système de signature n’est ajouté.

## Parcours et sécurité

Questionnaire d’accueil et bilan initial restent deux documents distincts.
L’accueil propose le questionnaire en priorité lorsqu’il n’est pas transmis,
sans bloquer l’accès au bilan existant. Un brouillon demeure privé au Client;
seule une transmission explicite rend ses réponses lisibles au Coach autorisé
ou à l’Admin de son organisation, suivant les rôles existants.

Les réponses restent dans Supabase via les API serveur, avec RLS forcé, contrôle
de version et commandes idempotentes. Pas de stockage privé dans localStorage,
pas de contenu des réponses dans l’audit, les notifications ou les logs. Les
réponses transmises restent en lecture seule dans ce premier parcours.

Les accès au questionnaire ouvrent un document complet, afin que l’avertissement
de sortie protège également le bouton Retour du navigateur. Les sections du
questionnaire restent sur la même page; « Continuer » enregistre avant d’avancer.
La progression ne compte que les réponses obligatoires dont le format est valide.

Le formulaire public Tally et le portail Legacy ne sont pas modifiés. Aucune
réponse historique n’est importée et aucun statut Tally n’est présumé complété.
