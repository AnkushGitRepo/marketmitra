/** Whether the Clerk "client updated at" cookie says someone is signed in.
 *
 * Clerk sets `__client_uat` (readable by JS, unlike the session itself) to a
 * Unix timestamp when signed in and `0` when signed out; with suffixed cookies
 * enabled the name carries a `_<hash>` suffix. This is a UI hint only — it lets
 * the public pages pick a "Dashboard" vs "Get Started" button without loading
 * Clerk's JS. Real access control stays on the server (`/dashboard` is protected
 * in the proxy), so a forged cookie gains nothing. */
export function hasClerkSession(cookieString: string): boolean {
  return cookieString
    .split(';')
    .map((part) => part.trim())
    .some((part) => {
      const [name, value] = part.split('=');
      return /^__client_uat(_[A-Za-z0-9]+)?$/.test(name) && value !== undefined && value !== '0' && value !== '';
    });
}
