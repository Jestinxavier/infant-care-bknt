// Product Model - Mongoose Schema
const mongoose = require("mongoose");
const {
  FILTER_ATTRIBUTE_KEYS,
  syncFilterAttributes,
} = require("../../utils/filterAttributes");

// Variant Option Value Schema
const variantOptionValueSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    value: { type: String, required: true },
    label: { type: String },
    hex: { type: String },
  },
  { _id: false },
);

// Variant Option Schema
// Uses attributeId (ObjectId) as foreign key to attribute_definitions
// Keeps name/code for backward compatibility during migration
const variantOptionSchema = new mongoose.Schema(
  {
    // NEW: Reference to global attribute definition
    attributeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttributeDefinition",
    },
    // LEGACY: Kept for backward compatibility during migration
    id: { type: String },
    name: { type: String },
    code: { type: String },
    // Position for display ordering
    position: { type: Number, default: 0 },
    // Product-scoped values
    values: [variantOptionValueSchema],
  },
  { _id: false },
);

// Image Metadata Schema
const imageMetadataSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    public_id: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    format: { type: String, required: true },
    size: { type: Number },
    alt: { type: String },
  },
  { _id: false },
);

// Variant Schema (embedded)
const variantSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    url_key: { type: String, required: true },
    sku: { type: String, required: true },
    skuLocked: { type: Boolean, default: false },
    price: { type: Number, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    // Offer pricing (discountPrice is computed at runtime, not stored)
    offerPrice: { type: Number, min: 0 },
    offerStartAt: { type: Date },
    offerEndAt: { type: Date },
    stockObj: {
      available: { type: Number, default: 0, min: 0 },
      isInStock: { type: Boolean, default: true },
    },
    images: [imageMetadataSchema],
    options: { type: Map, of: String },
    attributes: { type: Map, of: String },
    // Hash of options for duplicate detection (e.g., "color:red|size:m")
    _optionsHash: { type: String },
    weight: { type: Number },
    length: { type: Number },
    width: { type: Number },
    height: { type: Number },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

// Detail Field Schema (for details.fields array)
// Supported field types:
// 1. "text" - Simple label/value pair
// 2. "badges" - Array of badge strings
// 3. "flex_box" - Array of label/value objects (for grid display)
// 4. "list" - Array of strings (for bullet-point lists)
const detailFieldSchema = new mongoose.Schema(
  {
    label: { type: String }, // Required for "text" type, optional for others
    value: { type: mongoose.Schema.Types.Mixed }, // Type-specific: string for text, array for badges/flex_box/list
    type: {
      type: String,
      enum: ["badges", "flex_box", "list", "text"],
      default: "text",
    },
  },
  { _id: false },
);

// Detail Schema (for details array)
const detailSchema = new mongoose.Schema(
  {
    title: { type: String, required: true }, // Section title
    fields: [detailFieldSchema], // Array of detail fields
    // Legacy fields - kept for backward compatibility
    badges: { type: Array, default: [] },
    flex_box: { type: Boolean, default: false },
  },
  { _id: false },
);

// Product Type Enum
const PRODUCT_TYPES = {
  SIMPLE: "SIMPLE",
  CONFIGURABLE: "CONFIGURABLE",
  BUNDLE: "BUNDLE",
  CHOICE_GROUP: "CHOICE_GROUP",
};

// Bundle Item Schema (for bundle_config.items)
const bundleItemSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    isFree: { type: Boolean, default: false },
  },
  { _id: false },
);

// Gift Option Schema (for bundle_config.gift_slot.options)
const giftOptionSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    label: { type: String, required: true }, // Display label e.g., "Free Socks"
  },
  { _id: false },
);

// Gift Slot Schema (for bundle_config.gift_slot)
// Allows bundles to offer a customer choice of free gifts
const giftSlotSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    qty: { type: Number, default: 1, min: 1 }, // How many of the selected gift
    options: {
      type: [giftOptionSchema],
      default: [],
      validate: {
        validator: function (v) {
          // If enabled, must have at least 2 gift choices
          if (this.enabled) return v.length >= 2;
          return true;
        },
        message: "Gift slot must contain at least 2 gift options when enabled.",
      },
    },
  },
  { _id: false },
);

// Bundle Config Schema
const bundleConfigSchema = new mongoose.Schema(
  {
    pricing: { type: String, enum: ["FIXED"], default: "FIXED" },
    items: [bundleItemSchema],
    // Gift Choice Slot - allows customer to pick one free gift from options
    gift_slot: {
      type: giftSlotSchema,
      default: { enabled: false },
    },
  },
  { _id: false },
);

const filterAttributesSchema = new mongoose.Schema(
  {
    color: [{ type: String }],
    size: [{ type: String }],
    material: [{ type: String }],
    season: [{ type: String }],
    gender: [{ type: String }],
    sleeve: [{ type: String }],
    occasion: [{ type: String }],
    pattern: [{ type: String }],
    pack: [{ type: String }],
  },
  { _id: false },
);

// URL Key History Schema
const urlKeyHistorySchema = new mongoose.Schema(
  {
    urlKey: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// Product Schema
const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true },
    description: { type: String, trim: true },
    shortDescription: { type: String, trim: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    sku: { type: String },
    skuLocked: { type: Boolean, default: false },
    url_key: { type: String, unique: true, sparse: true },
    urlKeyHistory: [urlKeyHistorySchema],
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
    // Product Type: SIMPLE (no variants), CONFIGURABLE (has variants), BUNDLE (fixed bundle)
    product_type: {
      type: String,
      enum: Object.values(PRODUCT_TYPES),
      default: PRODUCT_TYPES.SIMPLE,
      index: true,
    },
    // Bundle configuration (only for BUNDLE product_type)
    bundle_config: bundleConfigSchema,
    variantOptions: {
      type: [variantOptionSchema],
      validate: {
        validator: function (options) {
          // Check for duplicate attributes (by attributeId or code for legacy)
          const ids = options.map((o) =>
            o.attributeId ? o.attributeId.toString() : o.code,
          );
          return ids.length === new Set(ids).size;
        },
        message: "Duplicate attributes are not allowed in a single product",
      },
    },
    variants: {
      type: [variantSchema],
      validate: {
        validator: function (variants) {
          // Check for duplicate _optionsHash
          const hashes = variants.map((v) => v._optionsHash).filter(Boolean);
          return hashes.length === new Set(hashes).size;
        },
        message: "Duplicate variant combinations are not allowed",
      },
    },
    filterAttributes: {
      type: filterAttributesSchema,
      default: {},
    },
    details: [detailSchema],
    images: [imageMetadataSchema],
    collections: {
      type: [{ type: String, trim: true }],
      default: [],
      index: true,
    },
    badgeCollection: {
      type: String,
      trim: true,
      default: null,
    },
    price: { type: Number, min: 0 },
    // Offer pricing (discountPrice is computed at runtime, not stored)
    offerPrice: { type: Number, min: 0 },
    offerStartAt: { type: Date },
    offerEndAt: { type: Date },
    currency: { type: String, default: "INR" },
    taxClass: { type: String, default: "standard" },
    stock: { type: Number, default: 0, min: 0 },
    weight: { type: Number, min: 0 },
    length: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    shippingClass: { type: String },
    vendor: { type: String, trim: true },
    manufacturer: { type: String, trim: true },
    warranty: { type: String, trim: true },
    metaTitle: { type: String, trim: true },
    metaDescription: { type: String, trim: true },
    metaKeywords: [{ type: String }],
    visibility: {
      type: String,
      enum: ["public", "private", "hidden"],
      default: "public",
    },
    uiMeta: {
      type: Object,
      default: {},
    },
    customAttributes: { type: Map, of: mongoose.Schema.Types.Mixed },
  },
  {
    timestamps: true,
    collection: "products",
  },
);

// Indexes
productSchema.index({ category: 1, status: 1 });
productSchema.index({ title: "text", description: "text" });
// product_type index is already declared in schema with `index: true`

// Compound unique index for product SKU
productSchema.index({ sku: 1 }, { unique: true, sparse: true });

// Compound unique index for variant SKU across all products
productSchema.index({ "variants.sku": 1 }, { unique: true, sparse: true });

// Index for variant options hash (for duplicate detection within a product)
productSchema.index({ "variants._optionsHash": 1 }, { sparse: true });

// Index for attributeId lookups
productSchema.index({ "variantOptions.attributeId": 1 }, { sparse: true });
productSchema.index({ "filterAttributes.color": 1 }, { sparse: true });
productSchema.index({ "filterAttributes.size": 1 }, { sparse: true });
productSchema.index({ "filterAttributes.material": 1 }, { sparse: true });
productSchema.index({ "filterAttributes.season": 1 }, { sparse: true });
productSchema.index({ "filterAttributes.gender": 1 }, { sparse: true });
productSchema.index({ "filterAttributes.sleeve": 1 }, { sparse: true });
productSchema.index({ "filterAttributes.occasion": 1 }, { sparse: true });
productSchema.index({ "filterAttributes.pattern": 1 }, { sparse: true });
productSchema.index({ "filterAttributes.pack": 1 }, { sparse: true });

// Pre-save hook for URL key generation (only on creation)
productSchema.pre("save", async function (next) {
  this.filterAttributes = syncFilterAttributes({
    productType: this.product_type,
    variants: this.variants,
    filterAttributes: this.filterAttributes,
  });

  if (this.isNew && !this.url_key && this.title) {
    try {
      const { generateUniqueUrlKey } = require("../../utils/slugGenerator");

      // Use mongoose.models to avoid recompilation
      const Product =
        mongoose.models.Product || mongoose.model("Product", productSchema);

      // Create a proper checkExists function
      const checkExists = async (urlKey) => {
        const existingProduct = await Product.findOne({ url_key: urlKey });
        return !!existingProduct;
      };

      this.url_key = await generateUniqueUrlKey(this.title, checkExists);
    } catch (error) {
      return next(error);
    }
  }
  next();
});

const getUpdateValue = (update, key) => {
  if (!update || typeof update !== "object") return undefined;

  if (Object.prototype.hasOwnProperty.call(update, key)) {
    return update[key];
  }

  if (
    update.$set &&
    typeof update.$set === "object" &&
    Object.prototype.hasOwnProperty.call(update.$set, key)
  ) {
    return update.$set[key];
  }

  return undefined;
};

const extractFilterAttributesFromUpdate = (update) => {
  if (!update || typeof update !== "object") return undefined;

  const direct = getUpdateValue(update, "filterAttributes");
  const nestedSet = update.$set || {};
  const fromNested = {};

  FILTER_ATTRIBUTE_KEYS.forEach((key) => {
    const pathKey = `filterAttributes.${key}`;
    if (Object.prototype.hasOwnProperty.call(nestedSet, pathKey)) {
      fromNested[key] = nestedSet[pathKey];
    }
  });

  if (direct === undefined && Object.keys(fromNested).length === 0) {
    return undefined;
  }

  return {
    ...(direct && typeof direct === "object" ? direct : {}),
    ...fromNested,
  };
};

const setFilterAttributesOnUpdate = (update, filterAttributes) => {
  if (!update || typeof update !== "object") return update;

  const hasOperators = Object.keys(update).some((key) => key.startsWith("$"));
  if (hasOperators) {
    update.$set = {
      ...(update.$set || {}),
      filterAttributes,
    };

    FILTER_ATTRIBUTE_KEYS.forEach((key) => {
      if (update.$set) {
        delete update.$set[`filterAttributes.${key}`];
      }
    });
  } else {
    update.filterAttributes = filterAttributes;
  }

  return update;
};

const touchesFilterAttributesInputs = (update) => {
  if (!update || typeof update !== "object") return false;

  const keys = new Set([
    ...Object.keys(update || {}),
    ...Object.keys(update.$set || {}),
    ...Object.keys(update.$unset || {}),
  ]);

  for (const key of keys) {
    if (
      key === "product_type" ||
      key === "variants" ||
      key === "filterAttributes" ||
      key.startsWith("filterAttributes.")
    ) {
      return true;
    }
  }

  return false;
};

const syncFilterAttributesOnQueryUpdate = async function (next) {
  try {
    const update = this.getUpdate() || {};
    if (!touchesFilterAttributesInputs(update)) {
      return next();
    }

    const existing = await this.model
      .findOne(this.getQuery())
      .select("product_type variants filterAttributes")
      .lean();

    const mergedFilterAttributes = extractFilterAttributesFromUpdate(update);
    const normalized = syncFilterAttributes({
      productType: getUpdateValue(update, "product_type") || existing?.product_type,
      variants: getUpdateValue(update, "variants") || existing?.variants,
      filterAttributes: mergedFilterAttributes,
      fallbackFilterAttributes: existing?.filterAttributes,
    });

    this.setUpdate(setFilterAttributesOnUpdate(update, normalized));
    next();
  } catch (error) {
    next(error);
  }
};

productSchema.pre("findOneAndUpdate", syncFilterAttributesOnQueryUpdate);
productSchema.pre("findByIdAndUpdate", syncFilterAttributesOnQueryUpdate);

// Force clear any cached model to ensure schema updates are applied
if (mongoose.connection.models.Product) {
  delete mongoose.connection.models.Product;
}
if (mongoose.models.Product) {
  delete mongoose.models.Product;
}

// Export using singleton pattern to prevent duplicate compilation
const Product = mongoose.model("Product", productSchema);

module.exports = Product;
module.exports.PRODUCT_TYPES = PRODUCT_TYPES;
