// controllers/admin/adminUserController.js
// Management of admin/super-admin/developer user accounts.
// Guards:
//   - The last active super-admin can never be demoted, suspended or deleted.
//   - Actors cannot change/suspend/delete their own account via this API.

const mongoose = require("mongoose");
const User = require("../../models/user");
const AdminAuditLog = require("../../models/AdminAuditLog");
const { ADMIN_ROLES } = require("../../../resources/constants");
const { sendAdminCredentialsEmail } = require("../../services/emailService");
const logger = require("../../utils/logger");
const toCamelCase = require("../../utils/toCamelCase");
const escapeRegex = require("../../utils/escapeRegex");
const { cacheDel } = require("../../utils/redisCache");

const SENSITIVE_FIELDS = "-password -emailOTP -emailOTPExpires -resetPasswordToken -resetPasswordExpires";

/** Strip auth/sensitive fields before returning a user to the client. */
const sanitizeUser = (u) => {
  if (!u) return null;
  const doc = u.toObject ? u.toObject() : u;
  return {
    _id: doc._id,
    username: doc.username,
    email: doc.email,
    phone: doc.phone || null,
    role: doc.role,
    active: doc.active,
    isEmailVerified: doc.isEmailVerified,
    avatar: doc.avatar || null,
    createdAt: doc.createdAt,
  };
};

/** Secure random password — same recipe as scripts/createAdmin.js. */
const generateSecurePassword = (length = 12) => {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const symbols = "!@#$%^&*";
  const allChars = uppercase + lowercase + numbers + symbols;
  let password = "";
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
};

/** Append an entry to the admin audit trail. */
const writeAudit = async ({
  actor,
  action,
  target,
  details = null,
}) => {
  try {
    await AdminAuditLog.create({
      actorId: actor.id,
      actorUsername: actor.username,
      actorRole: actor.role,
      action,
      targetId: target.id,
      targetUsername: target.username,
      targetRole: target.role || null,
      details,
    });
  } catch (error) {
    logger.error("writeAudit failed", { message: error.message });
  }
};

/** Count active super-administrators (used for the last-super-admin guard). */
const countActiveSuperAdmins = () =>
  User.countDocuments({ role: "super-admin", active: true });

/**
 * Guard: can't demote, suspend, or delete the last active super-admin.
 * Also can't suspend/delete/demote yourself.
 */
const assertSafeChange = async ({ actor, target, nextRole, nextActive }) => {
  const roleChanging =
    nextRole && String(nextRole) !== String(target.role);
  const suspending = nextActive === false && target.active !== false;

  if (!roleChanging && !suspending) return;

  const isTargetSuperAdmin = target.role === "super-admin";
  const turningOffSuperAdmin =
    isTargetSuperAdmin && (roleChanging || suspending);

  if (turningOffSuperAdmin) {
    const activeSuperAdmins = await countActiveSuperAdmins();
    if (activeSuperAdmins <= 1) {
      const err = new Error(
        "Cannot change or disable the last active super administrator."
      );
      err.status = 400;
      throw err;
    }
  }

  if (String(target._id) === String(actor.id)) {
    const err = new Error(
      "You cannot change the role or disable your own account."
    );
    err.status = 400;
    throw err;
  }
};

/**
 * GET /api/v1/admin/users
 * List admin-role users (admin, super-admin, developer) with pagination.
 */
const getAdminUsers = async (req, res) => {
  try {
    const { page = 1, limit = 30, search } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const filter = { role: { $in: ADMIN_ROLES } };
    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { username: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select(SENSITIVE_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(filter),
    ]);

    // Accounts created before the `active` field existed have no stored value.
    // Missing field -> active (schema default).
    const normalized = users.map((u) => ({ ...u, active: u.active ?? true }));

    return res.status(200).json({
      success: true,
      data: normalized,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      meta: {
        superAdminCount: await countActiveSuperAdmins(),
      },
    });
  } catch (error) {
    logger.error("getAdminUsers failed", { message: error.message });
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch admin users",
    });
  }
};

/**
 * POST /api/v1/admin/users
 * Create a new admin/super-admin/developer account with a generated password.
 */
const createAdminUser = async (req, res) => {
  try {
    const { username, email, phone, role } = req.body || {};

    if (!username || !email || !role) {
      return res.status(400).json({
        success: false,
        message: "username, email and role are required",
      });
    }
    if (!ADMIN_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `role must be one of: ${ADMIN_ROLES.join(", ")}`,
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const normalizedUsername = toCamelCase(username);

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists",
      });
    }

    const password = generateSecurePassword(16);
    const user = await User.create({
      username: normalizedUsername,
      email: normalizedEmail,
      phone: phone || undefined,
      role,
      password, // hashed by the pre-save hook
      isEmailVerified: true,
      active: true,
    });

    // Best-effort credential delivery; never fail account creation on SMTP failure.
    try {
      await sendAdminCredentialsEmail(
        { email: user.email, username: user.username },
        password
      );
    } catch (emailError) {
      logger.error("createAdminUser email send failed", {
        message: emailError.message,
        email: user.email,
      });
    }

    await writeAudit({
      actor: req.user,
      action: "create",
      target: user,
      details: { role },
    });

    return res.status(201).json({
      success: true,
      message: "Admin user created. Credentials were emailed.",
      data: sanitizeUser(user),
    });
  } catch (error) {
    // Duplicate-key race on username/email
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A user with this username or email already exists",
      });
    }
    logger.error("createAdminUser failed", { message: error.message });
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create admin user",
    });
  }
};

/**
 * PATCH /api/v1/admin/users/:id
 * Change role and/or toggle active (suspend/activate) with safety guards.
 */
const updateAdminUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, active } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }
    if (role !== undefined && !ADMIN_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `role must be one of: ${ADMIN_ROLES.join(", ")}`,
      });
    }
    if (role === undefined && active === undefined) {
      return res.status(400).json({
        success: false,
        message: "Provide role and/or active to update",
      });
    }

    const target = await User.findById(id);
    if (!target || !ADMIN_ROLES.includes(target.role)) {
      return res.status(404).json({
        success: false,
        message: "Admin user not found",
      });
    }

    await assertSafeChange({
      actor: req.user,
      target,
      nextRole: role,
      nextActive: active,
    });

    const update = {};
    let action = null;
    let details = null;

    if (role !== undefined && String(role) !== String(target.role)) {
      update.role = role;
      action = "update_role";
      details = { from: target.role, to: role };
    }
    if (active !== undefined && target.active !== active) {
      update.active = active;
      action = active ? "activate" : "suspend";
      details = { ...(details || {}), from: target.active, to: active };
    }

    const updated = await User.findByIdAndUpdate(
      id,
      update,
      { new: true, runValidators: true }
    );

    // Role/active changed — drop the cached admin identity so the change takes
    // effect on the next request instead of waiting out the middleware TTL.
    await cacheDel(`admin:identity:${id}`);

    if (action) {
      await writeAudit({
        actor: req.user,
        action,
        target: updated,
        details,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Admin user updated",
      data: sanitizeUser(updated),
    });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    logger.error("updateAdminUser failed", { message: error.message });
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update admin user",
    });
  }
};

/**
 * DELETE /api/v1/admin/users/:id
 * Remove an admin account (never yourself, never the last super-admin).
 */
const deleteAdminUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const target = await User.findById(id);
    if (!target || !ADMIN_ROLES.includes(target.role)) {
      return res.status(404).json({
        success: false,
        message: "Admin user not found",
      });
    }

    if (String(target._id) === String(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account.",
      });
    }

    if (target.role === "super-admin") {
      const activeSuperAdmins = await countActiveSuperAdmins();
      if (activeSuperAdmins <= 1) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete the last active super administrator.",
        });
      }
    }

    await User.findByIdAndDelete(id);

    // Drop the cached admin identity for the removed account.
    await cacheDel(`admin:identity:${id}`);

    await writeAudit({
      actor: req.user,
      action: "delete",
      target,
      details: { role: target.role },
    });

    return res.status(200).json({
      success: true,
      message: "Admin user deleted",
    });
  } catch (error) {
    logger.error("deleteAdminUser failed", { message: error.message });
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete admin user",
    });
  }
};

/**
 * GET /api/v1/admin/users/audit
 * Recent admin-user audit trail (denormalized actor/target usernames).
 */
const getAdminUserAudit = async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const entries = await AdminAuditLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      data: entries,
    });
  } catch (error) {
    logger.error("getAdminUserAudit failed", { message: error.message });
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch audit trail",
    });
  }
};

module.exports = {
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  getAdminUserAudit,
};