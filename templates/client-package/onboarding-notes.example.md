# Father Empowering Client Package Notes

This file is for coach/admin notes only. Do not upload private intake answers unless the client package intentionally requires them.

The three `.example.json` files in this template must be copied without the `.example` suffix for a real client:

- `client-info.json`
- `training-program.json`
- `nutrition-program.json`

Before generation or publication, a real client package must pass strict validation:

```bash
node scripts/validate-client-package.js clients/<client-slug> --strict
```

Generate the validated portal in place:

```bash
node generate-portal.js clients/<client-slug>
```

## File Responsibilities

- `client-info.json`: permanent client identity, display names, public portal metadata, feature flags, measurements, public integration references, migration declaration, and storage namespace.
- `training-program.json`: training content, session catalog, week objects, exercises, prescriptions, update message, and derived protocol length.
- `nutrition-program.json`: nutrition targets, plans, meals, groceries, rules, update message, and nutrition display content.
- `onboarding-notes.md`: internal build notes, source references, coach reminders, and upload checklist.

## Required Fields

- `client-info.schemaVersion`
- `client-info.client.id`
- `client-info.client.slug`
- `client-info.client.displayName`
- `client-info.storage.namespace`
- `training-program.programVersion` when Training is enabled
- `training-program.training.phase.id`, `.label` and `.order`
- `training-program.training.weeks[]` when the final program is ready
- `nutrition-program.programVersion` when Nutrition is enabled

## Optional Fields

- `client.shortName`
- `client.startDate`
- `portal.metadata.protocolVersionLabel`
- `integrations.tally.publicFormUrl`
- `migration.legacyStorage.*`
- `measurements.iconMap`
- nutrition plans while Nutrition is disabled

## Identity Rules

- `client.id` is permanent. It is an internal identity and should never be generated again for the same client.
- `client.slug` is public. It may appear in URLs, storage namespaces, backups, and future repo/folder names.
- Do not derive `client.id` from the name. A client may change name or spelling; their ID must not change.
- Changing `client.slug` after deployment requires a storage migration.

## If A Slug Must Change

1. Keep a backup of the old deployed portal.
2. Document the old slug and old storage namespace.
3. Add the old localStorage keys and IndexedDB names under `migration.legacyStorage`.
4. Keep `storage.namespace` unchanged if the goal is to preserve local data without migration.
5. Run validation.
6. Test localStorage, IndexedDB photos, check-ins, history, and program updates before upload.

## Publishing another phase

1. Keep the permanent client ID, slug, URL and storage namespace unchanged.
2. Copy the current Training file and build the new prescription.
3. Assign a new unique `programVersion`.
4. Assign a new permanent `training.phase.id` such as `phase-2`; never reuse an archived ID.
5. Increase `training.phase.order` and update its visible label.
6. Validate the complete client package.
7. Publish the new Training JSON. The portal asks the client to confirm **START NEW PHASE**.
8. Verify that the previous phase appears as completed in History and that the new phase starts at Week 1.

## Environment And Secrets

- Public client configuration belongs in `client-info.json`.
- Environment configuration belongs in a controlled app/environment config, for example endpoint references such as `legacy-telegram-backend`.
- Server secrets belong only on the server, never in the portal files.
- Never put bot tokens, API keys, bearer tokens, private URLs, or local Mac paths in this package.

## Validation Command

From the client package folder:

```bash
node scripts/validate-client-package.js .
```

For the reusable template:

```bash
node scripts/validate-client-package.js templates/client-package
```

## Validation Results

- `ERROR`: must be fixed before upload. The command exits non-zero.
- `WARNING`: valid but risky or transitional. Review before upload.
- `INFO`: derived values and non-blocking context.

## Package Checklist

- `client.id` is stable and unique.
- `client.slug` is normalized and approved.
- `storage.namespace` is intentional.
- No `totalWeeks` exists in `client-info.json`.
- `training.weeks.length` matches the intended protocol length.
- Sessions used in weeks exist in `training.sessionCatalog`.
- Nutrition is present when `features.nutrition` is enabled.
- Plan IDs are unique.
- No storage override is non-namespaced.
- No secrets or absolute local paths are present.
- The package passes validation.
- The generator finishes with `PORTAL READY`.
