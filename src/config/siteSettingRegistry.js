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
  MAINTENANCE_ALLOWED_EMAILS: "maintenance.allowed_emails",
  TAX_GST: "tax.gst",
  CART_SHIPPING_FLAT: "cart.shipping.flat",
  CART_SHIPPING_FREE_THRESHOLD: "cart.shipping.freeThreshold",
  CONTACT_EMAIL: "contact.email",
  CONTACT_WHATSAPP: "contact.whatsapp",
  CONTACT_FACEBOOK: "contact.facebook",
  CONTACT_INSTAGRAM: "contact.instagram",
};

// Places where GST details can appear, and the details each can show.
const GST_DISPLAY_PLACES = ["invoice", "email", "label", "website", "dashboard"];
const GST_DISPLAY_FIELDS = [
  "gstin", // seller GST number
  "simple", // one "Includes ₹X GST" line
  "breakdown", // CGST/SGST/IGST lines
  "hsn", // HSN code per item
  "taxable", // price before GST
  "pos", // place of supply
  "invno", // invoice number
];
const DEFAULT_GST_DISPLAY = {
  invoice: { gstin: true, simple: false, breakdown: true, hsn: true, taxable: true, pos: true, invno: true },
  email: { gstin: true, simple: true, breakdown: false, hsn: false, taxable: false, pos: false, invno: true },
  label: { gstin: true, simple: false, breakdown: false, hsn: false, taxable: false, pos: false, invno: false },
  website: { gstin: false, simple: true, breakdown: false, hsn: false, taxable: false, pos: false, invno: true },
  dashboard: { gstin: true, simple: false, breakdown: true, hsn: true, taxable: true, pos: true, invno: true },
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
  [SITE_SETTING_KEYS.MAINTENANCE_ALLOWED_EMAILS]: {
    key: SITE_SETTING_KEYS.MAINTENANCE_ALLOWED_EMAILS,
    scope: "maintenance",
    type: "json",
    // Admin-only: never expose the tester list on public endpoints.
    isPublic: false,
    label: "Maintenance Allowed Testers",
    description:
      "Emails of signed-in users who can browse the storefront during maintenance.",
    category: "maintenance",
    aliases: ["maintenance.allowed_emails"],
    defaultValue: [],
  },
  [SITE_SETTING_KEYS.TAX_GST]: {
    key: SITE_SETTING_KEYS.TAX_GST,
    scope: "tax",
    type: "json",
    // Public: the storefront order page needs the display choices. Holds no secrets.
    isPublic: true,
    label: "GST",
    description:
      "Show GST (CGST/SGST/IGST) on invoices, emails, labels and order pages. Prices are treated as already including GST.",
    category: "tax",
    aliases: ["tax.gst"],
    defaultValue: {
      enabled: false,
      // Rate used for products without their own GST rate.
      defaultRate: 0,
      invoicePrefix: "INV",
      display: DEFAULT_GST_DISPLAY,
    },
  },
  // Read by checkout (hybridCartController, orderController) by key; the
  // defaults match the fallbacks used there when the setting is missing.
  [SITE_SETTING_KEYS.CART_SHIPPING_FLAT]: {
    key: SITE_SETTING_KEYS.CART_SHIPPING_FLAT,
    scope: "cart",
    type: "number",
    isPublic: true,
    label: "Shipping charge (₹)",
    description: "Charged on orders below the free-shipping amount.",
    category: "cart",
    aliases: [],
    defaultValue: 60,
  },
  [SITE_SETTING_KEYS.CART_SHIPPING_FREE_THRESHOLD]: {
    key: SITE_SETTING_KEYS.CART_SHIPPING_FREE_THRESHOLD,
    scope: "cart",
    type: "number",
    isPublic: true,
    label: "Free shipping from (₹)",
    description: "Orders of this amount or more (after discounts) ship free.",
    category: "cart",
    aliases: [],
    defaultValue: 1000,
  },
  // Read by the storefront Contact page and the dashboard invoices/labels.
  [SITE_SETTING_KEYS.CONTACT_EMAIL]: {
    key: SITE_SETTING_KEYS.CONTACT_EMAIL,
    scope: "contact",
    type: "string",
    isPublic: true,
    label: "Support email",
    description: "Shown on the Contact page and on invoices.",
    category: "contact",
    aliases: [],
    defaultValue: "",
  },
  [SITE_SETTING_KEYS.CONTACT_WHATSAPP]: {
    key: SITE_SETTING_KEYS.CONTACT_WHATSAPP,
    scope: "contact",
    type: "string",
    isPublic: true,
    label: "WhatsApp number",
    description: "Shown on the Contact page, invoices and shipping labels.",
    category: "contact",
    aliases: [],
    defaultValue: "",
  },
  [SITE_SETTING_KEYS.CONTACT_FACEBOOK]: {
    key: SITE_SETTING_KEYS.CONTACT_FACEBOOK,
    scope: "contact",
    type: "string",
    isPublic: true,
    label: "Facebook page",
    description: "Link shown on the Contact page.",
    category: "contact",
    aliases: [],
    defaultValue: "",
  },
  [SITE_SETTING_KEYS.CONTACT_INSTAGRAM]: {
    key: SITE_SETTING_KEYS.CONTACT_INSTAGRAM,
    scope: "contact",
    type: "string",
    isPublic: true,
    label: "Instagram page",
    description: "Link shown on the Contact page.",
    category: "contact",
    aliases: [],
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
  GST_DISPLAY_PLACES,
  GST_DISPLAY_FIELDS,
  DEFAULT_GST_DISPLAY,
  SITE_SETTING_DEFINITIONS,
  normalizeSiteSettingKey,
  getSiteSettingDefinition,
  isRegisteredSiteSettingKey,
  getDefaultSiteSettingValue,
  getSiteSettingsByScope,
};
