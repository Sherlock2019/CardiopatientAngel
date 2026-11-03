# Knowledge governance

## Workflow
1. **Submit** (any engineer): title, summary, content, source, related feature, access level, tags.
2. **Classify:** keyword classifier suggests a category with a confidence score (author can override).
3. **Redact:** automatic scan for e-mails, phone numbers, SSNs, patient ids, MRNs, dates of birth, JWTs, AWS keys and
   secret assignments; matches are replaced with `[REDACTED:type]` *before* storage and noted on the record.
4. **Review:** the Engineering Lead approves or rejects. Authors cannot approve their own records (separation of duties).
5. **Index:** approved records are retrievable as established guidance; review date = approval + 180 days.
6. **Reuse:** search results log a *retrieved* event; citing a record in a feature logs a *reused* event.
7. **Feedback:** useful / not useful, with optional comment (also redacted).
8. **Expiry:** records past their review date are flagged; edits create a new version and return to review;
   superseded records are deprecated with a pointer to the replacement.

Every step writes an append-only revision (content SHA-256 + snapshot) and an entry in the hash-chained audit log.
Nothing is deleted.

## Access classification
| Level | Who | Examples |
|---|---|---|
| public | everyone with engineering access (and shareable with the client) | customer decisions, synthetic-data policy |
| internal | engineering team | ADRs, patterns, runbooks, postmortems |
| restricted | Engineering Lead, admin | break-glass production access |

Restricted records are filtered **before** retrieval; unauthorized users get 404, so their existence is not revealed.

## What is recommended
Only `approved` records that are not past review appear as established guidance in assistant answers. Drafts,
in-review and deprecated records are shown separately and labelled "not established guidance".

## Metrics (no productivity claims)
Approved records · records linked to features · retrieval and reuse events · records due for review ·
repeated incident categories · onboarding topic coverage. We report counts; improvement claims need measured
before/after data (e.g. time-to-resolve for repeated incident categories).
