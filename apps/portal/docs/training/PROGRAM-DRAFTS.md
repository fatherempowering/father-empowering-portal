# Training — constructeur de brouillons

Lot suivant la bibliothèque d’exercices (PR #27). Aucune publication, attribution,
notification ou saisie de résultats n’est incluse dans ce lot.

## Contrat d’édition

`training-drafts.ts` accepte une semaine vide, une séance sans exercice et un
superset inachevé. La sauvegarde d’un travail en cours ne signifie jamais qu’il
est prêt pour un Client. Le contrat complet de `training.ts` reste distinct.

- Programme → semaines consécutives → séances → blocs → exercices → prescription.
- La duplication clone la semaine, sans partager d’objets modifiables, mais conserve
  les identifiants des mouvements pour leur continuité d’une semaine à l’autre.
- Les séries particulières ne sont conservées que si elles diffèrent réellement.
- Les références proviennent de la bibliothèque de la même organisation.
- Les médias restent explicitement `null` : aucun lien public ou stockage simulé.

## Autorisation et persistance

La migration additive `202610140001_training_program_drafts.sql` crée une table
privée de brouillons et des reçus d’idempotence internes. Elle ne remplace aucune
politique d’accès existante. Un Coach vérifié lit/modifie ses propres brouillons;
un Admin vérifié ceux de son organisation. Un Client n’a aucun accès.

Les mutations passent par un RPC transactionnel avec validation SQL indépendante,
version attendue, clé d’idempotence et événement d’audit sans contenu du programme.
Les écritures directes sont interdites. Les sessions OTP seules, de récupération,
non vérifiées ou suspendues n’autorisent pas cette opération.

HTTP : `GET/POST /api/v1/coach/programs`, `GET /api/v1/coach/programs/:id`.
UI : `/coach/programs`, accessible par la navigation Coach.
Les lectures sont sans cache; les mutations exigent l’origine canonique.

Une réponse perdue conserve la commande et sa clé pour réessayer sans doublon.
Un conflit ne réécrit jamais silencieusement le programme. Les saisies sont
conservées et l’utilisateur doit rouvrir la version enregistrée.

## Validation

Tests unitaires des contrats, transformations, routes et dépôts; tests SQL/RLS
réels; intégration HTTP; parcours E2E authentifié avec email local; interface
desktop/mobile, conflits et réponse perdue. Le gate M1 reste bloquant.

La publication sera un lot séparé : validation de complétude, sélection explicite
du Client assigné, snapshot publié immuable, visibilité Client limitée à ses
publications. Aucune modification de brouillon ne doit changer un plan publié.
Pas de merge, de déploiement ou de modification Legacy dans ce lot.
