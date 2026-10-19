const { ACCESS_TOKEN } = require("../../resources/constants");

/**
 * Logins/registrations set tokens as httpOnly cookies and no longer return
 * `accessToken` in the response body. Extract the access token from the
 * `Set-Cookie` header so tests can keep sending it as an
 * `Authorization: Bearer <token>` header (the middleware accepts both).
 *
 * @param {import("supertest").Response} res supertest response with set-cookie
 * @returns {string|null} access token or null when the cookie is absent
 */
function extractAccessToken(res) {
  const cookies = res.headers["set-cookie"] || [];
  const prefix = `${ACCESS_TOKEN}=`;
  const match = cookies.find((cookie) => cookie.split(";")[0].startsWith(prefix));
  if (!match) return null;

  const raw = match.split(";")[0].slice(prefix.length);
  try {
    return decodeURIComponent(raw);
  } catch (error) {
    return raw;
  }
}

module.exports = { extractAccessToken };