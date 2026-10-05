# Mailbox setup and review

The static frontend prepares a redacted preview locally in the browser. Only the confirmed representation is sent to Supabase. There is no AI dependency, detector API, Edge Function, signing secret, or new service. Existing hosting/database quotas still apply.

## Submission and privacy

- New submissions enter `mailbox_entries` with `approved_at = null`. They are private until reviewed.
- `payload` contains `{outcome, days, segments}` only. A segment is `{type:"text",text:"…"}` or `{type:"redaction",width:8}`. Redaction objects contain no original text. The frontend never sends its original textarea value.
- Browser rules detect contact details and some contextual names/companies. They are imperfect and bypassable; review is the public-release boundary. A malicious client can submit arbitrary text segments to the private inbox. The database validates structure, not semantic anonymization. Do not rely on automatic detection to approve an entry.
- Anonymous/authenticated API callers cannot read the inbox or approve/update rows. The public collection returns only approved, non-future rows and only the processed representation.
- Editing the payload clears approval automatically, even if an approval timestamp is supplied in the same update. Reapprove after reviewing the final copy.
- Submission retries reuse a random UUID and do not create another row. A global 200-new-submissions/hour budget provides a basic flood limit without new infrastructure. It is not comprehensive anti-abuse protection.
- Old originals stay in the existing private `submissions` table. They are not bulk-approved or copied into the new collection. Old raw submission and legacy draw RPCs are disabled by the second migration after the frontend release.

## Review in Supabase Table Editor

1. Open `public.mailbox_entries`, filter `approved_at` to null.
2. Review the processed `payload` for relevance and remaining identifying details. No raw original is available for new contributions.
3. If further redaction is needed, replace the identifying substring with an independent `{ "type": "redaction", "width": N }` object. Keep surrounding text unchanged. Width is 1–32 approximate characters; split longer spans into multiple objects. Do not attach the removed text to another field.
4. Save the corrected payload, then set `approved_at` to the current timestamp in a separate save. The entry becomes public immediately afterward.
5. Leave unrelated/unsafe entries unapproved, or delete them using the admin Table Editor. Clear `approved_at` to withdraw a published entry.

Only privileged project administration may perform review. Do not grant anonymous users table access or add public RLS policies. No review button is shipped to the public website.

## Deploy existing project

1. Apply `supabase/migrations/202610050001_mailbox.sql` to the existing project. It is transactional and rerunnable; do not rerun the older schema/generator scripts afterward, because they restore legacy grants.
2. Publish the static files together, including `submit.html`, `dist/lib/privacy.js`, `dist/lib/detector.js`, and the supplied font. The first migration is additive and leaves the old site working. After the new frontend is live, apply `supabase/migrations/202610050002_close_legacy.sql` to revoke the old raw submission and draw RPCs.
3. Check that pending submissions remain absent from `mailbox_collection`, direct table reads fail, approval makes only the processed copy public, and edits revoke publication. Use a rollback transaction for synthetic production database tests so no test entries remain.

No model credentials are required. Deployment reuses the existing Supabase access token and GitHub repository access. Neither credential belongs in browser files.

## Tests

`npm ci`, `npm test`, then `npm run test:e2e` (install Playwright Chromium or set `CHROME_PATH`). Unit tests cover local-only preview, privacy representation, changed-text invalidation, retries and database privileges/review gating. Browser tests use real local rules and PGlite SQL, not a model mock. Synthetic records and review endpoints exist only in `tests/support/server.mjs`, never production.
