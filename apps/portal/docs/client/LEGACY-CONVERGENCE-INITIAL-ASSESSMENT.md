# Convergence Legacy — première boucle de coaching

## Périmètre

Le mandat de convergence remplace les arrêts par milestone et la priorité au
polish V2. Ce lot poursuit la PR M1.8 existante. Il livre un **bilan initial**,
première partie du Week Zero, en ligne : saisie Client, brouillon privé persistant,
reprise, transmission explicite, puis lecture dans le dossier du Coach autorisé.
Il ne représente pas une complétion globale du Week Zero Legacy.

## Sources Legacy étudiées avant implémentation

Le `index.html` historique reste inchangé. Les références de lignes correspondent
au snapshot Legacy `970f515f289fc45821e724d91453804fc0cc2cc3`.

| Source | Valeur conservée | Adaptation sécurisée |
| --- | --- | --- |
| Mesures, lignes 1020–1033, complétion 2519–2526 | Poids matin en lb, taille au nombril en pouces; autres mesures facultatives | Valeurs numériques contrôlées, identité de session |
| Mobilité, lignes 1070–1085 | Douleurs squat/hinge/push/pull/cardio, mouvement limité/confortable, zone raide; N.A. permis | Aucun « Non » implicite, réponse explicite avant transmission |
| Schéma initial, lignes 2117–2125 | Disponibilités: jours, créneau, durée, fréquence, contraintes | Saisie facultative; ce champ était latent dans le Legacy, pas un calendrier prescrit |
| Sauvegarde locale, lignes 2865–2889 | Reprise de collecte et maintien des saisies en cas d’échec | Brouillon serveur privé, confirmation de sauvegarde, contrôle de version |
| Transmission, lignes 3134–3173 | Validation, résultat connu avant statut « envoyé » | Soumission transactionnelle et idempotente; visibilité Coach après succès uniquement |
| Tally, lignes 2652–2687 | Pré-intake temporaire externe | Lien existant sans import ni fausse confirmation serveur de complétion |

## Contrat des parcours

- Client: `/client` ou `/client/today` → prochaine action issue de son bilan
  → `/client/week-zero` → Mesures → Mobilité → Disponibilités → Vérifier et transmettre.
- Brouillon: seul le Client le voit; le Coach voit « Aucun bilan initial transmis ».
- Transmission: réponses requises contrôlées à l’API et en SQL, version attendue,
  clé de commande idempotente. Réponses transmises en lecture seule.
- Coach: `/coach` → dossier Client → bilan transmis avec unités et réponses lisibles.
- Accès staff après transmission : Coach vérifié assigné, ou Admin vérifié de la
  même organisation conformément au modèle existant. Un Admin d'une autre
  organisation n'y accède pas; aucun staff ne voit les brouillons privés.
- Un échec réseau ne devient jamais un succès; les valeurs restent affichées.
  Une version périmée ne remplace pas silencieusement une version plus récente.
- Le navigateur passe par `/api/v1`; aucune clé privilégiée ni écriture directe
  dans les tables métier n’est livrée au Client.

## Limites explicites

Photos privées, calibration, calcul cardio, prescription/publication Training,
séances, nutrition, check-ins récurrents, progression et historique Legacy restent
à intégrer. Aucun programme ni statut de publication n’est inféré du bilan.
Aucune donnée réelle Legacy n’est importée. L’offline privé reste différé : les
saisies non enregistrées vivent uniquement dans la page ouverte, pas dans un cache
persistant du navigateur. Les changements après transmission seront traités dans
un parcours versionné ultérieur; il n’y a pas de réouverture implicite.

## Accès de recette

L’URL utilisateur est toujours l’origine canonique
`https://father-empowering-m1-staging.vercel.app`. L’URL technique immuable sert à
identifier le déploiement, pas à connecter Max : les mutations y sont refusées
par le contrôle d’origine existant. Les tests de livraison doivent vérifier la
destination actuelle de l’alias et fournir l’Access Pack Coach **et** Client.

## Validation

Le gate complet M1 reste requis. S’y ajoutent les tests de validation, pgTAP/RLS,
intégration HTTP et parcours navigateur du bilan Client→Coach. Agent 4 rend son
verdict sur le SHA exact; un build réussi seul ne signifie pas « livré ».
La preuve Preview est distincte des fixtures CI locales. Elle doit nommer les
comptes de test et ne pas être présentée comme une soumission personnelle de Max.
