# Reviewing submissions

Use the [mailbox review instructions](MAILBOX.md#review-in-supabase-table-editor).

New submissions contain only the confirmed, processed representation. They remain private until `approved_at` is set by a project administrator. Editing a published payload clears its approval automatically. There is no automatic publication and no AI service.

Legacy originals in `submissions` remain private. Do not publish them directly or rerun `generator.sql` to restore the previous public endpoint.
