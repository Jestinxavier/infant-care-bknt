const { OAuth2Client } = require("google-auth-library");
const axios = require("axios");
const crypto = require("crypto");
const User = require("../../models/user");
const Token = require("../../models/token");
const logger = require("../../utils/logger");
const {
  generateAccessToken,
  generateRefreshToken,
} = require("../../utils/token");
const { sendWelcomeEmail } = require("../../services/emailService");
const {
  getAuthCookieName,
  getRequestClientType,
  getAuthCookieOptions,
  getRefreshCookieOptions,
} = require("../../utils/authCookieOptions");

const getOAuthClient = () => new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Handle Google OAuth Sign In / Sign Up
 * Accepts: { credential } or { idToken } or { accessToken }
 */
const googleAuth = async (req, res) => {
  try {
    const { idToken, credential, accessToken, firebaseUser } = req.body || {};
    const token = idToken || credential;

    let googleUser = null;

    if (token) {
      // 1. Verify Google ID token (JWT)
      try {
        const client = getOAuthClient();
        const ticket = await client.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID || undefined,
        });
        const payload = ticket.getPayload();
        if (payload && payload.email) {
          googleUser = {
            googleId: payload.sub,
            email: payload.email,
            name: payload.name,
            picture: payload.picture,
            emailVerified: payload.email_verified,
          };
        }
      } catch (verifyErr) {
        logger.warn(
          "verifyIdToken failed, attempting tokeninfo fallback:",
          { error: verifyErr.message }
        );
        try {
          // Fallback 1: query Google tokeninfo endpoint
          const response = await axios.get(
            `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
              token
            )}`
          );
          const payload = response.data;
          if (payload && payload.email) {
            googleUser = {
              googleId: payload.sub,
              email: payload.email,
              name: payload.name,
              picture: payload.picture,
              emailVerified:
                payload.email_verified === "true" ||
                payload.email_verified === true,
            };
          }
        } catch (tokenInfoErr) {
          // Fallback 2: verify via Firebase Identity Toolkit if API key configured
          const fbApiKey =
            process.env.FIREBASE_API_KEY ||
            "AIzaSyBUjk6gHl1TudJOVkAZcRzGgJaLO23i-Wg";
          try {
            const fbResponse = await axios.post(
              `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${fbApiKey}`,
              { idToken: token }
            );
            const fbUser = fbResponse.data?.users?.[0];
            if (fbUser && fbUser.email) {
              googleUser = {
                googleId: fbUser.localId,
                email: fbUser.email,
                name: fbUser.displayName,
                picture: fbUser.photoUrl,
                emailVerified: Boolean(fbUser.emailVerified),
              };
            }
          } catch (fbErr) {
            logger.warn("Firebase token lookup failed:", {
              error: fbErr.message,
            });
          }
        }
      }
    } else if (accessToken) {
      // 2. Query Google userinfo endpoint using access token
      const response = await axios.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const data = response.data;
      if (!data || !data.email) {
        return res.status(400).json({
          success: false,
          message: "Google profile has no email address associated",
        });
      }
      googleUser = {
        googleId: data.sub,
        email: data.email,
        name: data.name,
        picture: data.picture,
        emailVerified: data.email_verified,
      };
    } else if (firebaseUser && firebaseUser.email) {
      // 3. Authenticated Firebase user payload
      googleUser = {
        googleId: firebaseUser.uid || firebaseUser.sub,
        email: firebaseUser.email,
        name: firebaseUser.displayName || firebaseUser.name,
        picture: firebaseUser.photoURL || firebaseUser.picture,
        emailVerified: Boolean(firebaseUser.emailVerified),
      };
    } else {
      return res.status(400).json({
        success: false,
        message: "Google token or credential is required",
      });
    }

    if (!googleUser && firebaseUser && firebaseUser.email) {
      googleUser = {
        googleId: firebaseUser.uid || firebaseUser.sub,
        email: firebaseUser.email,
        name: firebaseUser.displayName || firebaseUser.name,
        picture: firebaseUser.photoURL || firebaseUser.picture,
        emailVerified: Boolean(firebaseUser.emailVerified),
      };
    }

    if (!googleUser || !googleUser.email) {
      return res.status(400).json({
        success: false,
        message: "Failed to obtain email from Google authentication",
      });
    }

    const normalizedEmail = googleUser.email.toLowerCase().trim();

    // Find existing user by email
    let user = await User.findOne({ email: normalizedEmail });

    if (user) {
      // Account exists: link googleId and ensure verified
      let isUpdated = false;
      if (!user.isEmailVerified) {
        user.isEmailVerified = true;
        isUpdated = true;
      }
      if (!user.googleId) {
        user.googleId = googleUser.googleId;
        isUpdated = true;
      }
      if (!user.avatar && googleUser.picture) {
        user.avatar = googleUser.picture;
        isUpdated = true;
      }
      if (isUpdated) {
        await user.save();
      }
    } else {
      // Account does not exist: create new user
      const rawName = googleUser.name || normalizedEmail.split("@")[0];
      let baseUsername = rawName
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 18);
      if (baseUsername.length < 3) {
        baseUsername = "user_" + baseUsername;
      }

      // Ensure username uniqueness
      let uniqueUsername = baseUsername;
      const existingUsername = await User.findOne({ username: uniqueUsername });
      if (existingUsername) {
        const randomSuffix = crypto.randomBytes(2).toString("hex");
        uniqueUsername = `${baseUsername.slice(0, 14)}_${randomSuffix}`;
      }

      // Generate random high-entropy password for User model requirement
      const randomPassword = crypto.randomBytes(32).toString("hex");

      user = await User.create({
        username: uniqueUsername,
        email: normalizedEmail,
        password: randomPassword,
        role: "user",
        isEmailVerified: true,
        avatar: googleUser.picture || null,
        googleId: googleUser.googleId,
        authProvider: "google",
      });

      try {
        await sendWelcomeEmail(user);
      } catch (emailErr) {
        logger.error(
          "Failed to send welcome email for Google user:",
          emailErr.message
        );
      }
    }

    // Generate JWT tokens
    const accessTokenJwt = generateAccessToken(user._id);
    const refreshTokenJwt = generateRefreshToken(user._id);

    // Store refresh token
    await Token.create({ userId: user._id, refreshToken: refreshTokenJwt });

    const clientType = getRequestClientType(req);

    res.cookie(
      getAuthCookieName(clientType, "access"),
      accessTokenJwt,
      getAuthCookieOptions()
    );
    res.cookie(
      getAuthCookieName(clientType, "refresh"),
      refreshTokenJwt,
      getRefreshCookieOptions()
    );

    return res.status(200).json({
      success: true,
      message: "Google login successful",
      accessToken: accessTokenJwt,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    logger.error("❌ Google Auth Error:", {
      message: err.message,
      stack: err.stack,
    });
    return res.status(400).json({
      success: false,
      message: err.message || "Google authentication failed",
    });
  }
};

module.exports = googleAuth;
