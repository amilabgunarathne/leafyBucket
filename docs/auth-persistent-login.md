# Persistent Login (Remember Me) – Double-Token Strategy

Leafy Bucket uses a **double-token** approach so users can stay signed in across sessions when they choose "Remember me".

## How It Works

1. **Access token (short-lived)**  
   Supabase issues a JWT that expires in 15–60 minutes (configurable in the Dashboard). The app uses this for API calls.

2. **Refresh token (long-lived)**  
   A separate token (e.g. 30 days) is stored and used to obtain a new access token when the current one expires.

3. **Remember Me**  
   - **Checked (default):** Session is stored in `localStorage`. The user stays signed in across browser restarts until the refresh token expires or they log out.  
   - **Unchecked:** Session is stored in `sessionStorage`. The user is signed out when the tab/browser is closed.

4. **Auto refresh**  
   The Supabase client has `autoRefreshToken: true`. When the access token expires, the client uses the refresh token to get a new session in the background (no re-login).

5. **Token rotation (optional)**  
   Supabase can be configured to issue a new refresh token each time one is used, so active users keep extending their session. Configure this in the Supabase Dashboard if desired.

## Supabase Dashboard Configuration

To align with the above behaviour, set these in **Supabase Dashboard → Authentication → Settings**:

- **JWT expiry:** e.g. **3600** (1 hour) or **900** (15 minutes) for the access token.
- **Refresh token lifetime:** e.g. **2592000** (30 days in seconds) so "Remember me" can last ~30 days.
- **Refresh token reuse interval:** Optional. A short interval (e.g. 10 seconds) helps with rotation: each use within the interval reuses the same token; after that a new one can be issued.

The app does not send these values from the client; they are enforced by Supabase Auth.

## Implementation Details

- **Storage:** `src/lib/supabase.ts` uses a custom auth storage that reads a `leafy_remember_me` flag and delegates to `localStorage` (remember) or `sessionStorage` (session-only).
- **Login/Signup:** The "Remember me" checkbox is on the Auth page; its value is passed to `login()` and `signup()` and the flag is set before calling Supabase so the session is written to the correct storage.
- **Logout:** Clears session from both storages and clears the user state.
