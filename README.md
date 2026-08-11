# Father Empowering Portal

Portail maître utilisé pour générer et maintenir les portails clients Father Empowering.

## Structure actuelle

- `index.html` : moteur et interface du portail client.
- `sw.js` : service worker et cache hors ligne isolé par portail.
- `site.webmanifest` : manifeste PWA.
- `version.json` : version officielle de l’application, publiée une seule fois par livraison validée.
- `generate-portal.js` : générateur officiel fondé sur le paquet client à trois fichiers.
- `client-info.example.json` : copie pratique du modèle d’identité client.
- `training-program.json` : programme d’entraînement vierge chargé par le portail maître.
- `nutrition-program.json` : programme nutritionnel vierge chargé par le portail maître.
- `program.example.json` : ancien format combiné conservé temporairement comme référence; il n’est plus accepté par le générateur.
- `templates/client-package/` : modèle du futur paquet client à trois fichiers.
- `clients/registry.json` : registre public des identités et chemins clients.
- `clients/index.html` : page mère et cartes clients générées depuis le registre.
- `scripts/` : outils de validation des paquets clients.
- `tests/` : tests automatisés des outils de validation.
- `measure-icons/` : icônes des mesures corporelles.
- `docs/` : documentation opérationnelle et notes de version.

## Validation

Valider le modèle client :

```bash
node scripts/validate-client-package.js templates/client-package
```

Valider la racine vierge :

```bash
node scripts/validate-client-package.js .
```

Valider un vrai client :

```bash
node scripts/validate-client-package.js clients/<client-slug> --strict
```

Générer ou mettre à jour son portail dans le même dossier :

```bash
node generate-portal.js clients/<client-slug>
```

Créer un nouveau client et son portail initial :

```bash
node scripts/create-client.js --name "Jean Tremblay" --short-name "Jean" --language fr-ca
```

Générer une prévisualisation dans un autre dossier :

```bash
node generate-portal.js clients/<client-slug> /tmp/client-preview
```

Exécuter les tests :

```bash
node tests/run-validation-tests.js
node tests/run-phase-engine-tests.js
node tests/run-generator-tests.js
node tests/run-create-client-tests.js
node tests/run-training-model-tests.js
node tests/run-set-results-tests.js
node tests/run-today-navigation-tests.js
node tests/run-pwa-offline-tests.js
node tests/run-portal-version-tests.js
node tests/run-client-hub-tests.js
node tests/run-i18n-tests.js
```

Le sélecteur français/anglais se trouve dans Paramètres. Les textes du portail et les descriptions du programme sont bilingues; les noms d’exercices restent volontairement en anglais. Le choix de langue est conservé localement pour chaque client et fonctionne hors ligne.

## Règles importantes

- `client.id` est permanent.
- Le slug et le namespace de stockage doivent être uniques.
- Une modification de slug après déploiement exige une migration.
- Les clés d’exercice doivent rester stables pour préserver l’historique.
- Chaque programme Training doit avoir un `training.phase.id` permanent et unique.
- Une nouvelle phase est archivée et activée uniquement après confirmation du client.
- Les secrets serveur ne doivent jamais être ajoutés aux fichiers clients.
- `client-info.json`, `training-program.json` et `nutrition-program.json` sont les trois sources officielles d’un client.
- Les fichiers `.example.json` sont uniquement des modèles et ne doivent pas être publiés comme client réel.
- Le générateur valide les trois fichiers avant et après génération.
- `client-info.json` est compilé dans la configuration du portail; il demeure aussi présent dans le dossier publié comme source publique vérifiable.

## Documentation

- [Mises à jour modulaires](docs/MODULAR-UPDATES.md)
- [Paquet client officiel](docs/CLIENT-PACKAGE.md)
- [Procédure du paquet client](templates/client-package/onboarding-notes.example.md)
- [Création simplifiée d’un client](docs/NEW-CLIENT.md)
- [Modèle Training officiel](docs/TRAINING-MODEL.md)
- [Formulaire Training pour Coach Max](docs/TRAINING-INTAKE-TEMPLATE.md)
- [PWA et fonctionnement hors ligne](docs/PWA-OFFLINE.md)
- [Page mère et cartes clients](docs/CLIENT-HUB.md)
- [Notes de version](docs/releases/)
