# STICHA — Supabase Authentication Edition

This version keeps the existing STICHA workspace and adds a cleaner production-style authentication flow.

## Authentication behavior

- Existing users sign in with email + password.
- New users create an account with:
  - Full name
  - Business name
  - Email
  - Password
- After successful signup, the user enters their workspace immediately.
- A new account starts with an **empty workspace**.
- The business name is used throughout the header/workspace instead of a hard-coded personal name.
- Sessions are restored automatically when the user returns.
- Sign out clears the active local workspace from memory.
- Password visibility toggle is included.
- Password reset is included.
- Friendly authentication errors are shown without exposing technical details.

## IMPORTANT: turn off email confirmation

The requested STICHA flow is immediate signup → workspace, with no email-confirmation step.

In Supabase:
1. Open your STICHA project.
2. Go to **Authentication → Providers → Email**.
3. Turn **Confirm email** OFF.
4. Save.

Supabase controls email confirmation on the server, so a frontend cannot safely bypass that setting. With confirmation disabled, `signUp()` returns an active session and STICHA sends the new user directly into their workspace.

## Security

- The browser uses only the Supabase publishable/anon key.
- Never put a `service_role` or secret key in `supabase-config.js`.
- Keep Row Level Security enabled in the database.
- The `profiles` table is tied to `auth.users`.

## Files

- `supabase-config.js` — Supabase project URL + browser-safe publishable key.
- `supabase-client.js` — creates the Supabase browser client.
- `SUPABASE_SCHEMA.sql` — database tables and RLS policies.
- `app.js` — authentication/session/workspace logic.
- `index.html` — authentication UI.
- `style.css` — responsive authentication animations and existing STICHA styles.

## Run

Use VS Code Live Server or another local web server. Do not open `index.html` directly with `file://`.

After the Supabase project is configured, test:
1. Sign up with a new email.
2. Confirm that STICHA opens the workspace immediately.
3. Confirm the workspace is empty.
4. Sign out.
5. Sign in with the same email/password.
6. Confirm the same business name appears.
7. Create a customer.
8. Sign out and sign back in.
9. Confirm the account's data remains associated with that account.

## Important next integration

Authentication is now separated cleanly from the local measurement data. The next development step is to connect customers, measurements, orders and customer photos to Supabase tables/storage with RLS and offline synchronization.

## New in this build — Cloud records + profile

This build now connects the authenticated workspace to Supabase for:
- Customer records
- Order price, amount paid, balance/status fields
- Measurement sets and measurement history
- Customer photos
- Tailor full name, business name and profile picture
- Cloud restore when the user signs back in

### Supabase setup required
1. Run the complete `SUPABASE_SCHEMA.sql` in Supabase SQL Editor. The schema includes the `profiles`, `customers`, `measurements` tables, RLS policies, and the `profile-avatars` / `customer-photos` Storage buckets.
2. Keep RLS enabled.
3. In Authentication → Providers → Email, turn **Confirm email OFF** if you want signup to open the workspace immediately.
4. Put your Supabase project URL and anon/publishable key in `supabase-config.js`.
5. Do **not** put a Supabase service-role/secret key in this frontend.

### Profile
Click the profile/business name at the top-right. You can change the business name, full name and profile picture at any time. The updated profile appears in the top-right instead of the default letter icon.

### Sign out / return
Signing out remembers the last signed-in email on that device. When STICHA returns to the sign-in screen, the email is already filled in; the user only needs to enter the password.

### Offline behavior
STICHA still keeps the local workspace in IndexedDB/localStorage. When the browser is online and Supabase is configured, saved customer/order/measurement data is synced to the authenticated user's cloud workspace.

## New in this build — real deletion + stronger offline mode

- Deleting a customer now deletes the customer's Supabase record and measurement history (via the customer relationship), and removes the matching customer photo from Storage when online.
- If a customer is deleted while offline, the deletion is queued locally and is sent to Supabase automatically when the device reconnects.
- Changes made while offline stay in IndexedDB/local storage and are synced automatically when the connection returns.
- Customer photos selected while offline are kept locally and uploaded when the connection returns.
- STICHA renders the local workspace first, so returning users can get into the app quickly while queued cloud synchronization happens in the background.
- The service worker now caches the STICHA app shell and the Supabase browser library for better offline reload behavior after the app has been opened online at least once.

### Important offline limitation

Offline mode is designed for an already signed-in user. A brand-new user cannot create an account or authenticate against Supabase with no internet connection. Once signed in on a device, the existing workspace can continue to be used offline and will sync when internet returns.
