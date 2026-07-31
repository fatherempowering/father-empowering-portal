# Procédure simplifiée — Nouveau client

## Ce que Coach Max fournit

```text
Nouveau client

Nom complet :
Prénom affiché :
Langue : français ou anglais
Fuseau horaire : America/Montreal
Date de début : AAAA-MM-JJ
Slogan : optionnel
Tally : formulaire standard ou URL particulière
Nutrition : activée ou désactivée
```

L’adresse courriel administrative peut être communiquée séparément à Coach Max, mais elle n’est jamais enregistrée dans le dépôt public ni dans le portail.

## Ce que Codex exécute

Exemple technique :

```bash
node scripts/create-client.js \
  --name "Jean Tremblay" \
  --short-name "Jean" \
  --language fr-ca \
  --timezone America/Montreal \
  --start-date 2026-08-10 \
  --slogan "BÂTIR UN PÈRE PLUS FORT"
```

Le lien Tally standard est utilisé automatiquement. Une URL particulière peut être fournie avec `--tally-url`.

## Garanties

La commande :

1. génère un ID permanent et un slug sûr;
2. bloque les IDs, slugs et namespaces déjà utilisés;
3. prépare les trois fichiers clients officiels;
4. génère le portail et copie tous les médias;
5. exécute la validation stricte;
6. inscrit le client au registre seulement après réussite;
7. supprime automatiquement toute création temporaire en cas d’échec;
8. affiche `CLIENT PORTAL READY` et le chemin permanent.

Le registre `clients/registry.json` ne contient que les informations publiques nécessaires à l’administration technique des portails.

## Étape suivante

`CLIENT PORTAL READY` signifie que le portail local est valide. L’URL publique ne devient utilisable qu’après la publication GitHub du dossier client.
