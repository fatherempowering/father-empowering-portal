# Father Empowering Portal

Portail maître utilisé pour générer et maintenir les portails clients Father Empowering.

## Structure actuelle

- `index.html` : moteur et interface du portail client.
- `sw.js` : service worker et cache hors ligne isolé par portail.
- `site.webmanifest` : manifeste PWA.
- `generate-portal.js` : générateur historique de portail client.
- `client-info.example.json` : copie pratique du modèle d’identité client.
- `training-program.json` : programme d’entraînement vierge chargé par le portail maître.
- `nutrition-program.json` : programme nutritionnel vierge chargé par le portail maître.
- `program.example.json` : ancien format combiné encore utilisé par le générateur.
- `templates/client-package/` : modèle du futur paquet client à trois fichiers.
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

Exécuter les tests :

```bash
node tests/run-validation-tests.js
```

## Règles importantes

- `client.id` est permanent.
- Le slug et le namespace de stockage doivent être uniques.
- Une modification de slug après déploiement exige une migration.
- Les clés d’exercice doivent rester stables pour préserver l’historique.
- Les secrets serveur ne doivent jamais être ajoutés aux fichiers clients.
- `client-info.json`, `training-program.json` et `nutrition-program.json` sont les trois sources officielles d’un client.
- Les fichiers `.example.json` sont uniquement des modèles et ne doivent pas être publiés comme client réel.
- Le générateur historique n’utilise pas encore directement `client-info.json`; son raccordement constitue l’étape suivante.

## Documentation

- [Mises à jour modulaires](docs/MODULAR-UPDATES.md)
- [Paquet client officiel](docs/CLIENT-PACKAGE.md)
- [Procédure du paquet client](templates/client-package/onboarding-notes.example.md)
- [Notes de version](docs/releases/)
