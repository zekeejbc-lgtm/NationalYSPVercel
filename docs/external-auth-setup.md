# Google and passkey sign-in

The application keeps `admin_users`, `chapter_users`, and `barangay_users` as the authorization source. Google and passkeys are only sign-in methods for an account that an administrator has already provisioned.

## Supabase

1. In Supabase Dashboard → Authentication → Providers, enable **Google**.
2. Create a Google OAuth web client in Google Cloud and add the Supabase callback URL shown in the provider settings.
3. Add these redirect URLs in Supabase → Authentication → URL Configuration:
   - `https://youthserviceph.org/login`
   - `https://www.youthserviceph.org/login` (only if that host is used)
   - `http://localhost:5173/login` for local development
   - `http://localhost:5000/login` if the server serves the client directly
4. In Authentication → Passkeys, enable passkeys and use:
   - RP display name: `Youth Service Philippines`
   - RP ID: `youthserviceph.org`
   - RP origins: `https://youthserviceph.org` (plus the exact `www` or staging origins you use)
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
PUBLIC_SITE_URL=https://youthserviceph.org
# Set true for the first deployment so the external identity table is created.
RUN_STARTUP_SCHEMA_SETUP=true
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` with a `VITE_` prefix.

## Linking existing YSP accounts

1. Sign in with the existing YSP username/password.
2. Open **My Profile**.
3. Choose **Link Google** and finish Google sign-in.
4. Choose **Add a passkey**. If the user has no Supabase identity yet, the app uses Google once to establish the identity, then opens the passkey registration ceremony.
5. Sign out and test both buttons from the login page.

The server rejects external identities that are not in `external_auth_identities`, rejects inactive accounts, and never uses a matching member email to grant access.

The table and indexes are created automatically at startup when `RUN_STARTUP_SCHEMA_SETUP=true`. Existing accounts are intentionally not auto-linked; each link must be made while the corresponding local account is authenticated. After the first successful deployment, you may remove the variable if your deployment policy disables startup schema changes.
