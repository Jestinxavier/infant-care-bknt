/**
 * Normalize a display name / username to camelCase.
 * "John Doe" -> "johnDoe", "  jOHN  dOE " -> "johnDoe".
 *
 * Usernames are stored camelCase everywhere: the admin create-user endpoint
 * (controllers/admin/adminUserController.js), the self-service profile update
 * (controllers/auth/updateProfile.js) and the seeding script
 * (scripts/createAdmin.js) all run values through this helper, so a name typed
 * as "John Doe" is persisted as "johnDoe" and rendered that way everywhere.
 */
const toCamelCase = (value) =>
  String(value || "")
    .trim()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((word, i) =>
      i === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join("");

module.exports = toCamelCase;
