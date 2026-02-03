const { Env } = require("pg-sdk-node");

const phonePeConfig = {
  env: process.env.NODE_ENV === "production" ? Env.PRODUCTION : Env.SANDBOX,
  credentials: {
    clientId: process.env.PHONEPE_CLIENT_ID,
    clientSecret: process.env.PHONEPE_CLIENT_SECRET,
    clientVersion: 1,
    username: process.env.PHONEPE_MERCHANT_USERNAME,
    password: process.env.PHONEPE_MERCHANT_PASSWORD,
    redirectSecret: process.env.PHONEPE_REDIRECT_SECRET,
  },
  /** Build redirect URL with orderId and optional token for post-payment callback */
  redirectUrl: (orderId, token) => {
    const base = `${
      process.env.BACKEND_URL
    }/order-confirmation?orderId=${encodeURIComponent(orderId)}`;
    return token ? `${base}&token=${encodeURIComponent(token)}` : base;
  },
  webhookUrl: `${process.env.BACKEND_URL}/api/webhooks/phonepe`,
};

module.exports = {
  phonePeConfig,
};
