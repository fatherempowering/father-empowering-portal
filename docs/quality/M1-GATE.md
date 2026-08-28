# Gate qualité M1

**Propriétaire :** Agent 4 — Qualité, migration et release
**Autorité :** FE-AC-V1.1, scope M0/M1 seulement
**Règle de décision :** un échec RLS, sécurité ou E2E bloque M1.

## Résultat permis

Le gate produit exactement l'un des états suivants :

- `PASS` : tous les contrôles obligatoires ont réellement été exécutés sur le
  commit intégré et sont réussis;
- `FAIL` : au moins un contrôle obligatoire a été exécuté et a échoué;
- `BLOCKED` : un contrôle obligatoire n'a pas pu être exécuté, notamment faute
  de Docker, du Supabase local, du navigateur Playwright, d'un adaptateur
  intégré ou d'une configuration locale valide.

Un test ignoré, filtré, marqué `todo`, ou remplacé par un mock ne constitue pas
une réussite RLS ou E2E. Le gate ne transforme jamais `BLOCKED` en `PASS`.

## Parcours vertical de sortie

Le parcours de référence est le suivant :

1. Max ouvre une session Coach et atteint le niveau `aal2` avec TOTP.
2. Max crée une fiche Client.
3. La fiche et l'assignation principale Max ↔ Client sont créées dans une même
   transaction.
4. Une invitation opaque est produite; seul son condensat est persisté et
   aucune réponse applicative ne révèle le jeton brut. Le lien transporte le
   jeton dans le fragment `#token=...`, jamais dans la query string, afin qu'il
   ne soit pas envoyé dans les requêtes HTTP ou les journaux du serveur.
5. Le Client ouvre l'invitation et demande un OTP envoyé à l'adresse détenue
   par l'invitation.
6. Le Client valide l'OTP.
7. L'acceptation lie l'identité Auth, active le Client, crée ou active son
   membership `CLIENT`, accepte l'invitation et écrit l'audit atomiquement.
8. Le tableau Coach affiche le Client comme actif et toujours assigné à Max.
9. Le tableau Client n'affiche que sa propre fiche.
10. Dans une nouvelle session, le Client redemande un OTP sans mot de passe et
    retrouve uniquement son propre portail.

## Matrice obligatoire

| ID | Contrôle | Type | Bloquant |
|---|---|---|---:|
| M1-U01 | Contrats, validation et transitions M1 | Unitaire | Oui |
| M1-U02 | Coach/Admin refusé sans `aal2` | Unitaire + intégration | Oui |
| M1-U03 | Création idempotente pour une clé et un payload identiques | Unitaire + DB | Oui |
| M1-U04 | Réutilisation de clé avec payload différent refusée | Unitaire + DB | Oui |
| M1-D01 | Création Client + assignation + invitation + audit atomique | DB | Oui |
| M1-D02 | Activation invitation + identité + membership + audit atomique | DB | Oui |
| M1-S01 | Client A ne peut pas lire ou modifier Client B | RLS | Oui |
| M1-S02 | Client ne peut lire que sa fiche active | RLS | Oui |
| M1-S03 | Coach assigné peut lire son Client | RLS | Oui |
| M1-S04 | Coach non assigné ne peut pas lire le Client | RLS | Oui |
| M1-S05 | Admin de l'organisation a l'accès M1 prévu | RLS | Oui |
| M1-S06 | Un rôle d'une autre organisation est isolé | RLS | Oui |
| M1-S07 | Les mutations Coach exigent `aal2` | HTTP/serveur | Oui |
| M1-S08 | Le jeton d'invitation brut est absent des tables, audits et réponses | DB + HTTP | Oui |
| M1-S09 | Les écritures navigateur directes dans les tables métier sont refusées | RLS | Oui |
| M1-S10 | Le lien d'invitation place le jeton dans le fragment, jamais la query string | Unitaire + E2E | Oui |
| M1-S11 | Le navigateur ne peut lire ni le condensat ni l'état privé du throttling | Privilèges DB | Oui |
| M1-S12 | L'activation limite à 5 demandes et 10 vérifications OTP par 15 minutes | DB | Oui |
| M1-S13 | La rotation IP/UA ne réinitialise pas la limite globale invitation/email | DB | Oui |
| M1-A01 | Création, invitation et activation produisent les audits M1 | DB | Oui |
| M1-I01 | Max → création → invitation → OTP → activation → Client actif | E2E | Oui |
| M1-I02 | Le Client activé accède à `/client`, pas à `/coach` | E2E | Oui |
| M1-I03 | Un Client différent ne peut pas obtenir la fiche activée | E2E/RLS | Oui |
| M1-I04 | Un Client actif peut se reconnecter par OTP sans créer de compte | E2E | Oui |
| M1-L01 | Aucun fichier du portail legacy n'a changé depuis le commit de base | Diff | Oui |

## Harness local et CI

Le harness utilise exclusivement :

- un projet Supabase local jetable;
- des identités de test créées pour l'exécution;
- l'interface locale de capture d'emails fournie par Supabase;
- une application Next.js locale;
- Chromium installé par Playwright;
- des secrets locaux éphémères retournés par le Supabase local.

Il ne doit jamais utiliser :

- une clé Supabase de staging ou de production;
- un compte réel;
- une adresse email réelle;
- Resend réel;
- un jeton d'invitation de production;
- des données du portail legacy.

Les données de test sont déterministes et utilisent le domaine réservé
`example.test`.

## Commande canonique

Depuis la racine du dépôt intégré :

```bash
bash scripts/m1-quality-gate.sh
```

Prérequis locaux : Node 22, pnpm, Docker en fonctionnement et dépendances
installées avec le lockfile pnpm. Le script démarre le Supabase local, applique
migrations et seed de test, exécute les contrôles, puis arrête les processus
qu'il a démarrés.

Le workflow `.github/workflows/m1-ci.yml` exécute le même gate. Une étape CI
isolée n'a pas le droit de contourner le script canonique.

## Preuves exigées

Chaque exécution conserve dans `artifacts/m1-gate/` :

- `summary.txt` avec commit, date UTC et état final;
- `unit.log`;
- `rls.log` (tests pgTAP sous `apps/portal/supabase/tests/quality`);
- `integration.log`;
- `e2e.log`;
- `artifact-safety.log`, produit par le scan anti-secret avant publication;
- les informations de version de Node, Supabase CLI et Playwright;
- aucune clé, aucun OTP et aucun jeton d'invitation.

Les traces, captures, vidéos et rapports HTML Playwright sont désactivés pour ce
parcours, car ils peuvent sérialiser le fragment d'invitation ou un OTP. Les
journaux textuels CI sont conservés même après échec et ne sont jamais commités.

## Conditions de blocage immédiat

Agent 4 bloque M1 si l'une des situations suivantes est observée :

- les tests RLS n'ont pas réellement démarré PostgreSQL local;
- une politique RLS est absente ou trop permissive;
- un Coach non assigné voit un Client;
- un Client voit un autre Client;
- un Coach/Admin `aal1` peut muter les données M1;
- un jeton d'invitation brut est persisté, audité ou renvoyé;
- le condensat d'invitation ou l'état privé de throttling est lisible par une
  session navigateur;
- les limites d'activation OTP ne renvoient pas `FE_RATE_LIMITED` au
  dépassement;
- création ou activation laissent un état partiel après erreur injectée;
- la même mutation produit plusieurs Clients ou invitations;
- le parcours E2E n'a pas été exécuté dans un vrai navigateur;
- un test obligatoire est ignoré;
- le portail legacy est modifié;
- le gate utilise des secrets ou des données réels.

## Limite du présent gate

Ce gate couvre M0/M1 uniquement. Il ne valide ni Week Zero, ni Exercise
Library, ni Program Builder, ni publication, ni migration legacy, ni production.

Le worker lancé par ce gate est volontairement limité à l'environnement local.
Avant tout essai en staging, un déclencheur privé et authentifié de l'outbox doit
être configuré dans l'environnement cible et repasser ce même parcours. Aucun
cron staging/production ni déploiement n'est autorisé par le présent milestone.
