# Deleting a user (Auth + profiles)

## Why login still works after deleting only from `profiles`

- **Supabase Auth** stores users in **`auth.users`**. Sign-in is validated against this table only.
- **`public.profiles`** is your app table. It is filled by a trigger when a user is created in `auth.users`.
- If you delete a row only from **`profiles`**, the row in **`auth.users`** remains, so the user can still sign in. The app will then try to load their profile, get no row, and (with the latest change) **sign them out** and treat them as logged out, so they cannot use the app.

So: deleting only from `profiles` does **not** remove the user from Auth; it only removes app data. The app now blocks use when the profile is missing.

---

## Why “Error deleting user” in Supabase Dashboard (Auth → Users)

Deleting a user from **Authentication → Users** can fail for a few reasons:

1. **Referential integrity**  
   Your schema has:
   - `profiles.id` → `auth.users(id) ON DELETE CASCADE`
   - `subscriptions.user_id` → `profiles(id) ON DELETE CASCADE`  
   So in theory, deleting from `auth.users` should cascade to `profiles` and then `subscriptions`. Sometimes the Dashboard or a transient constraint still blocks the delete.

2. **Dashboard / API limits**  
   The Dashboard may not support delete in all cases, or there can be a temporary error.

3. **Using the Admin API instead**  
   You can delete the user server-side with the **service role** key (never in the browser):

   ```js
   // Server-side or script only; use SUPABASE_SERVICE_ROLE_KEY
   const { error } = await supabase.auth.admin.deleteUser(userId);
   ```

   Run this from a backend, script, or Supabase Edge Function. The **Dashboard → SQL Editor** can also be used to delete from `auth.users` if your project allows it (some hosted projects restrict direct `auth.users` writes).

---

## Recommended way to fully remove a user

1. **Option A – Dashboard (if it works)**  
   - Delete the user from **Authentication → Users**.  
   - Cascades will remove the related `profiles` row (and then `subscriptions` if they exist).

2. **Option B – Delete app data first, then Auth**  
   - Delete or update any rows that depend on this user (e.g. `subscriptions` where `user_id` = profile id).  
   - Delete the row from **`profiles`** for that user.  
   - Then delete the user from **Authentication → Users** (or via `auth.admin.deleteUser(userId)` with the service role).

3. **Option C – Admin API (service role)**  
   - Call `supabase.auth.admin.deleteUser(userId)` from a secure backend/script.  
   - This removes the user from `auth.users`; with your schema, cascade will remove the corresponding `profiles` (and then `subscriptions`) row.

---

## Summary

| Action | Result |
|--------|--------|
| Delete only from `profiles` | User can still sign in to Auth; app now signs them out when profile is missing. |
| Delete from Auth (Dashboard or Admin API) | User can no longer sign in; cascade removes `profiles` (and dependent) rows. |
| App behavior when profile is missing | User is signed out and cannot use the app. |
