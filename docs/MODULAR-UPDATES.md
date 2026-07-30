# Permanent client portal updates (v2.8)

The client keeps one permanent URL. The portal is split into:

- `index.html`: application shell and client experience
- `training-program.json`: coach-managed training plan
- `nutrition-program.json`: coach-managed nutrition plan
- browser storage / IndexedDB: client history, Week 0, photos, measurements, check-ins and progress

## Publishing an update

1. Edit `training-program.json` and/or `nutrition-program.json`.
2. Change the relevant `programVersion` to a new unique value.
3. Optionally edit `updateMessage` and `releaseNotes`.
4. Deploy the changed JSON file(s) to the same permanent client URL.
5. When the client opens the portal, it checks for a new version and displays:
   “CoachMax has prepared an update for your protocol.”
6. The client selects **UPDATE NOW**. Only the plans change; client history remains intact.

The visible **UPDATE** button also checks manually at any time.

## Program correction versus new phase

Every `training-program.json` must declare a stable phase identity:

```json
{
  "programVersion": "client-phase-2-v1",
  "training": {
    "phase": {
      "id": "phase-2",
      "label": "PHASE 2",
      "order": 2
    }
  }
}
```

- Change `programVersion` while keeping the same `training.phase.id` for a correction or adjustment inside the current phase. Results stay active.
- Change both `programVersion` and `training.phase.id` to publish a genuinely new phase.
- A new phase is never activated automatically. The client must select **START NEW PHASE**.
- Once confirmed, the current prescriptions, results, check-ins, drafts and progress photos are archived together. Week 0 remains attached to the client.
- The new phase starts at Week 1 under the same permanent client URL and storage namespace.

Never reuse a phase ID that has already been archived. Use sequential permanent IDs such as `phase-1`, `phase-2` and `phase-3`.

Before a transition, the portal writes a non-destructive recovery record under the client-namespaced `phase_transition_backup_v1` localStorage key. If the update fails, the previous active phase is restored.

## Permanent identity rule

`clientSlug` is the permanent client identity and must never change after launch.
`programSlug` may describe the product or current phase, but it no longer controls the client-data storage namespace.
Stable exercise `key` values preserve historical continuity when an exercise is edited.

## Example release metadata

```json
{
  "programVersion": "phase-2-v1",
  "training": {
    "phase": {
      "id": "phase-2",
      "label": "PHASE 2",
      "order": 2
    }
  },
  "updateTitle": "CoachMax has prepared an update for your protocol.",
  "updateMessage": "Phase 2 is ready.",
  "releaseNotes": [
    "New four-day training split",
    "Updated calorie target",
    "Revised cardio progression"
  ]
}
```
