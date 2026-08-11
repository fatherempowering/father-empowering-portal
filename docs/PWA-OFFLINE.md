# PWA et fonctionnement hors ligne

## Garantie actuelle

Après une première ouverture complète avec Internet, chaque portail client peut être rouvert sans réseau. Le cache est isolé par URL de portail et renouvelé à chaque génération.

Le service worker conserve :

- l’interface, le moteur bilingue `i18n.js` et le manifeste;
- la version officielle `version.json`, vérifiée sans cache lorsque le portail est en ligne;
- `client-info.json` lorsqu’il est publié;
- les programmes Training et Nutrition;
- les logos, icônes PWA et icônes de mensurations;
- les bibliothèques de graphiques et les polices après leur premier chargement contrôlé.

Les résultats d’entraînement, brouillons, check-ins, mesures et réglages d’interface restent dans le stockage local du portail. Les photos restent dans IndexedDB. Un check-in qui ne peut pas être envoyé est placé dans une file locale puis réessayé au retour du réseau.

## Règles importantes

- Une première ouverture en ligne est obligatoire pour installer le service worker et remplir le cache.
- Le portail doit être publié en HTTPS. Le service worker ne fonctionne pas avec une ouverture directe en `file://`.
- Les fichiers programme utilisent le réseau en priorité, puis la dernière copie mise en cache hors ligne.
- La navigation en ligne et la vérification de version contournent le cache HTTP de dix minutes de GitHub Pages.
- Le service worker vérifie sa propre mise à jour à chaque ouverture en ligne sans effacer le stockage local.
- Une nouvelle génération crée une nouvelle version de cache sans effacer les données personnelles du client.
- Les caches d’un client ne doivent jamais être partagés avec le chemin d’un autre client.
- Le choix français/anglais est sauvegardé dans une clé locale propre au client et reste disponible sans réseau.

## Validation automatisée

```bash
node tests/run-pwa-offline-tests.js
node tests/run-portal-version-tests.js
```

Ces tests vérifient le manifeste, les dimensions des icônes, l’installation et l’activation du service worker, l’isolation des caches, les programmes avec paramètres de mise à jour, la version visible, la navigation en ligne sans cache, la navigation hors ligne, les médias, les dépendances externes approuvées, la sauvegarde locale et la file d’envoi des check-ins.

## Règle de version

- Les essais locaux ne changent pas la version.
- Plusieurs modifications validées ensemble forment une seule livraison.
- `version.json` est modifié une seule fois juste avant la publication de cette livraison.
- Le numéro affiché dans « À propos » représente la version réellement chargée par le portail.
- La version de l’application demeure distincte des versions Training, Nutrition et des phases du client.

Avant publication d’un client, exécuter également toute la suite de tests indiquée dans le `README.md`.
