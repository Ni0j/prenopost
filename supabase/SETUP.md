# Connect the collector to Supabase

The backend is prepared. You only need to create the project in your own account and run the supplied SQL. There is no server code to write, no signup system to configure, and no table to build manually.

1. Open https://supabase.com/dashboard and sign in or create an account.
2. Create an organization if prompted, then choose **New project**. Name it `rejection-collector`, generate a database password and save it privately, and choose a region close to your intended visitors. Create the project and wait for it to finish provisioning. Keep the Data API enabled.
3. Open **SQL Editor** in the project. Create a new query. Copy the entire contents of `supabase/schema.sql` from this repository into it and click **Run**. A successful run creates the private table and the two operations the website uses. Do not use the example SQL from a tutorial.
4. Open **Table Editor** and confirm that `submissions` exists and is empty. The SQL enables Row Level Security automatically. Do not add public read/write policies or disable RLS.
5. Open the project's **Connect** dialog and copy the **Project URL** and **Publishable key** (`sb_publishable_…`). API keys are also available under **Settings → API Keys**. Do not share the database password or a secret/service-role key.
6. Send the project URL and publishable key to Codex, and say that the SQL ran successfully. Codex can put those two values into the local `.env`, restart the preview, and check connectivity. No fake contributions need to be inserted.

If the SQL fails, send the error message; do not make manual schema changes.

## What is set up

- One `submissions` table: literal rejection text or days of silence, timestamps, and an internal retry identity.
- `submit_rejection`: validates and stores a contribution, initially unapproved. Retrying the same request does not add a duplicate.
- `latest_submission`: returns only the latest contribution time.
- Public visitors cannot read the stored replies, modify records, or delete them.
- The future simulator is not implemented. Approval can later be handled in Supabase's Table Editor; no admin application is needed now.

## Local configuration (Codex can do this)

Copy `.env.example` to `.env`, fill in the two values, then run `npm start`. The example uses port 5174. `.env` is ignored by Git, and the server serves only files from `dist`, so the file itself is not served. The publishable key is intentionally included in the browser configuration; database permissions enforce access limits.

This is a local preview connection, not a public deployment. API abuse protection/rate limiting should be configured before public launch.

Official references:
- https://supabase.com/docs/guides/getting-started/quickstarts/reactjs (project creation, SQL Editor, and Connect dialog)
- https://supabase.com/docs/guides/getting-started/api-keys (publishable versus secret keys)
