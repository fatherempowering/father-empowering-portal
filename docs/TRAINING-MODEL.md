# Modèle Training officiel

Ce document est le contrat de données officiel entre Coach Max, l’outil de validation et le portail Father Empowering.

## Principe

`training-program.json` contient uniquement la prescription du coach. Les résultats saisis par le client restent dans le stockage privé de son navigateur et ne doivent jamais être copiés dans le programme.

Le modèle canonique utilise les noms `sessions`, `blocks` et `exercises`. Les anciens noms `seances`, `blocs` et `exs` restent lisibles par le portail pour les migrations, mais ne doivent plus être utilisés dans un nouveau programme.

## Contenu bilingue

Tout nouveau texte destiné au client utilise un objet avec les deux langues :

```json
{
  "en": "Upper Body",
  "fr": "Haut du corps"
}
```

Ce format s’applique notamment aux titres de phase, séances, semaines et blocs, aux objectifs, consignes courtes, messages de progression et notes de mise à jour. Le portail choisit automatiquement la bonne version, même hors ligne.

Exception volontaire : `exercises[].name` demeure une chaîne anglaise unique. Les noms d’exercices restent donc en anglais dans les deux langues, conformément au standard Father Empowering. Les identifiants techniques, unités, clés de stockage et résultats saisis ne sont jamais traduits.

## Capacités officielles

Le format représente :

- une phase et une version de programme permanentes;
- un nombre de semaines dérivé automatiquement de `training.weeks.length`;
- des séances obligatoires, optionnelles ou complémentaires;
- des journées d’entraînement, de repos actif et de repos complet;
- un protocole de posing flexible, sans journée imposée;
- une cible de RIR globale par semaine et une surcharge par exercice;
- la prescription des séries, répétitions, tempo, repos et charge cible;
- des supersets explicites de deux exercices, exécutés et validés par tour;
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

`schedule.suggestedDay` alimente aussi la navigation quotidienne du portail. Les boutons **Start Today’s Session** et **Training** utilisent le fuseau horaire du client et l’identifiant permanent de la séance pour ouvrir automatiquement la séance, la récupération active ou le repos complet prévu ce jour-là. Dans une semaine partielle, seules les séances réellement présentes dans cette semaine peuvent être sélectionnées.

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

## Superset

Un superset est déclaré au niveau du bloc. Il contient exactement deux exercices ayant le même nombre de séries. `restSeconds` représente le repos pris après avoir exécuté les deux exercices du tour.

```json
{
  "label": { "en": "ARMS SUPERSET", "fr": "SUPERSET BRAS" },
  "mode": "superset",
  "restSeconds": 75,
  "exercises": [
    {
      "key": "barbell_curl",
      "name": "Barbell Curl",
      "prescription": {
        "sets": 3,
        "reps": "10",
        "targetRir": 1,
        "restSeconds": 0,
        "loadTarget": "50 lb",
        "unit": "lb"
      }
    },
    {
      "key": "rope_pushdown",
      "name": "Rope Triceps Pushdown",
      "prescription": {
        "sets": 3,
        "reps": "12",
        "targetRir": 1,
        "restSeconds": 0,
        "loadTarget": "40 lb",
        "unit": "lb"
      }
    }
  ]
}
```

Dans l’entraînement guidé, les deux exercices apparaissent dans le même écran. Le client inscrit les résultats des deux mouvements, valide le tour, puis le minuteur utilise le repos du bloc. Le mode `finisher` suit la même logique avec deux mouvements ou plus.

## Résultats

`training.resultTracking.perSetFields` décrit les données que le portail doit recueillir pour chaque série : charge, répétitions et RIR.

La prescription reste immuable. Les résultats sont préremplis à partir des cibles, puis modifiables indépendamment pour chaque série. La douleur ou une observation générale demeure dans la note de séance existante.

La consigne visible d’un exercice doit rester courte. Utiliser `cue` pour une seule instruction immédiatement utile pendant l’effort; les longs paragraphes ne font pas partie du modèle mobile officiel.

Les unités officielles sont `lb`, `min`, `sec`, `distance` et `level`. Les kilogrammes, réglages de machines et notes de calibration ne font pas partie du modèle Training final.

Les résultats n’apparaissent jamais dans `training-program.json`; ils sont rattachés à la combinaison phase, semaine, séance, exercice et numéro de série.

## Progression

La progression officielle est `coach-confirmed`. Le programme peut proposer une augmentation, mais le portail ne doit jamais modifier automatiquement la prescription. Une correction conserve le même `phase.id`; une nouvelle phase reçoit un nouvel ID et passe par la confirmation du client.

Le graphique **Charges — exercices clés** est optionnel et masqué par défaut. Il apparaît uniquement lorsque `training.progression.keyLiftChartEnabled` vaut `true` et que `training.keyLifts` contient au moins un exercice à suivre. Ce réglage doit être réservé aux phases où l’évolution de la charge constitue réellement un indicateur pertinent; un changement durable d’exercice reçoit une nouvelle clé ou une nouvelle phase afin de préserver l’historique.

## Exemple complet

Le fichier [`examples/training-program.two-week.example.json`](examples/training-program.two-week.example.json) couvre deux semaines, quatre séances obligatoires, une séance optionnelle, du repos actif, du repos complet et un protocole de posing flexible.

## Validation

```bash
node scripts/validate-training-program.js docs/examples/training-program.two-week.example.json
```

Une validation réussie affiche `TRAINING MODEL READY`.
