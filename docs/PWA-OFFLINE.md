# PWA et fonctionnement hors ligne

## Garantie actuelle

Après une première ouverture complète avec Internet, chaque portail client peut être rouvert sans réseau. Le cache est isolé par URL de portail et renouvelé à chaque génération.

Le service worker conserve :

- l’interface et le manifeste;
- `client-info.json` lorsqu’il est publié;
- les programmes Training et Nutrition;
- les logos, icônes PWA et icônes de mensurations;
- les bibliothèques de graphiques et les polices après leur premier chargement contrôlé.

Les résultats d’entraînement, brouillons, check-ins, mesures et réglages d’interface restent dans le stockage local du portail. Les photos restent dans IndexedDB. Un check-in qui ne peut pas être envoyé est placé dans une file locale puis réessayé au retour du réseau.

## Règles importantes

- Une première ouverture en ligne est obligatoire pour installer le service worker et remplir le cache.
- Le portail doit être publié en HTTPS. Le service worker ne fonctionne pas avec une ouverture directe en `file://`.
- Les fichiers programme utilisent le réseau en priorité, puis la dernière copie mise en cache hors ligne.
- Une nouvelle génération crée une nouvelle version de cache sans effacer les données personnelles du client.
- Les caches d’un client ne doivent jamais être partagés avec le chemin d’un autre client.

## Validation automatisée

```bash
node tests/run-pwa-offline-tests.js
```

Ce test vérifie le manifeste, les dimensions des icônes, l’installation et l’activation du service worker, l’isolation des caches, les programmes avec paramètres de mise à jour, la navigation hors ligne, les médias, les dépendances externes approuvées, la sauvegarde locale et la file d’envoi des check-ins.

Avant publication d’un client, exécuter également toute la suite de tests indiquée dans le `README.md`.
