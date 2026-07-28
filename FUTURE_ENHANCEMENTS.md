# Future Enhancements

Ideas identified during the beta-readiness completion pass that are genuine improvements but out of scope for this pass — either because they're new feature work rather than a bug fix, or because they're a larger UX investment than a targeted polish change. Not implemented per the pass's own rule: audit and fix, don't invent new workflows.

| # | Idea | Benefit | Estimated effort | Priority |
|---|---|---|---|---|
| 1 | Document versioning UI. `documents.version_number`, `.replaces_document_id`, `.is_latest_version` all exist in the schema, but no frontend code reads or writes them — uploading a new version of an existing document just creates an unrelated row today. | Lets staff/clients replace a document without losing history, and see prior versions. | Medium (upload-replaces-existing flow, version history list, "restore" action) | Medium |
| 2 | Document folder rename/delete. `DocumentFolderModal` only creates folders (from a template or manually) — there's no way to rename or delete one afterward. | Completes basic folder management instead of only supporting one-way creation. | Small–Medium | Low |
| 3 | Replace `window.prompt()` for document-rejection reason with a proper on-brand modal (text input + Cancel/Reject buttons), matching the `ConfirmDialog` pattern already used everywhere else for destructive actions. | Consistent, accessible, on-brand UI instead of an unstyled native browser prompt that some browsers/extensions block. | Small (new small modal component) | Low |
