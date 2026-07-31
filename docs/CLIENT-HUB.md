# Page mère et cartes clients

La page mère se trouve dans `clients/index.html`. Une fois le dépôt publié, son chemin est `/clients/`.

Elle affiche uniquement les données publiques nécessaires à la gestion des portails :

- nom affiché et slug permanent;
- statut de coaching;
- phase et version Training;
- nombre de semaines;
- état de la Nutrition;
- dates de début et de dernière mise à jour;
- lien permanent vers le portail client.

Elle n’affiche jamais de courriel, photo, mensuration, résultat d’entraînement, check-in ou note privée. La directive `noindex` limite l’indexation par les moteurs de recherche, mais ne constitue pas une authentification. Le registre et la page demeurent publics lorsqu’ils sont publiés dans un dépôt public.

## Source de vérité

`clients/registry.json` est la liste canonique des clients. Les cartes sont générées dans le navigateur à partir de ce fichier; aucun client n’est inscrit directement dans le HTML.

La création officielle d’un client ajoute automatiquement son résumé au registre. Lorsqu’un portail client existant est régénéré dans son dossier permanent, le générateur synchronise également sa phase, sa version, son statut et son nombre de semaines.

Une synchronisation manuelle complète peut être exécutée avec :

```bash
node scripts/sync-client-registry.js
```

Pour valider sans écrire :

```bash
node scripts/sync-client-registry.js --dry-run
```

## Gestion de plusieurs clients

La page offre une recherche par nom, slug, phase ou version, un filtre par statut et un tri par nom, date de mise à jour ou statut. Les liens utilisent des chemins relatifs afin de fonctionner autant sur un domaine personnalisé que sur un site GitHub Pages placé sous un sous-dossier.

