const googleAuth = require("../../src/controllers/auth/googleAuth");
const User = require("../../src/models/user");
const Token = require("../../src/models/token");
const { OAuth2Client } = require("google-auth-library");
const axios = require("axios");

// Mock dependencies
jest.mock("../../src/models/user");
jest.mock("../../src/models/token");
jest.mock("google-auth-library");
jest.mock("axios");
jest.mock("../../src/services/emailService", () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
}));

describe("Google Auth Controller", () => {
  let req, res;
  let mockVerifyIdToken;

  beforeEach(() => {
    req = {
      body: {},
      headers: {},
      cookies: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
    };
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret";

    mockVerifyIdToken = jest.fn().mockImplementation(async ({ idToken }) => {
      if (idToken === "valid_id_token") {
        return {
          getPayload: () => ({
            sub: "google-123456",
            email: "test.google@example.com",
            name: "Google User",
            picture: "https://lh3.googleusercontent.com/photo.jpg",
            email_verified: true,
          }),
        };
      }
      throw new Error("Invalid token signature");
    });

    OAuth2Client.mockImplementation(() => ({
      verifyIdToken: mockVerifyIdToken,
    }));
  });

  it("should return 400 if no token or credential is provided", async () => {
    req.body = {};
    await googleAuth(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Google token or credential is required",
      })
    );
  });

  it("should authenticate and create a new user when user does not exist", async () => {
    req.body = { idToken: "valid_id_token" };

    User.findOne.mockImplementation(({ email, username }) => {
      if (email) return Promise.resolve(null);
      if (username) return Promise.resolve(null);
      return Promise.resolve(null);
    });

    const mockCreatedUser = {
      _id: "507f1f77bcf86cd799439011",
      username: "google_user",
      email: "test.google@example.com",
      role: "user",
      isEmailVerified: true,
      avatar: "https://lh3.googleusercontent.com/photo.jpg",
    };
    User.create.mockResolvedValue(mockCreatedUser);
    Token.create.mockResolvedValue({});

    await googleAuth(req, res);

    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "test.google@example.com",
        isEmailVerified: true,
        authProvider: "google",
        googleId: "google-123456",
      })
    );
    expect(res.cookie).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Google login successful",
        user: expect.objectContaining({
          email: "test.google@example.com",
        }),
      })
    );
  });

  it("should authenticate and link existing user by email", async () => {
    req.body = { credential: "valid_id_token" };

    const mockExistingUser = {
      _id: "507f1f77bcf86cd799439022",
      username: "existing_user",
      email: "test.google@example.com",
      role: "user",
      isEmailVerified: false,
      googleId: null,
      avatar: null,
      save: jest.fn().mockResolvedValue(true),
    };

    User.findOne.mockImplementation(({ email }) => {
      if (email === "test.google@example.com") {
        return Promise.resolve(mockExistingUser);
      }
      return Promise.resolve(null);
    });
    Token.create.mockResolvedValue({});

    await googleAuth(req, res);

    expect(mockExistingUser.isEmailVerified).toBe(true);
    expect(mockExistingUser.googleId).toBe("google-123456");
    expect(mockExistingUser.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        user: expect.objectContaining({
          username: "existing_user",
          email: "test.google@example.com",
        }),
      })
    );
  });

  it("should authenticate using access token and userinfo endpoint", async () => {
    req.body = { accessToken: "ya29.sample_access_token" };

    axios.get.mockResolvedValueOnce({
      data: {
        sub: "google-987654",
        email: "oauth.access@example.com",
        name: "Access Token User",
        picture: "https://lh3.googleusercontent.com/access_photo.jpg",
        email_verified: true,
      },
    });

    const mockCreatedUser = {
      _id: "507f1f77bcf86cd799439033",
      username: "accesstoken_user",
      email: "oauth.access@example.com",
      role: "user",
      isEmailVerified: true,
      avatar: "https://lh3.googleusercontent.com/access_photo.jpg",
    };
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(mockCreatedUser);
    Token.create.mockResolvedValue({});

    await googleAuth(req, res);

    expect(axios.get).toHaveBeenCalledWith(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      expect.objectContaining({
        headers: { Authorization: "Bearer ya29.sample_access_token" },
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        user: expect.objectContaining({
          email: "oauth.access@example.com",
        }),
      })
    );
  });
});
