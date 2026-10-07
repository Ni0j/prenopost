# Private moderation

`admin.html` is a static sign-in shell. Private data and every decision require a valid Supabase Auth access token whose user UUID is explicitly listed in `public.mailbox_moderators`. Knowing the URL, signing up, or changing browser JavaScript does not grant access. No service-role key or access token is embedded in the site. There are no Edge Functions or paid/external AI services.

## Setup

1. Apply `migrations/202610060001_moderation.sql` after the two mailbox migrations. The public submit RPC and response remain unchanged. The migration imports old submissions as pending references, not public copies, and preserves any already-approved new mailbox records.
2. In Supabase **Authentication → Users → Add user**, create the moderator's email/password account, or use its existing Auth user. Set the password privately; do not put it in source control or chat. No public sign-up form is added by this site.
3. In the SQL Editor, authorize exactly that user:

```sql
insert into public.mailbox_moderators(user_id)
select id from auth.users where lower(email) = lower('YOUR_ADMIN_EMAIL')
on conflict do nothing;
```

Check that one row exists for the intended Auth user. An empty allowlist means nobody can moderate. Ordinary authenticated users cannot add themselves.
4. Publish the static files and open `/prenopost/admin.html` (or `/admin.html` locally). Sign in. Sessions are memory-only; refresh requires another login. No session/private records go into localStorage or sessionStorage. Sign-out clears the rendered data. There is no navigation link from the public site.

## Use

Choose Pending, then a submission. Existing legacy copies use `public_response` when available, otherwise the original private legacy response. New submissions never add an original-text field. Click **prepare public copy** to rerun the existing local redaction pipeline, including legacy `[company]` markers. Add exact phrases one per line to redact anything the rules miss; changing these phrases invalidates the preview. Review the black blocks and remaining text, then **approve & publish**.

Approval atomically copies the prepared representation into `mailbox_entries` and marks the queue item approved. The public API additionally requires the corresponding queue status to be approved. Reject removes any public copy and marks the private item rejected. Rejected items can be reconsidered through the Rejected filter. Concurrent decisions use a version check; refresh if another session has changed an item.

There is no automatic legacy approval. All twelve preexisting legacy submissions, including the five previously reviewed under the older format, require an explicit decision in this interface.

## Database boundary

- `mailbox_queue`: private pending/approved/rejected source records and decision metadata.
- `submissions`: original legacy records, unchanged and private; only an authorized moderator can receive their review copy through `moderation_list`.
- `mailbox_entries`: separate processed public copies; same table and public API consumed by the visualization.
- `mailbox_moderators`: private authorization allowlist keyed to Auth user IDs.
- `moderation_list`, `moderate_mailbox`, `is_mailbox_moderator`: authenticated-only RPCs with server-side allowlist checks.

The browser reuses `dist/lib/privacy.js` and `detector.js` through `moderation.js`. SQL validates the prepared representation, checks authorization/version, and performs the decision atomically. SQL does not attempt semantic name detection. The authorized reviewer remains responsible for the exact public copy; deterministic detection is not an anonymity guarantee. Never grant public read/update access to the inbox, queue, allowlist, or legacy table.

Remove a user's allowlist row to revoke moderation immediately, even if their Auth session remains valid. Do not approve rows by editing `mailbox_entries.approved_at`; use the authenticated decision RPC so queue state and public copy remain consistent.

## Verification

`npm test` includes database privilege, non-moderator denial, migration retry, legacy import, prepared-copy, rejection/unpublish, stale-decision, and allowlist-revocation checks. `npm run test:e2e` includes admin login/denial, additional redaction, approval, rejection, sign-out, desktop/mobile, and the unchanged public flow. Test-only Auth fixtures are isolated in `tests/support`; production authenticates against Supabase.
