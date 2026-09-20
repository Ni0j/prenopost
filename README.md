# Worst case scenario

A small collector of real cold-outreach rejections for a future rejection simulator.

## Run

Use Node 22.9 or newer. Run `npm start`, then open the address printed in the terminal. The default port is 5173; `.env.example` sets 5174 when copied to `.env`. `npm start` automatically loads `.env` when it exists.

Run `npm test` for input validation, literal-text preservation, retry, concurrency, and repository checks.

## Connect Supabase

Follow [the step-by-step setup](supabase/SETUP.md). Run `supabase/schema.sql` in a new project's SQL Editor. This creates one private table and two narrowly scoped functions. It inserts no sample data. Then set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `.env`; use a public publishable key, never a secret/service-role key.

The schema is for a new project, matching the current collector. It is not an upgrade script for an older schema.

Without configuration, activity is marked not connected and submissions fail honestly while retaining the draft. No success or activity is simulated. Unit tests mock HTTP requests; they do not establish a live database connection.

## Flow

The initial page is a short invitation. “bring it here :)” reveals the collector. The rejection field is ready immediately; “Or, no response?” switches to one days field. Returning to the intro or changing the branch preserves drafts. A completed submission can be followed by a fresh entry.

- Rejection: paste the actual reply. Text is preserved as entered, including whitespace and line breaks. Users must redact identifying details themselves. Overlong pastes are rejected without silent truncation.
- No response: enter a positive whole number of days since the outreach email. Store structured days, not an invented reply.
- No accounts, names, original outreach messages, questionnaires, or withdrawal flow.
- A notice about future simulator use appears when an input is focused or edited, and before submission. Privacy details remain in a corner dialog.

All records start pending (`approved_at` is null). Review contributions before approving them for future simulator use. The simulator is not implemented.

Public activity shows only the latest real contribution timestamp, including pending contributions. Table data remains private through RLS and grants. Clients can call `submit_rejection` and `latest_submission`, but cannot directly read, write, or delete rows. Hashed request identities make retries idempotent and are never shown as user-facing codes.

No external fonts, analytics, or cookies. Feature-detected WebMCP uses the same validation and submission flow. Deployment requires suitable API abuse protection/rate limiting.
