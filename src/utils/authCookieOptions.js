const {
  ACCESS_TOKEN,
  REFRESH_TOKEN,
  ACCESS_TOKEN_LIFETIME_MS,
} = require("../../resources/constants");

/**
 * Shared cookie options for auth (access + refresh tokens, cart_id).
 * In production: SameSite=None + Secure so the cookie is sent on cross-origin
 * requests. We keep access and refresh tokens in HttpOnly cookies only.
 */
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getAuthCookieName(clientType, kind) {
  const prefix = clientType === "dashboard" ? "dashboard_" : "";
  return kind === "access"
    ? `${prefix}${ACCESS_TOKEN}`
    : `${prefix}${REFRESH_TOKEN}`;
}

function getRequestClientType(req, fallback = "frontend") {
  return req.headers["x-client-type"] === "dashboard" ? "dashboard" : fallback;
}

function getAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    // SameSite=None required for cross-origin cookies (frontend and API on different origins)
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: ACCESS_TOKEN_LIFETIME_MS,
  };
}

function getRefreshCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
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
  getAuthCookieName,
  getRequestClientType,
  getAuthCookieOptions,
  getRefreshCookieOptions,
  getAuthCookieClearOptions,
  REFRESH_COOKIE_MAX_AGE_MS,
};
