import crypto from "node:crypto";
import type { Response } from "express";

export function sendNewsletterPreferencesPage(
  res: Response,
  state: "confirm" | "success" | "invalid",
  token = "",
) {
  const nonce = crypto.randomBytes(16).toString("base64");
  const heading = state === "confirm" ? "Unsubscribe from newsletters" : state === "success" ? "You’re unsubscribed" : "This link isn’t valid";
  const description = state === "confirm"
    ? "Would you like to stop receiving newsletters from Youth Service Philippines?"
    : state === "success"
      ? "You will no longer receive newsletters from Youth Service Philippines. Thank you for being part of our community."
      : "Please open the unsubscribe link in your latest Youth Service Philippines newsletter and try again.";
  // Only validated hexadecimal tokens may enter the HTML form.
  if (state === "confirm" && !/^[a-f0-9]{64}$/.test(token)) {
    throw new Error("Invalid newsletter preference token");
  }
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", `default-src 'none'; style-src 'nonce-${nonce}' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`);
  res.status(state === "invalid" ? 400 : 200).type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${heading} | Youth Service Philippines</title>
  <link rel="icon" type="image/png" href="/pwa-icons/icon-192.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&amp;display=swap" rel="stylesheet">
  <style nonce="${nonce}">
    /* Match index.css tokens, Navigation, Login, Card, and Button styles. */
    :root { --background: 0 0% 100%; --foreground: 0 0% 9%; --card: 0 0% 98%; --card-border: 0 0% 94%; --border: 0 0% 90%; --muted: 20 6% 90%; --muted-foreground: 0 0% 35%; --primary: 24 95% 53%; --primary-foreground: 0 0% 98%; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; min-height: 100svh; display: flex; flex-direction: column; background: hsl(var(--background)); color: hsl(var(--foreground)); font-family: Inter, sans-serif; -webkit-font-smoothing: antialiased; }
    header { border-bottom: 1px solid hsl(var(--border)); background: hsl(var(--background) / .95); }
    .header-inner { max-width: 1280px; margin: 0 auto; padding: 0 32px; height: 64px; display: flex; align-items: center; }
    .brand { display: inline-flex; align-items: center; gap: 12px; padding: 4px 8px; color: inherit; text-decoration: none; font-size: 18px; font-weight: 700; line-height: 28px; border-radius: 6px; min-width: 0; }
    .brand:hover { background: hsl(var(--foreground) / .03); }
    .brand img { height: 40px; width: auto; }
    .brand span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    main { flex: 1; display: grid; place-items: center; padding: 48px 16px; background: hsl(var(--muted) / .3); }
    .card { width: 100%; max-width: 448px; background: hsl(var(--card)); padding: 24px; border: 1px solid hsl(var(--card-border)); border-radius: 12px; text-align: center; }
    .icon { width: 64px; height: 64px; display: grid; place-items: center; margin: 0 auto 16px; background: hsl(var(--primary) / .1); border-radius: 50%; color: hsl(var(--primary)); }
    .icon svg { width: 32px; height: 32px; }
    h1 { margin: 0 0 6px; font-size: 24px; font-weight: 600; line-height: 1.2; letter-spacing: -.6px; }
    .description { margin: 0; color: hsl(var(--muted-foreground)); font-size: 14px; line-height: 20px; }
    .actions { margin-top: 24px; display: grid; gap: 12px; }
    form { margin: 0; }
    .button { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 36px; padding: 8px 16px; border: 1px solid hsl(24 95% 45%); border-radius: 6px; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); font: inherit; font-size: 14px; font-weight: 500; text-decoration: none; cursor: pointer; line-height: 20px; }
    .button:hover { background: linear-gradient(#00000008, #00000008), hsl(var(--primary)); }
    .button:active { background: linear-gradient(#00000014, #00000014), hsl(var(--primary)); }
    .button.secondary { color: inherit; border-color: hsl(var(--foreground) / .1); background: transparent; }
    .button.secondary:hover { background: hsl(var(--foreground) / .03); }
    :focus-visible { outline: 1px solid hsl(var(--primary)); outline-offset: 2px; }
    .note { margin: 24px 0 0; padding-top: 16px; border-top: 1px solid hsl(var(--border)); color: hsl(var(--muted-foreground)); font-size: 12px; line-height: 20px; }
    footer { padding: 24px 16px; border-top: 1px solid hsl(var(--border)); text-align: center; color: hsl(var(--muted-foreground)); font-size: 14px; line-height: 20px; }
    footer p { margin: 0; }
    footer p + p { margin-top: 4px; }
    @media (max-width: 639px) { .header-inner { padding: 0 16px; } .brand { gap: 8px; font-size: 14px; line-height: 20px; } .brand img { height: 32px; } .brand span { max-width: 180px; } }

  </style>
</head>
<body>
  <header><div class="header-inner"><a class="brand" href="/"><img src="/images/ysp-logo.png" alt=""><span>Youth Service Philippines</span></a></div></header>
  <main><section class="card" aria-labelledby="title">
    <div class="icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${state === "success" ? '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>' : state === "invalid" ? '<circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>' : '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'}</svg></div>
    <h1 id="title">${heading}</h1>
    <p class="description">${description}</p>
    <div class="actions">${state === "confirm" ? `<form method="post" action="/api/newsletter/unsubscribe"><input type="hidden" name="token" value="${token}"><button class="button" type="submit">Unsubscribe from newsletters</button></form><a class="button secondary" href="/">Keep my subscription</a>` : `<a class="button" href="/">Return to homepage</a>`}</div>
    <p class="note">${state === "confirm" ? "Your subscription will only change after you confirm above." : state === "success" ? "You can subscribe again anytime through our website." : "Your subscription has not been changed."}</p>
  </section></main>
  <footer><p>&copy; ${new Date().getUTCFullYear()} Youth Service Philippines. All rights reserved.</p><p>Youth Service to the Filipino Youth, Inc. is the official owner and operator of youthserviceph.org. SEC Registration No. 2023010080782-00.</p></footer>
</body>
</html>`);
}
