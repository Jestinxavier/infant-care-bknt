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

// Generate slug from code before saving
// Child categories get slug: /category/{parentCode}/{childCode}
// Root categories get slug: /category/{code}
categorySchema.pre("save", async function (next) {
  const needsSlug =
    this.isNew ||
    this.isModified("code") ||
    this.isModified("parentCategory") ||
    !this.slug;

  if (needsSlug && this.code) {
    if (this.parentCategory) {
      // Fetch parent to build nested slug
      const parent = await this.constructor.findById(this.parentCategory);
      if (parent && parent.slug) {
        // Extract parent path after /category/ (e.g. "mittens-bootties")
        const parentPath = parent.slug.replace("/category/", "");
        this.slug = `/category/${parentPath}/${this.code}`;
      } else {
        this.slug = `/category/${this.code}`;
      }
    } else {
      this.slug = `/category/${this.code}`;
    }
  }
  next();
});

// Index for faster queries
categorySchema.index({ isActive: 1, displayOrder: 1 });

module.exports = mongoose.model("Category", categorySchema);
