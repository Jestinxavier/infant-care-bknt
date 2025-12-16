// models/Category.js
const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      unique: true,
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    code: {
      type: String,
      required: [true, "Category code is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      validate: {
        validator: function (v) {
          return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
        },
        message: (props) =>
          `${props.value} is not a valid code! Code must be lowercase, alphanumeric, and separated by hyphens.`,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    image: {
      type: String,
      default: null, // URL to Cloudinary image
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Generate slug from code before saving (code and slug should match)
categorySchema.pre("save", function (next) {
  // Generate slug from code (code is already validated as lowercase-hyphenated)
  if ((this.isModified("code") || this.isNew) && this.code && !this.slug) {
    this.slug = `/category/${this.code}`;
  }
  next();
});

// Index for faster queries
categorySchema.index({ isActive: 1, displayOrder: 1 });

module.exports = mongoose.model("Category", categorySchema);
