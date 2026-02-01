/**
 * Shared cookie options for auth (refresh token, cart_id).
 * In production: SameSite=None + Secure so the cookie is sent on cross-origin
 * requests (e.g. frontend on Vercel, API on Railway). Without this, the
 * refresh cookie is not sent and /auth/refresh returns "Invalid refresh token"
 * or "No refresh token provided".
 */
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    // SameSite=None required for cross-origin cookies (frontend and API on different origins)
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  };
}

function getAuthCookieClearOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  };
}

module.exports = {
  getAuthCookieOptions,
  getAuthCookieClearOptions,
  REFRESH_COOKIE_MAX_AGE_MS,
};
