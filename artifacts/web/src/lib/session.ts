const TOKEN_KEY = "ap_token";
const DOOR_KEY = "ap_door";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export const getToken = (): string | null => read(TOKEN_KEY);
export const setToken = (token: string | null): void => write(TOKEN_KEY, token);

/** Which sign-in door this browser used last, so sign-out returns there. */
export const rememberDoor = (path: string): void => write(DOOR_KEY, path);
export const recallDoor = (): string | null => read(DOOR_KEY);

export function tokenExpiry(token: string | null = getToken()): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Impersonation: the super admin's own token is parked here while they are
// signed in as someone else, and restored when the session ends.
// ---------------------------------------------------------------------------

const IMP_RETURN_KEY = "ap_imp_return";

interface ImpersonationReturn {
  token: string;
  path: string;
}

/** Swap to the impersonation token, remembering the super admin's session and where to come back to. */
export function beginImpersonation(impersonationToken: string, returnPath: string): void {
  const own = getToken();
  if (own && !read(IMP_RETURN_KEY)) write(IMP_RETURN_KEY, JSON.stringify({ token: own, path: returnPath } satisfies ImpersonationReturn));
  setToken(impersonationToken);
}

export const isImpersonating = (): boolean => Boolean(read(IMP_RETURN_KEY));

/** Restore the super admin's own token. Returns where to send them, or null if nothing was parked. */
export function finishImpersonation(): string | null {
  const raw = read(IMP_RETURN_KEY);
  write(IMP_RETURN_KEY, null);
  if (!raw) return null;
  try {
    const parked = JSON.parse(raw) as ImpersonationReturn;
    setToken(parked.token);
    return parked.path || "/admin";
  } catch {
    setToken(null);
    return "/staff/login";
  }
}
