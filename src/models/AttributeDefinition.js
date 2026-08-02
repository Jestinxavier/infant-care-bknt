/**
 * AttributeDefinition Model
 * Global registry for product configuration attributes (e.g., color, size)
 *
 * Critical Features:
 * - `code` is immutable and unique (used for API/UI, not as foreign key)
 * - `_id` (ObjectId) is used for joins with Product.variantOptions
 * - `usageCount` tracks how many products use this attribute
 * - `isLocked` prevents destructive edits when in use
 */

const mongoose = require("mongoose");
const { normalizeCode } = require("../utils/normalizeValue");

const attributeDefinitionSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Attribute code is required"],
      unique: true,
      lowercase: true,
      trim: true,
      immutable: true, // Cannot be changed after creation
      match: [
        /^[a-z][a-z0-9_]*$/,
        "Code must start with a letter and contain only lowercase letters, numbers, and underscores",
      ],
      maxlength: [50, "Code cannot exceed 50 characters"],
    },
    label: {
      type: String,
      required: [true, "Attribute label is required"],
      trim: true,
      maxlength: [100, "Label cannot exceed 100 characters"],
    },
    type: {
      type: String,
      enum: {
        values: ["enum", "number", "boolean", "text"],
        message: "Type must be one of: enum, number, boolean, text",
      },
      default: "enum",
    },
    uiType: {
      type: String,
      enum: {
        values: ["swatch", "dropdown", "chips", "input"],
        message: "UI type must be one of: swatch, dropdown, chips, input",
      },
      default: "dropdown",
    },
    isRequired: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: {
        values: ["variant", "metadata", "both"],
        message: "Role must be one of: variant, metadata, both",
      },
      default: "metadata",
    },

    allowedValues: [
      {
        value: { type: String, required: true },
        label: { type: String, required: true },
        hex: { type: String },
        // Alternate spellings/labels that collapse to this canonical value
        synonyms: { type: [String], default: [] },
        isActive: { type: Boolean, default: true },
      },
    ],

    isLocked: {
      type: Boolean,
      default: false,
    },
    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    position: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: "attribute_definitions",
  },
);

// code unique index is created by unique:true in the field definition above
attributeDefinitionSchema.index({ position: 1 });

// Pre-save middleware to auto-lock when in use
attributeDefinitionSchema.pre("save", function (next) {
  if (this.isModified("code")) {
    this.code = normalizeCode(this.code);
  }
  // Normalize allowed values
  if (this.isModified("allowedValues") && this.allowedValues?.length) {
    const seen = new Set();
    this.allowedValues = this.allowedValues
      .map((v) => {
        const value = String(v.value ?? "")
          .toLowerCase()
          .trim()
          .replace(/\s+/g, "-");
        const synonyms = Array.isArray(v.synonyms)
          ? [
              ...new Set(
                v.synonyms
                  .map((s) =>
                    String(s ?? "").toLowerCase().trim().replace(/\s+/g, "-"),
                  )
                  .filter((s) => s && s !== value),
              ),
            ]
          : [];
        return {
          value,
          label: v.label.trim(),
          hex: v.hex || undefined,
          synonyms,
          isActive: v.isActive !== false,
        };
      })
      .filter((v) => {
        if (seen.has(v.value)) return false;
        seen.add(v.value);
        return true;
      });
  }
  next();
});

// Static method to increment usage count
attributeDefinitionSchema.statics.incrementUsage = async function (
  attributeId,
) {
  return this.findByIdAndUpdate(
    attributeId,
    {
      $inc: { usageCount: 1 },
      $set: { isLocked: true },
    },
    { new: true },
  );
};

// Static method to decrement usage count
attributeDefinitionSchema.statics.decrementUsage = async function (
  attributeId,
) {
  const attr = await this.findById(attributeId);
  if (!attr) return null;

  const newCount = Math.max(0, attr.usageCount - 1);
  return this.findByIdAndUpdate(
    attributeId,
    {
      $set: {
        usageCount: newCount,
        isLocked: newCount > 0,
      },
    },
    { new: true },
  );
};

// Prevent deletion if in use
attributeDefinitionSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    if (this.usageCount > 0) {
      const error = new Error(
        `Cannot delete attribute "${this.code}" - it is used by ${this.usageCount} product(s)`,
      );
      error.name = "AttributeInUseError";
      return next(error);
    }
    next();
  },
);

// Clear cached model if exists (for hot reloading)
if (mongoose.connection.models.AttributeDefinition) {
  delete mongoose.connection.models.AttributeDefinition;
}
if (mongoose.models.AttributeDefinition) {
  delete mongoose.models.AttributeDefinition;
}

const AttributeDefinition = mongoose.model(
  "AttributeDefinition",
  attributeDefinitionSchema,
);

module.exports = AttributeDefinition;
