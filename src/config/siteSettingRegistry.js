const SITE_SETTING_KEYS = {
  ORDER_CONTACT: "order.contact",
  ORDER_FROM_ADDRESS: "order.from_address",
  SEARCH_POPULAR_TERMS: "search.popular_terms",
  SEARCH_SUGGESTED_PRODUCTS: "search.suggested_products",
  PAYMENT_ACTIVE_GATEWAY: "payment.active_gateway",
  MAINTENANCE_ENABLED: "maintenance.enabled",
  MAINTENANCE_TITLE: "maintenance.title",
  MAINTENANCE_MESSAGE: "maintenance.message",
  MAINTENANCE_REOPEN_AT: "maintenance.reopen_at",
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
      additionalInstruction: "",
      landmark: "", // Kept for backward compatibility
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
  [SITE_SETTING_KEYS.MAINTENANCE_ENABLED]: {
    key: SITE_SETTING_KEYS.MAINTENANCE_ENABLED,
    scope: "maintenance",
    type: "boolean",
    isPublic: true,
    label: "Maintenance Mode",
    description: "Put the storefront into maintenance mode for customers.",
    category: "maintenance",
    aliases: ["maintenance.enabled"],
    defaultValue: false,
  },
  [SITE_SETTING_KEYS.MAINTENANCE_TITLE]: {
    key: SITE_SETTING_KEYS.MAINTENANCE_TITLE,
    scope: "maintenance",
    type: "string",
    isPublic: true,
    label: "Maintenance Heading",
    description: "Heading shown on the maintenance page.",
    category: "maintenance",
    aliases: ["maintenance.title"],
    defaultValue: "We'll be back soon",
  },
  [SITE_SETTING_KEYS.MAINTENANCE_MESSAGE]: {
    key: SITE_SETTING_KEYS.MAINTENANCE_MESSAGE,
    scope: "maintenance",
    type: "string",
    isPublic: true,
    label: "Maintenance Message",
    description: "Message shown to customers while the store is unavailable.",
    category: "maintenance",
    aliases: ["maintenance.message"],
    defaultValue:
      "Our store is temporarily unavailable while we make some improvements. We're sorry for the inconvenience and appreciate your patience.",
  },
  [SITE_SETTING_KEYS.MAINTENANCE_REOPEN_AT]: {
    key: SITE_SETTING_KEYS.MAINTENANCE_REOPEN_AT,
    scope: "maintenance",
    type: "string",
    isPublic: true,
    label: "Expected Reopen Time",
    description: "Optional date and time when the store is expected to reopen.",
    category: "maintenance",
    aliases: ["maintenance.reopen_at"],
    defaultValue: "",
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
