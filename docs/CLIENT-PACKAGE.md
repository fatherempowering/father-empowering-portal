# Paquet client officiel

Chaque client Father Empowering est représenté par un dossier source indépendant. Ce dossier contient trois fichiers canoniques.

```text
clients/<client-slug>/
├── client-info.json
├── training-program.json
└── nutrition-program.json
```

Les fichiers portant le suffixe `.example.json` sont des modèles. Ils ne doivent jamais être publiés comme dossier client réel.

## `client-info.json`

Source officielle de l’identité permanente et de la configuration publique du client.

Ce fichier contient :

- l’identifiant permanent `client.id`;
- le slug public `client.slug`;
- le nom affiché, la langue et le fuseau horaire;
- l’état de coaching et d’onboarding;
- les métadonnées visuelles du portail;
- les fonctionnalités activées;
- les mesures configurables;
- les références publiques d’intégration;
- le namespace de stockage;
- la déclaration de migration.

Ce fichier ne contient pas :

- les semaines ou séances;
- les exercices et prescriptions;
- les repas, calories ou macros;
- les résultats enregistrés dans le navigateur;
- les secrets serveur.

Le schéma canonique est `fe-client-info-v2`.

## `training-program.json`

Source officielle du programme d’entraînement publié au client.

Ce fichier contient :

- `schemaVersion`;
- une `programVersion` unique à chaque publication;
- la date `updatedAt`;
- une identité de phase permanente `training.phase` (`id`, `label`, `order`);
- le catalogue des séances;
- les semaines, séances, blocs, exercices et prescriptions;
- les métadonnées de mise à jour.

Le programme peut avoir `weeks: []` pendant l’onboarding. Cela signifie « programmation en attente » et non « programme actif vide ».

Le schéma canonique actuel est `1`.

Une correction à l’intérieur d’une phase change seulement `programVersion`. Une véritable nouvelle phase change également `training.phase.id`. Ce changement déclenche, après confirmation du client, l’archive de la phase active et le redémarrage à la semaine 1. Un identifiant de phase archivé ne doit jamais être réutilisé.

## `nutrition-program.json`

Source officielle du programme nutritionnel publié au client.

Ce fichier contient :

- `schemaVersion`;
- une `programVersion` unique à chaque publication;
- la date `updatedAt`;
- les plans, sections, cibles, règles et repas;
- les métadonnées de mise à jour.

Si la Nutrition est désactivée dans `client-info.json`, ce fichier peut être absent. Si elle est activée, il est obligatoire.

Le schéma canonique actuel est `1`.

## Identité et stockage

- `client.id` ne change jamais.
- `client.slug` devient permanent dès le premier déploiement.
- `storage.namespace` devient permanent dès que le navigateur enregistre des données.
- Un changement de slug ou de namespace après lancement exige une migration déclarée.
- Deux clients ne doivent jamais partager le même ID, slug ou namespace.

## Versions

`programVersion` identifie le contenu publié, pas le client. Toute modification Training ou Nutrition destinée au client doit recevoir une nouvelle version.

Les résultats, check-ins et photos ne sont pas stockés dans ces fichiers. Ils restent dans le stockage du navigateur sous le namespace permanent du client.

Lors d’un changement de phase confirmé, le portail conserve aussi une copie immuable du programme Training précédent dans l’archive de phase. L’historique peut donc relier les résultats aux prescriptions qui étaient réellement actives.

## Validation

Pour valider un modèle réutilisable :

```bash
node scripts/validate-client-package.js templates/client-package
```

Pour valider un vrai dossier client avant génération ou publication :

```bash
node scripts/validate-client-package.js clients/<client-slug> --strict
```

Le mode `--strict` refuse les fichiers `.example.json`.
