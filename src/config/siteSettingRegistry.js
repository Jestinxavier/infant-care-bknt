const SITE_SETTING_KEYS = {
  ORDER_CONTACT: "order.contact",
  ORDER_FROM_ADDRESS: "order.from_address",
  SEARCH_POPULAR_TERMS: "search.popular_terms",
  SEARCH_SUGGESTED_PRODUCTS: "search.suggested_products",
  PAYMENT_ACTIVE_GATEWAY: "payment.active_gateway",
};

const SITE_SETTING_DEFINITIONS = {
  [SITE_SETTING_KEYS.ORDER_CONTACT]: {
    key: SITE_SETTING_KEYS.ORDER_CONTACT,
    scope: "order",
    type: "string",
    isPublic: true,
    label: "Order Contact",
    description: "Phone number shown on order detail pages for customer support.",
    category: "order",
    aliases: ["order.contact"],
    defaultValue: "",
  },
  [SITE_SETTING_KEYS.ORDER_FROM_ADDRESS]: {
    key: SITE_SETTING_KEYS.ORDER_FROM_ADDRESS,
    scope: "order",
    type: "json",
    isPublic: true,
    label: "Invoice From Address",
    description: "The structured sender address shown on invoices and emails.",
    category: "order",
    aliases: ["order.from_address"],
    defaultValue: {
      businessName: "",
      houseName: "",
      street: "",
      landmark: "",
      city: "",
      state: "",
      pincode: "",
      country: "",
      phone: "",
      email: "",
      gstin: "",
    },
  },
  [SITE_SETTING_KEYS.SEARCH_POPULAR_TERMS]: {
    key: SITE_SETTING_KEYS.SEARCH_POPULAR_TERMS,
    scope: "search",
    type: "json",
    isPublic: true,
    label: "Popular Search Terms",
    description: "Chips shown in the storefront search drawer before typing.",
    category: "search",
    aliases: ["search.popular_terms", "popular-searches"],
    defaultValue: [],
  },
  [SITE_SETTING_KEYS.SEARCH_SUGGESTED_PRODUCTS]: {
    key: SITE_SETTING_KEYS.SEARCH_SUGGESTED_PRODUCTS,
    scope: "search",
    type: "json",
    isPublic: true,
    label: "Suggested Products",
    description:
      "Featured products shown in the storefront search drawer before typing.",
    category: "search",
    aliases: ["search.suggested_products", "suggested-products"],
    defaultValue: { productIds: [], viewAllLink: "/search" },
  },
  [SITE_SETTING_KEYS.PAYMENT_ACTIVE_GATEWAY]: {
    key: SITE_SETTING_KEYS.PAYMENT_ACTIVE_GATEWAY,
    scope: "payment",
    type: "string",
    isPublic: true,
    label: "Active Payment Gateway",
    description: "Select which online payment gateway to use (phonepe or razorpay).",
    category: "payment",
    aliases: ["payment.active_gateway"],
    defaultValue: "phonepe",
  },
};

const ALIAS_TO_KEY = Object.values(SITE_SETTING_DEFINITIONS).reduce(
  (acc, def) => {
    acc[def.key] = def.key;
    (def.aliases || []).forEach((alias) => {
      acc[alias] = def.key;
    });
    return acc;
  },
  {},
);

function normalizeSiteSettingKey(key) {
  if (!key) return key;
  return ALIAS_TO_KEY[key] || key;
}

function getSiteSettingDefinition(key) {
  return SITE_SETTING_DEFINITIONS[normalizeSiteSettingKey(key)] || null;
}

function isRegisteredSiteSettingKey(key) {
  return !!getSiteSettingDefinition(key);
}

function getDefaultSiteSettingValue(key) {
  return getSiteSettingDefinition(key)?.defaultValue;
}

function getSiteSettingsByScope(scope) {
  return Object.values(SITE_SETTING_DEFINITIONS).filter(
    (definition) => definition.scope === scope,
  );
}

module.exports = {
  SITE_SETTING_KEYS,
  SITE_SETTING_DEFINITIONS,
  normalizeSiteSettingKey,
  getSiteSettingDefinition,
  isRegisteredSiteSettingKey,
  getDefaultSiteSettingValue,
  getSiteSettingsByScope,
};
