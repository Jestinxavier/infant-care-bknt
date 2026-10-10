const jwt = require("jsonwebtoken");
const SiteSetting = require("../models/SiteSetting");
const User = require("../models/user");
const ApiError = require("../core/ApiError");
const logger = require("../utils/logger");
const { cacheGet, cacheSet, cacheDel } = require("../utils/redisCache");
const { triggerRevalidation } = require("./revalidateService");
const { getTokenFromRequest } = require("../middlewares/authMiddleware");
const {
  SITE_SETTING_KEYS,
  getSiteSettingDefinition,
} = require("../config/siteSettingRegistry");
const { ADMIN_ROLES } = require("../../resources/constants");

const MAINTENANCE_SCOPE = "maintenance";
const CACHE_KEY = "maintenance:state";
// Safety-net TTL; the cache is explicitly invalidated whenever settings change.
const CACHE_TTL_SECONDS = 60;
// Per-process fallback so a Redis outage does not hit MongoDB on every request.
const MEMORY_TTL_MS = 3000;
const FAIL_OPEN = process.env.MAINTENANCE_FAIL_OPEN !== "false";

const DEFAULT_TITLE =
  getSiteSettingDefinition(SITE_SETTING_KEYS.MAINTENANCE_TITLE)?.defaultValue ||
  "We'll be back soon";
const DEFAULT_MESSAGE =
  getSiteSettingDefinition(SITE_SETTING_KEYS.MAINTENANCE_MESSAGE)?.defaultValue ||
  "Our store is temporarily unavailable while we make some improvements.";

const TITLE_MAX_LENGTH = 160;
const MESSAGE_MAX_LENGTH = 1000;
const RETRY_AFTER_FALLBACK_SECONDS = 3600;

let memoryCache = null;
// Tracks the last reopenAt we auto-disabled, so we persist/notify only once.
let autoDisabledFor = null;

const isReopenPassed = (reopenAt) => {
  if (!reopenAt) return false;
  const ts = new Date(reopenAt).getTime();
  return !Number.isNaN(ts) && ts <= Date.now();
};

const buildState = (docs = []) => {
  const map = docs.reduce((acc, doc) => {
    acc[doc.key] = doc.value;
    return acc;
  }, {});

  const rawReopenAt = map[SITE_SETTING_KEYS.MAINTENANCE_REOPEN_AT];
  const reopenAt =
    rawReopenAt && !Number.isNaN(new Date(rawReopenAt).getTime())
      ? new Date(rawReopenAt).toISOString()
      : null;

  const latestUpdatedAt = docs.reduce((latest, doc) => {
    const ts = doc.updatedAt ? new Date(doc.updatedAt).getTime() : 0;
    return ts > latest ? ts : latest;
  }, 0);

  return {
    enabled: map[SITE_SETTING_KEYS.MAINTENANCE_ENABLED] === true,
    title:
      typeof map[SITE_SETTING_KEYS.MAINTENANCE_TITLE] === "string" &&
      map[SITE_SETTING_KEYS.MAINTENANCE_TITLE].trim()
        ? map[SITE_SETTING_KEYS.MAINTENANCE_TITLE].trim()
        : DEFAULT_TITLE,
    message:
      typeof map[SITE_SETTING_KEYS.MAINTENANCE_MESSAGE] === "string" &&
      map[SITE_SETTING_KEYS.MAINTENANCE_MESSAGE].trim()
        ? map[SITE_SETTING_KEYS.MAINTENANCE_MESSAGE].trim()
        : DEFAULT_MESSAGE,
    reopenAt,
    updatedAt: latestUpdatedAt > 0 ? new Date(latestUpdatedAt).toISOString() : null,
  };
};

const fallbackState = () => ({
  enabled: !FAIL_OPEN,
  title: DEFAULT_TITLE,
  message: DEFAULT_MESSAGE,
  reopenAt: null,
  updatedAt: null,
});

/**
 * Resolve the current maintenance state.
 * Order: in-process cache -> Redis -> MongoDB. Never throws; degrades to a
 * fail-open (or fail-closed, if MAINTENANCE_FAIL_OPEN=false) default.
 */
const getMaintenanceState = async () => {
  const now = Date.now();
  let state;

  if (memoryCache && memoryCache.expiresAt > now) {
    state = memoryCache.state;
  } else {
    state = await cacheGet(CACHE_KEY);
    if (!state || typeof state !== "object") {
      try {
        const docs = await SiteSetting.find({ scope: MAINTENANCE_SCOPE })
          .select({ _id: 0, key: 1, value: 1, updatedAt: 1 })
          .lean();
        state = buildState(docs);
        await cacheSet(CACHE_KEY, state, CACHE_TTL_SECONDS);
      } catch (err) {
        logger.error("[Maintenance] Failed to load state from DB", {
          message: err.message,
        });
        state = fallbackState();
      }
    }
  }

  // Auto-disable once the expected reopen time has passed. Applied on every
  // read (even cached state) so recovery is immediate; the DB write + frontend
  // revalidation happen only once per reopen timestamp.
  if (state && state.enabled && isReopenPassed(state.reopenAt)) {
    state = { ...state, enabled: false };
    if (autoDisabledFor !== state.reopenAt) {
      autoDisabledFor = state.reopenAt;
      try {
        await upsertSetting(SITE_SETTING_KEYS.MAINTENANCE_ENABLED, false);
      } catch (err) {
        logger.error("[Maintenance] Failed to persist auto-disable", {
          message: err.message,
        });
      }
      triggerRevalidation({
        type: "settings",
        resource: "maintenance",
        tag: "settings:maintenance",
      });
    }
    await cacheSet(CACHE_KEY, state, CACHE_TTL_SECONDS);
  }

  memoryCache = { state, expiresAt: now + MEMORY_TTL_MS };
  return state;
};

const invalidateMaintenanceCache = async () => {
  memoryCache = null;
  await cacheDel(CACHE_KEY);
};

/** Internal testing helper. */
const _resetMaintenanceCache = () => {
  memoryCache = null;
  autoDisabledFor = null;
};

const computeRetryAfter = (reopenAt) => {
  if (!reopenAt) return RETRY_AFTER_FALLBACK_SECONDS;
  const diff = new Date(reopenAt).getTime() - Date.now();
  if (Number.isNaN(diff) || diff <= 0) return RETRY_AFTER_FALLBACK_SECONDS;
  return Math.max(60, Math.ceil(diff / 1000));
};

/**
 * Verify that the request carries a valid access token belonging to an admin.
 * Only used for the staff bypass; the role is always read from the database.
 */
const resolveStaffBypass = async (req) => {
  try {
    const token = getTokenFromRequest(req, "access");
    if (!token) return false;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.id) return false;

    const user = await User.findById(decoded.id).select("role").lean();
    return !!user && ADMIN_ROLES.includes(user.role);
  } catch {
    return false;
  }
};

const validateMaintenanceInput = (payload = {}) => {
  const errors = [];
  const value = {};

  if (payload.enabled !== undefined) {
    if (typeof payload.enabled !== "boolean") {
      errors.push({ field: "enabled", message: "enabled must be a boolean" });
    } else {
      value.enabled = payload.enabled;
    }
  }

  if (payload.title !== undefined) {
    if (typeof payload.title !== "string") {
      errors.push({ field: "title", message: "title must be a string" });
    } else if (payload.title.trim().length > TITLE_MAX_LENGTH) {
      errors.push({
        field: "title",
        message: `title must be ${TITLE_MAX_LENGTH} characters or fewer`,
      });
    } else {
      value.title = payload.title.trim();
    }
  }

  if (payload.message !== undefined) {
    if (typeof payload.message !== "string") {
      errors.push({ field: "message", message: "message must be a string" });
    } else if (payload.message.trim().length > MESSAGE_MAX_LENGTH) {
      errors.push({
        field: "message",
        message: `message must be ${MESSAGE_MAX_LENGTH} characters or fewer`,
      });
    } else {
      value.message = payload.message.trim();
    }
  }

  if (payload.reopenAt !== undefined) {
    if (
      payload.reopenAt === null ||
      payload.reopenAt === "" ||
      payload.reopenAt === undefined
    ) {
      value.reopenAt = "";
    } else if (
      typeof payload.reopenAt !== "string" ||
      Number.isNaN(new Date(payload.reopenAt).getTime())
    ) {
      errors.push({
        field: "reopenAt",
        message: "reopenAt must be a valid date or empty",
      });
    } else {
      value.reopenAt = new Date(payload.reopenAt).toISOString();
    }
  }

  if (Object.keys(value).length === 0 && errors.length === 0) {
    errors.push({ field: "body", message: "No maintenance fields provided" });
  }

  return { errors, value };
};

const upsertSetting = (key, value) => {
  const definition = getSiteSettingDefinition(key);
  return SiteSetting.findOneAndUpdate(
    { key },
    {
      $set: {
        value,
        type: definition?.type || "string",
        scope: MAINTENANCE_SCOPE,
        description: definition?.description || "",
        isPublic: true,
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
};

const updateMaintenanceSettings = async (payload = {}) => {
  const { errors, value } = validateMaintenanceInput(payload);
  if (errors.length) {
    throw ApiError.validation("Invalid maintenance settings", errors);
  }

  if (value.enabled !== undefined) {
    await upsertSetting(SITE_SETTING_KEYS.MAINTENANCE_ENABLED, value.enabled);
  }
  if (value.title !== undefined) {
    await upsertSetting(
      SITE_SETTING_KEYS.MAINTENANCE_TITLE,
      value.title || DEFAULT_TITLE
    );
  }
  if (value.message !== undefined) {
    await upsertSetting(
      SITE_SETTING_KEYS.MAINTENANCE_MESSAGE,
      value.message || DEFAULT_MESSAGE
    );
  }
  if (value.reopenAt !== undefined) {
    await upsertSetting(SITE_SETTING_KEYS.MAINTENANCE_REOPEN_AT, value.reopenAt);
  }

  await invalidateMaintenanceCache();
  triggerRevalidation({ type: "settings", resource: "maintenance", tag: "settings:maintenance" });

  return getMaintenanceState();
};

const toPublicPayload = (state, staffBypass = false) => ({
  enabled: !!state.enabled,
  title: state.title,
  message: state.message,
  reopenAt: state.reopenAt || null,
  updatedAt: state.updatedAt || null,
  staffBypass: !!staffBypass,
});

module.exports = {
  MAINTENANCE_SCOPE,
  getMaintenanceState,
  invalidateMaintenanceCache,
  updateMaintenanceSettings,
  resolveStaffBypass,
  toPublicPayload,
  computeRetryAfter,
  validateMaintenanceInput,
  _resetMaintenanceCache,
};
