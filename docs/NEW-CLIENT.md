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
9. rend immédiatement la carte du client disponible sur la page mère `/clients/`.

Le registre `clients/registry.json` ne contient que les informations publiques nécessaires à l’administration technique des portails.

## Étape suivante

`CLIENT PORTAL READY` signifie que le portail local est valide. L’URL publique ne devient utilisable qu’après la publication GitHub du dossier client.

## Règle de communication du lien

Le lien public du portail est envoyé uniquement dans le premier courriel, afin que le client puisse ouvrir le portail et l’installer sur son écran d’accueil.

Après l’installation, les courriels annonçant un programme ou une mise à jour ne contiennent plus de lien. Le client doit toujours ouvrir son portail à partir de l’icône installée sur son écran d’accueil. Cette règle réduit le risque qu’il ouvre le portail dans un autre navigateur ou un autre contexte de stockage local.

## Courriel officiel — protocole prêt

### Français

```text
Objet : Ton Legacy Protocol est prêt

Salut {{Prénom}},

J’ai terminé l’analyse de tes données et ton Legacy Protocol est maintenant prêt.

Ton entraînement, ton plan nutritionnel lorsqu’il est inclus, et tes objectifs de départ t’attendent dans ton portail.

Ouvre ton portail à partir de l’icône installée sur ton écran d’accueil, puis accepte la mise à jour proposée.

À partir d’aujourd’hui, tu commences officiellement la Semaine 1.

Je te demande une seule chose : suis le plan tel qu’il est présenté.

Ne cherche pas à en faire plus.
Ne saute pas d’étapes.
Fais confiance au processus.

Chaque semaine, j’évaluerai ta progression et j’ajusterai ton protocole au besoin afin qu’il continue d’évoluer avec toi.

Le travail commence maintenant.

– Max Bourdon

Si tu ne vois pas la mise à jour, ferme complètement l’application, puis rouvre-la à partir de l’icône sur ton écran d’accueil.
```

### English

```text
Subject: Your Legacy Protocol is Ready

Hey {{FirstName}},

I’ve finished reviewing your data, and your Legacy Protocol is now ready.

Your training program, nutrition plan when included, and starting objectives are waiting for you inside your portal.

Open your portal from the icon installed on your home screen, then accept the proposed update.

As of today, you officially begin Week 1.

I have one request: follow the plan exactly as it’s written.

Don’t try to do more.
Don’t skip steps.
Trust the process.

Each week, I’ll review your progress and adjust your protocol as needed so it continues to evolve with you.

The work begins now.

– Max Bourdon

If you don’t see the update, fully close the app, then reopen it from the icon on your home screen.
```
