# Signup email verification

New website accounts now use Supabase Auth's public `signUp` API. They receive an email code and must verify it in Pixgin before an application session is issued. Existing accounts are not retroactively blocked. The admin `createUser` helper remains only for legacy migration scripts; do not use it for website signup.

## Required hosted Supabase settings (before releasing this change)

1. In your Supabase project, open **Authentication → Sign In / Providers → Email** (the dashboard may label this Providers). Keep Email enabled and turn **Confirm email** ON. Save. Do not disable confirmation to work around delivery failures.
2. Open **Authentication → Email → Templates → Confirm signup**. Set the subject to `Kode verifikasi akun Pixgin`. Paste the entire contents of [templates/confirm-signup.html](templates/confirm-signup.html) into the template body and save. The `{{ .Token }}` placeholder is essential: the default confirmation-link-only template is not compatible with the in-app code screen. Use a 6–8 digit email OTP; the app accepts either length and Supabase enforces its configured expiry.
3. Under **Authentication → Email → SMTP Settings**, configure a custom SMTP provider and a verified sender address/domain. Supabase's built-in email service restricts recipients to project organization team members and has very low rate limits; it is not sufficient for public signup. Keep SMTP credentials only in Supabase, never in browser code or Git.
4. In **Authentication → URL Configuration**, set Site URL to your real Pixgin origin (for example `https://pix-dit.vercel.app`). This code-entry flow does not use a browser access-token callback or confirmation link.
5. Review Supabase's email OTP expiry and email rate limits for your traffic. Pixgin also limits verification attempts to 10 per email and 30 per IP per 15 minutes; resend is limited to once per minute, five times per email/hour, and ten per IP/hour. The initial signup also starts the resend cooldown. Limits are conservative because free accounts consume credits.

No SQL migration, new table, additional Vercel environment variable, or paid image generation is required. Existing `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SECRET_KEY` are reused. Pending status is stored in the existing application JSON document; Supabase Auth manages the actual codes and email confirmation. Do not edit auth users or mark pending profiles verified manually as part of deployment.

## Smoke check after configuration

- Sign up with a **new email you own**, check inbox/spam, and confirm Pixgin shows the code screen without entering the app. This creates a real Auth account and sends mail, so do it deliberately, not in automated CI.
- A wrong code must fail; the correct code must enter the app. Reusing it must fail. Reopening the site still requires login, as before.
- Returning to login with an unverified email/password opens the code screen again; use **Kirim ulang kode** after the cooldown. Do not register a duplicate account to request another code.
- Existing accounts must still log in normally. A Free user selecting Agent Pro should see the dark Pixgin upgrade modal. Clicking Template should show a dark purple notification, not a light green toast.
- If signup returns `verification_not_configured`, enable Confirm email before accepting more signups. No app session is granted when confirmation is disabled. An account created while auto-confirm was enabled can remain blocked: Supabase may not send a signup code to an already-confirmed Auth user. Ask the administrator to review that specific pending account; do not mark its application profile verified to bypass verification. Configure the settings before release to avoid this case. If mail fails, check Supabase Auth logs, SMTP sender verification, recipient restrictions, spam, and rate limits; changing Replicate settings cannot fix email delivery.

Local automated tests run with `NODE_ENV=test` and an isolated in-memory Auth adapter. Its fixed test-only code is `123456`; this code is never accepted by the real Supabase adapter or returned by the production API. Automated tests mock Supabase and do not send email or change production data. Real email delivery has to be checked after dashboard configuration.

References: [Email templates and OTP](https://supabase.com/docs/guides/auth/auth-email-templates), [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp), [resend](https://supabase.com/docs/reference/javascript/auth-resend), [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
