const express = require("express");
const { register, login, refreshToken, logout } = require("../controllers/auth");
const { registerValidation, loginValidation, validate } = require("../middlewares/validators");

const router = express.Router();

router.post("/register", registerValidation, validate, register);
router.post("/login", loginValidation, validate, login);
router.post("/refresh", refreshToken);
router.post("/logout", logout);

module.exports = router;
