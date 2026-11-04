const express = require("express");
const {
  getUnsubscribeStatus,
  unsubscribe,
  resubscribe,
} = require("../controllers/abandonedCartController");

const router = express.Router();

// Signed-token links from optional emails. GET is read-only (mail scanners
// prefetch links); POST performs the change, including Gmail/Yahoo one-click.
router.get("/unsubscribe", getUnsubscribeStatus);
router.post("/unsubscribe", unsubscribe);
router.post("/resubscribe", resubscribe);

module.exports = router;
