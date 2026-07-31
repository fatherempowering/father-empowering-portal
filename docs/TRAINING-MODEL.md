# Modèle Training officiel

Ce document est le contrat de données officiel entre Coach Max, l’outil de validation et le portail Father Empowering.

## Principe

`training-program.json` contient uniquement la prescription du coach. Les résultats saisis par le client restent dans le stockage privé de son navigateur et ne doivent jamais être copiés dans le programme.

Le modèle canonique utilise les noms `sessions`, `blocks` et `exercises`. Les anciens noms `seances`, `blocs` et `exs` restent lisibles par le portail pour les migrations, mais ne doivent plus être utilisés dans un nouveau programme.

## Capacités officielles

Le format représente :

- une phase et une version de programme permanentes;
- un nombre de semaines dérivé automatiquement de `training.weeks.length`;
- des séances obligatoires, optionnelles ou complémentaires;
- des journées d’entraînement, de repos actif et de repos complet;
- un protocole de posing flexible, sans journée imposée;
- une cible de RIR globale par semaine et une surcharge par exercice;
- la prescription des séries, répétitions, tempo, repos et charge cible;
- les substitutions autorisées;
- une progression proposée par le coach et soumise à confirmation;
- une liste explicite des champs de résultats attendus par série.

## Identifiants permanents

- `training.phase.id` ne change que lors d’une nouvelle phase.
- `sessionCatalog[].id` identifie une séance dans toute la phase.
- `exercises[].key` identifie un exercice dans l’historique.
- Un identifiant déjà publié ne doit pas être renommé. Une substitution durable reçoit un nouvel identifiant.

## Types de séances

- `training` : entraînement avec exercices;
- `active-recovery` : récupération active prescrite;
- `complete-rest` : repos complet;
- `posing` : protocole de posing;
- `mobility` : mobilité complémentaire.

`required` indique si la séance compte dans l’exécution obligatoire. `schedule.mode` accepte `fixed`, `suggested` ou `flexible`. Un protocole sans jour imposé utilise `flexible` et omet `suggestedDay`.

## Prescription d’un exercice

Chaque exercice contient une clé stable et un objet `prescription` :

```json
{
  "key": "incline_press_machine",
  "name": "Incline Press Machine",
  "prescription": {
    "sets": 3,
    "reps": "8-10",
    "targetRir": 3,
    "restSeconds": 120,
    "tempo": "3-1-1-0",
    "loadTarget": "Calibration load",
    "unit": "lb",
    "progression": {
      "type": "double-progression",
      "rule": "Propose +5 lb after every set reaches 10 reps at target RIR.",
      "confirmationRequired": true
    }
  },
  "substitutions": ["incline_dumbbell_press"]
}
```

La cible `week.targetRir` s’applique par défaut. `prescription.targetRir` la remplace seulement pour cet exercice.

## Résultats

`training.resultTracking.perSetFields` décrit les données que le portail doit recueillir pour chaque série : charge, répétitions, RIR, douleur et notes.

Les unités officielles sont `lb`, `min`, `sec`, `distance` et `level`. Les kilogrammes, réglages de machines et notes de calibration ne font pas partie du modèle Training final.

Les résultats n’apparaissent jamais dans `training-program.json`; ils sont rattachés à la combinaison phase, semaine, séance, exercice et numéro de série.

## Progression

La progression officielle est `coach-confirmed`. Le programme peut proposer une augmentation, mais le portail ne doit jamais modifier automatiquement la prescription. Une correction conserve le même `phase.id`; une nouvelle phase reçoit un nouvel ID et passe par la confirmation du client.

## Exemple complet

Le fichier [`examples/training-program.two-week.example.json`](examples/training-program.two-week.example.json) couvre deux semaines, quatre séances obligatoires, une séance optionnelle, du repos actif, du repos complet et un protocole de posing flexible.

## Validation

```bash
node scripts/validate-training-program.js docs/examples/training-program.two-week.example.json
```

Une validation réussie affiche `TRAINING MODEL READY`.
