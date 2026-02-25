# Email confirmation (signup) and custom SMTP

## Frontend (already in place)

- **Sign-up** calls `supabase.auth.signUp()` with `emailRedirectTo: ${origin}/auth` so the confirmation link in the email sends users to your app’s `/auth` page.
- **Session from link**: When the user clicks the link, Supabase redirects to `/auth` with the token in the URL. The client has `detectSessionInUrl: true`, so the session is created automatically.
- **After confirm**: If the user lands on `/auth` with a session and `type=signup` in the hash, the app redirects them to `/my-account`.

No further frontend change is required for “sending” the email; Supabase sends it server-side using your SMTP settings.

---

## Why the confirmation email might not arrive

If the email is not received, the cause is almost always **Supabase configuration or your SMTP**, not the frontend. Check the following in the **Supabase Dashboard**.

### 1. Custom SMTP (Project Settings → Auth → SMTP)

- **Enable Custom SMTP** is on.
- **Sender email** is a valid address from your domain (and not a no-reply that your provider blocks).
- **Sender name** is set if you want a friendly “From” name.
- **Host, port, username, password** match your SMTP provider (e.g. Gmail App Password, SendGrid, Mailgun). Use TLS/STARTTLS as required by the provider.
- **Test** or send a test email from the dashboard if the option exists.

### 2. Auth → Providers → Email

- **Confirm email** is enabled so Supabase sends a confirmation email on sign-up.
- If “Confirm email” is off, users are created without confirmation and no email is sent.

### 3. Redirect URLs (Auth → URL Configuration)

- **Site URL**: your app’s root (e.g. `https://yoursite.com`).
- **Redirect URLs**: add the exact URLs used as confirmation targets, e.g.:
  - `https://yoursite.com/auth` (sign-up and password reset)
  - `https://yoursite.com/my-account` (email change confirmation)
  - `http://localhost:5173/auth` and `http://localhost:5173/my-account` (for local testing)

If the confirmation link’s URL is not in **Redirect URLs**, Supabase may not redirect there and the flow can fail.

### 4. Logs and spam

- **Auth → Logs**: check for failed sign-ups or auth errors.
- **Email / SMTP logs**: if your provider has logs, check for bounces or blocks.
- Ask the user to check **spam/junk** and that the address is correct.

---

## Summary

| Item | Where | What to check |
|------|--------|----------------|
| Custom SMTP | Project Settings → Auth → SMTP | Enabled, correct host/port/user/pass, sender email valid |
| Confirm email | Auth → Providers → Email | “Confirm email” enabled |
| Redirect URLs | Auth → URL Configuration | Include `https://your-domain.com/auth` (and localhost for dev) |
| Frontend | This app | `emailRedirectTo` set to `/auth`; no change needed to “send” the email |

Once SMTP and Auth settings are correct, sign-up will send the confirmation email and the link will bring the user to `/auth`, then to My Account after confirmation.

---

## Email change (profile)

Users can change their email from **My Account → Profile → Edit**. The app calls `supabase.auth.updateUser({ email: newEmail })`, which sends a confirmation link to the **new** email. After the user clicks that link, Supabase updates `auth.users.email`. The migration `20260224_sync_auth_email_to_profiles.sql` adds a trigger so `public.profiles.email` is updated at the same time. Ensure **Redirect URLs** includes your app’s `/my-account` URL (see above) so the email-change confirmation link works.
