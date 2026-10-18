# Google and passkey sign-in

The application keeps `admin_users`, `chapter_users`, and `barangay_users` as the authorization source. Google and passkeys are only sign-in methods for an account that an administrator has already provisioned.

## Supabase

1. In Supabase Dashboard → Authentication → Providers, enable **Google**.
2. Create a Google OAuth web client in Google Cloud and add the Supabase callback URL shown in the provider settings.
3. Add these redirect URLs in Supabase → Authentication → URL Configuration:
   - `https://youthserviceph.org/login`
   - `https://www.youthserviceph.org/login`
   - `https://youthserviceph.org/my-profile?link=google`
   - `https://youthserviceph.org/my-profile?link=passkey`
   - `https://www.youthserviceph.org/my-profile?link=google`
   - `https://www.youthserviceph.org/my-profile?link=passkey`
   - `http://localhost:5173/login` for local development
   - `http://localhost:5000/login` if the server serves the client directly
4. In Authentication → Passkeys, enable passkeys and use:
   - RP display name: `Youth Service Philippines`
   - RP ID: `youthserviceph.org`
   - RP origins: `https://youthserviceph.org`, `https://www.youthserviceph.org`
5. Keep the RP ID stable after users register passkeys. Changing it invalidates existing passkeys.

Set these application variables in the deployment and local environment:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
VITE_GOOGLE_AUTH_ENABLED=true
VITE_PASSKEY_AUTH_ENABLED=true
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
GOOGLE_AUTH_ENABLED=true
PASSKEY_AUTH_ENABLED=true
PUBLIC_SITE_URL=https://www.youthserviceph.org
# Set true for the first deployment so the external identity table is created.
RUN_STARTUP_SCHEMA_SETUP=true
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` with a `VITE_` prefix.

## Google app name and logo

Google's account chooser branding is managed separately in Google Auth Platform, not in Vercel, Supabase's site URL, or `scripts/appsscript.json`.

In the Google Cloud project that owns OAuth client `970702374266-ct45j8c22b224k680epc58mb03kunlqm.apps.googleusercontent.com`, open **Google Auth Platform → Branding** and configure the app name as **Youth Service Philippines**, upload the YSP logo, and provide the support email, verified application domain, homepage, and actual public privacy/terms URLs. Complete Google's brand verification so the published name and logo can replace the Supabase domain fallback. Do not replace the Supabase OAuth callback URL with the homepage.

References: [Supabase Google branding setup](https://supabase.com/docs/guides/auth/social-login/auth-google#setup-consent-screen-branding), [Google brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).

## Linking existing YSP accounts

1. Sign in with the existing YSP username/password.
2. Open **My Profile**.
3. Enter the **Google email** you want to connect, choose **Link Google**, and select that same account in Google. The authorization expires after ten minutes.
4. Choose **Add a passkey**. If there is no Supabase session, complete Google sign-in first. Back in My Profile, choose **Add a passkey** again to start the device prompt from a button click.
5. Sign out and test both buttons from the login page.

The server rejects external identities that are not in `external_auth_identities`, rejects inactive accounts, and never uses a matching member email to grant access.

Public OAuth attempts cannot create new Auth users without prior YSP authorization. The `public.ysp_before_user_created` Supabase hook requires a single-use, unexpired entry in the private `ysp_auth.google_enrollments` table. Only the authenticated server can issue these entries from My Profile. The hook verifies that the YSP account still exists and is active, then binds the Google identity in the same transaction as Auth user creation. Existing Supabase identities must also complete the authorized email connection before they can be linked. Public email/anonymous registrations are rejected.

The database change is in `supabase/migrations/20261018011650_restrict_external_auth_enrollment.sql`. After applying it, configure the Before User Created hook with `hook_before_user_created_enabled=true` and `hook_before_user_created_uri=pg-functions://postgres/public/ysp_before_user_created`. Keep global signup processing enabled so the hook can permit explicitly authorized Google enrollments; the hook denies other creation requests. The migration assumes the existing YSP account and external identity tables are already installed.

The server verifies the JWT authentication method before exchanging a Google or passkey session. Linking also verifies the current YSP account, confirms that passkeys have been registered, and prevents one Supabase identity from being linked to different YSP accounts across providers. External login rotates the local session ID.

Vite loads local environment variables from the repository root. After changing `VITE_` flags, rebuild and redeploy: those flags are compiled into the frontend. Preview deployment domains cannot use production passkeys; use the configured production origin for registration and sign-in. Localhost OAuth redirects are allowed for development, but production passkeys are bound to `youthserviceph.org` and cannot be used on localhost.

Run the authentication method regression checks with `npx tsx --test scripts/test-external-auth-policy.ts`.

To run the database and live Auth enrollment checks, set `RUN_EXTERNAL_AUTH_TESTS=true` and run `npx tsx scripts/test-external-auth-enrollment.ts`. The checks create temporary YSP fixtures, roll back hook tests, and clean up their records.

The table and indexes are created automatically at startup when `RUN_STARTUP_SCHEMA_SETUP=true`. Existing accounts are intentionally not auto-linked; each link must be made while the corresponding local account is authenticated. After the first successful deployment, you may remove the variable if your deployment policy disables startup schema changes.
