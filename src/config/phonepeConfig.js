const { Env } = require("pg-sdk-node");

const phonePeConfig = {
  env: process.env.NODE_ENV === "production" ? Env.PRODUCTION : Env.SANDBOX,
  credentials: {
    clientId: process.env.PHONEPE_CLIENT_ID,
    clientSecret: process.env.PHONEPE_CLIENT_SECRET,
    clientVersion: 1,
  },
  redirectUrl: (orderId) =>
    `${process.env.BACKEND_URL}/order-confirmation?orderId=${orderId}`,
  webhookUrl: `${process.env.BACKEND_URL}/api/webhooks/phonepe`,
};

module.exports = {
  phonePeConfig,
};
