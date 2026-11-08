# Newsletter operations

The newsletter uses private Postgres tables with RLS and the existing Google Apps Script mail bridge. Tables are initialized transactionally on first use. Member opt-ins are imported when subscribers are loaded or a campaign is queued. Member imports never reactivate an opt-out. Submitting the public subscription form with fresh consent restores a previously unsubscribed or removed address. Directory addresses are only labels, never an audience source.

Existing deployments are upgraded in place: preference fields are added to legacy subscribers, normalized email remains supported, and `newsletter_email_drafts` records are copied once into the current drafts table. Sent campaigns remain sent. The legacy table is retained privately; a migration journal prevents deleted drafts from being imported again.

## Delivery setup

1. Update the existing Google Apps Script deployment with `scripts/google-drive-upload.gs`. The new `newsletter_mail` action uses the existing mail secret and sends the same safe HTML shown in the admin preview. The existing deployment must be updated before newsletters can send; older bridge code will reject the action.
2. Keep `GOOGLE_APPS_SCRIPT_URL` and `COALITION_MAIL_SECRET` configured on the server. Set `PUBLIC_SITE_URL` to the public HTTPS origin so unsubscribe links point to the correct site. The default is `https://youthserviceph.org`.
3. Run `npm run newsletter:worker` on a persistent worker host. It processes two messages every 15 seconds, with automatic retries after five minutes. Alternatively, configure an external scheduler to GET `/api/newsletter/process` every minute with `Authorization: Bearer <CRON_SECRET>`. The secret is server-side only. Do not put it in a URL or client code. No Vercel cron schedule is installed by this change.
4. Set `NEWSLETTER_WORKER_ENABLED=true` on the web server only after the worker or scheduler is running. This flag reports operator configuration, not worker health. Without a worker, an admin can use **Process Queue** to process two eligible emails at a time.
5. Save a draft, queue a test to your own address, process delivery, and inspect the received email before queuing a campaign. No email is sent merely by deploying or opening the admin page.

The status card reports server configuration; it cannot verify that the Apps Script deployment is updated or authorized. A delivery failure appears in queue totals; check bridge deployment, authorization, shared secret, and daily mail quota. Batch sending is limited by the existing Google account's quota. For large audiences, replace the transport with a bulk email service and delivery webhooks.

## Safeguards and limits

- Press a subscriber row to open their delivery history, paginated in groups of 50. It includes saved content previews, attempts, errors, dates, tests, and requeued copies. Hold pauses a queued message; Resume or Retry now returns it to the worker. Failed messages can be retried and sent messages explicitly resent. These actions queue delivery; use the worker or Process Queue to send.
- Retry within 24 hours preserves the message ID and attempt history for bridge deduplication. Retrying after the window expires creates a fresh history entry and message ID, as does Resend. An unconfirmed earlier delivery may already have arrived, so the confirmation explains that a duplicate copy is possible. Held messages do not send automatically.
- Delete subscriber requires typing their exact email, checked on both client and server. Removal hides the subscriber, preserves delivery history, cancels queued/held messages including tests addressed to them, and retains an unsubscribe/removal marker to prevent automatic reimport. A message already in flight may finish before deletion. A new public subscription with explicit consent restores the same subscriber record and its history; cancelled deliveries stay cancelled.

- Only national admins can read subscriber data, manage campaigns, and process delivery. Newsletter API responses are not stored in the browser session cache.
- Each campaign snapshots its audience and content. Duplicate send requests cannot queue the same campaign twice. Draft creation and test requests use request IDs to tolerate client network retries.
- Saved drafts offer **Specific recipients** (the default) or **All subscribers**. Search subscribed emails with autosuggestions, select with Enter/click, or paste comma-separated addresses. Duplicates count once. Recipient choices are used when queuing; they are not stored with an unsent draft. Selected audiences are limited to 1,000 addresses. Unknown or unsubscribed addresses reject the entire send request rather than broadening or partially queuing the audience.
- Delivery checks subscription status again just before sending. Unsubscribe links open a confirmation form; GET requests do not change preferences, protecting against email link scanners.
- People can resubscribe through the public form with explicit consent. This clears removal/unsubscribe markers, updates consent and subscription timestamps, and keeps the same identity. Earlier queued deliveries are cancelled when an inactive subscription is renewed; only future campaigns include them.
- The public form confirms success only for an active, visible subscription. Previously unsubscribed or removed addresses are restored when the form is submitted with consent. The admin subscriber list refreshes every 15 seconds and on window focus/reconnect, and same-tab subscriptions invalidate its cached list immediately.
- Sent/queued campaigns cannot be edited or deleted. Unsent drafts can be deleted. Test messages are clearly marked and do not change subscriptions.
- Messages retry up to 12 attempts within 24 hours. Expired jobs fail rather than risk resending outside the bridge's two-day duplicate protection window. The worker must run frequently enough to clear the audience within 24 hours.
- Current UI shows the latest 100 campaigns. Chapter targeting, scheduling individual campaigns, rich formatting, and bounce webhooks are later enhancements.

## Verification

`npm run newsletter:test` creates and drops a uniquely named disposable schema in the configured database. It uses a local mock bridge and sends no real email. `npm run check` checks application types; `npm run build` checks production compilation.

`npm run newsletter:test -- --legacy` exercises an existing subscriber/draft schema upgrade before running the integration suite. `npm run newsletter:diagnose` initializes/upgrades the configured database and checks the real newsletter reads, table security, bridge authorization, quota, and newsletter action support. It imports member opt-ins but never calls delivery or sends email. Diagnostic output excludes addresses, contents, credentials, and unsubscribe tokens.
