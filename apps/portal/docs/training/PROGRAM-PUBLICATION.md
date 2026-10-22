# Training — publication et consultation Client

Lot autorisé après PASS du constructeur privé (PR #28, `aa076e3`).
La publication est immédiate après confirmation explicite du Coach. Ce lot ne
comprend ni exécution guidée, ni saisie de résultats, ni notifications/email,
ni migration de programme Legacy, ni déploiement.

## Interfaces

- `GET /api/v1/coach/programs/recipients?page=0` : vingt Clients actifs éligibles,
  nom et identifiant seulement; aucun email dans le sélecteur.
- `GET /api/v1/coach/clients/:id/program` : dernière publication lisible par ce Coach.
- `POST /api/v1/coach/programs/publish` : identifiants du Client et du brouillon,
  version du brouillon, identifiant attendu de la publication précédente (ou
  `null` pour une première publication), clé d’idempotence.
- `GET /api/v1/client/program` : dernière publication de l’identité Client résolue
  côté serveur. Aucun identifiant Client fourni par le navigateur n’est utilisé.
- UI : publication dans `/coach/programs`; lecture dans `/client/program`,
  liens dans la navigation Client et accès réel depuis l’accueil.

## Invariants

Le serveur publie uniquement le document sauvegardé dans la base, jamais une
copie envoyée par le navigateur. Chaque semaine doit contenir une séance;
les séances sont nommées, les entraînements contiennent des exercices et les
supersets/finishers ont le nombre de mouvements et de séries attendu. La même
validation existe au niveau PostgreSQL pour les appels RPC directs.

La publication exige le Coach vérifié déjà prévu, propriétaire du brouillon
(ou Admin de l’organisation), un Client actif et une assignation active.
Les politiques existantes Auth/Client/Coach ne sont pas modifiées. Les nouvelles
tables ont leurs propres politiques restrictives. Un Coach non assigné, un
Client, un Coach non vérifié ou un autre tenant ne peuvent publier ce plan.

Chaque publication est une ligne immuable, avec numéro de révision par Client.
La dernière révision est le plan courant; les précédentes restent conservées.
Le verrou par Client et l’identifiant de publication attendu empêchent deux
publications concurrentes d’écraser silencieusement le même état. Une nouvelle
clé ne permet pas de republier deux fois la même version du brouillon.
Les reçus rendent la répétition d’une commande sans effet secondaire supplémentaire.
L’audit est transactionnel et ne contient aucun contenu de prescription.

L’accès Client utilise `has_own_client_access` et conserve donc aussi le portail
personnel Coach/Admin avec sa vraie assurance. Un Client suspendu perd l’accès.
Une assignation en pause bloque les publications Coach, mais ne retire pas au
Client actif l’accès à ses versions déjà reçues.

Les lectures sont sans cache. Le retour sur un onglet visible recharge l’état
depuis le serveur; le bouton d’actualisation reste disponible. Aucun Realtime,
stockage privé navigateur ou support offline n’est introduit. Une erreur réseau
n’est jamais présentée comme une absence de programme.

## Tests

Contrats/HTTP/dépôts, SQL/RLS (rôles, isolation, immutabilité, rejeu, version,
suspension), intégration HTTP Coach→Client, parcours E2E avec invitation et OTP
local réels puis publication, relecture, fermeture/réouverture sans OTP et logout.
Les tests UI couvrent desktop/mobile, confirmation, saisies non sauvegardées,
plans incomplets, conflit et perte de réponse. Le gate M1 complet reste requis.

La copie visuelle transmise au Cavalier 5 reste figée sur son SHA antérieur.
Ce lot n’est pas une validation artistique et ne remplace pas son travail externe.
