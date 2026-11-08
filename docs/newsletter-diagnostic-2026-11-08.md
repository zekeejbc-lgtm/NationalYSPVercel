# Newsletter diagnostic — November 8, 2026

## Root cause and correction

The local server initially ran older backend code, returning HTML for newsletter requests. After restart, subscriber reads exposed a second issue: the existing `newsletter_subscribers` table had the legacy structure, including required `normalized_email`, but lacked `source`, subscription status, consent metadata, and unsubscribe tokens. Fresh-schema integration tests did not cover that upgrade path.

The initializer now upgrades existing subscriber tables transactionally, keeps normalized email compatible with legacy requirements, and adds the required unique indexes. Legacy email drafts are imported once with IDs and contents preserved; sent campaigns remain sent. A private migration journal prevents deleted drafts from reappearing. Existing tables and data are retained. The migration has been applied to the configured database.

## Verified results

| Check | Result |
| --- | --- |
| Newsletter routes against configured database | Subscribers, drafts, status: HTTP 200 |
| Current records | 9 subscribers; 0 drafts; 0 pending/failed deliveries |
| Database access | All six newsletter tables have RLS; zero PUBLIC/anon/authenticated grants |
| Live mail bridge authorization/quota check | Passed; 100 remaining recipients at check time |
| Live newsletter action recognition | Passed using a deliberately invalid, unsendable payload |
| Fresh newsletter integration suite | Passed |
| Legacy-schema newsletter integration suite | Passed, including preserved legacy sent content |
| Coalition regression suite | Passed, including invitations, review flows, tracking, certificates, recovery, mock mail, rate limits and public-role denial |
| TypeScript check | Passed |
| Production build | Passed |
| Local public API smoke checks | Health, programs, chapters, stats, home content, contact info, publications, volunteer opportunities: HTTP 200 JSON |
| Local access controls | Unauthenticated newsletter reads: HTTP 401 JSON; unknown API route: HTTP 404 JSON |
| Diff whitespace check | Passed |

Build output still reports existing bundle-size, mixed-import, Browserslist-age and PostCSS warnings. These do not block the build.

## Operational status and limits

Automatic newsletter processing is disabled: no scheduler secret or enabled worker flag was configured. The admin's manual Process Queue control remains available. See [newsletter operations](newsletter.md) to enable a worker/scheduler.

No real emails were sent by diagnostics or integration tests. Real inbox delivery and browser interactions were not exercised. The live bridge checks verify authorization, quota access, and action recognition; they do not prove successful inbox delivery. Authenticated newsletter reads were exercised through a loopback-only diagnostic route harness using the real database; unauthenticated access controls were also checked on the running application.

Repeat the real-data checks with `npm run newsletter:diagnose`. Repeat upgrade coverage with `npm run newsletter:test -- --legacy`.
