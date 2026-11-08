# Newsletter delivery diagnosis — November 8, 2026

## Finding

The configured database has two pending deliveries and no failed or held deliveries. The screenshot shows both at zero attempts. The configured environment reports automatic processing disabled. Queueing a test, sending a campaign, and choosing Retry now only create or update queue records; none calls the delivery processor.

The repository's Vercel configuration installs no cron schedule. The newsletter worker is a separate process (`npm run newsletter:worker`); importing the web application does not start it. Neither `.env` nor `.env.local` configures a scheduler secret or enables the worker status flag. These local files do not establish the deployed server's environment or whether an external scheduler exists.

This explains the observed queue state: no delivery has been recorded, so there is no recorded provider failure to troubleshoot yet. The bridge checks below passed, but do not prove inbox delivery.

## Checks performed

- Configured database initialization and newsletter subscribers/drafts/status routes passed (HTTP 200): nine subscribers, one draft, two pending deliveries, zero failed, zero held.
- All six newsletter tables have row-level security enabled; zero grants to PUBLIC, anon, or authenticated roles.
- Live Google Apps Script authorization and quota check passed: 100 remaining recipients at check time.
- Live newsletter action recognition passed using an intentionally invalid payload that cannot send an email.
- Production newsletter status and processing endpoints rejected unauthenticated requests (HTTP 401).
- Fresh-schema newsletter integration suite passed, including mock delivery, retry behavior, concurrency, holds, resends, opt-outs, consent, access controls, and HTML safety.
- Legacy-schema upgrade integration suite also passed.

## Operational correction

For immediate manual delivery, return to the newsletter dashboard's Email delivery card and use Process Queue. It processes up to two eligible deliveries, including subscriber campaigns as well as tests. Hold any message that should not send before processing. Inspect delivery history and the receiving inbox afterward.

For automatic delivery, run the supplied worker on a persistent host, or configure an external scheduler to call GET /api/newsletter/process with the server-side CRON_SECRET as a Bearer token. Set NEWSLETTER_WORKER_ENABLED=true only after arranging that service; the flag alone starts no worker. See [newsletter operations](newsletter.md).

No real email was sent, no existing delivery was retried, and no deployment configuration was changed during this diagnosis. Production worker configuration and real inbox receipt remain unverified.
