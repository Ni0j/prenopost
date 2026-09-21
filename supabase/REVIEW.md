# Preparing a contribution for the generator

The original `response` stays private. The generator can only return `public_response` after `approved_at` is set. A silence entry needs approval but has no reply text. Never bulk-approve unreviewed submissions.

## Review decisions

Remove personal names, candidate/application/reference numbers, contact details, signatures, addresses, account links, and tracking links from the public copy. A numeric reference may be a public job number rather than a personal application number; omitting it still avoids an unnecessary identifying link.

Company names and position titles are not automatically sensitive. Their combination with dates, locations, rare roles, or other facts can identify a person or application. For the first five samples, company names are masked as `[company]`, the numeric reference is removed, and role titles are retained. This is a conservative editorial choice, not a guarantee that text cannot be recognized.

Use `career_context` for a broad, accurate role family such as “Motion design” or “Creative technology”. Leave it empty when the source does not identify the career. Do not infer a person's name, demographic traits, or career from the company alone. The current generator has no career filters; five samples are too few to suggest reliable personalization.

Keep the original wording except for necessary redactions. Do not paraphrase, invent employers, or manufacture a reply for a silence entry. Review the career tag too: it is public when approved.

Pattern matching can help flag email addresses and numbers, but it cannot reliably distinguish names, job IDs, or identifying combinations. Publication therefore requires a reviewed copy rather than trusting automatic redaction.

## In Supabase Table Editor

1. Find the pending row in `submissions`.
2. Fill in `public_response` with the reviewed text (leave it empty for `no_response`).
3. Optionally set `career_context` to a broad role family.
4. Review the public copy and context together, then set `approved_at` to the current timestamp.
5. Clear `approved_at` before editing a published copy; set it again after review. Clearing approval removes it from subsequent generator draws.

The generator only returns a record ID, outcome, reviewed text or day count, and reviewed career context. It never exposes the original response, request hash, or submission timestamp.

Run `generator.sql` once on an existing collector database to add these fields and the `draw_rejection` function. New databases can use the complete `schema.sql`.
