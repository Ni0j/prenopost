# Existing Supabase project

The site continues to use its existing Supabase URL and publishable key from `dist/config.js`.

See [MAILBOX.md](MAILBOX.md) for the current migration, review workflow, deployment order, and tests. There is no additional API key, AI provider, Edge Function, or admin application to configure.

Do not run the legacy `schema.sql` or `generator.sql` after the current mailbox migration; those files describe the previous collector and are retained for migration tests and history.
