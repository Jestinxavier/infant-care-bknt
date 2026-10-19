/**
 * CMS Page model — the "Static Pages" engine.
 *
 * Design notes:
 * - A page holds TWO block lists: `draft` (the work in progress) and
 *   `published` (what visitors see). Saving a draft never touches the live
 *   page; publishing copies the validated draft to `published` and bumps
 *   the version.
 * - Blocks are EMBEDDED and ordered inside the document (single read,
 *   atomic writes) — unlike the singletons in `headerData`/`homepage`
 *   which store one block per document.
 * - `data` is Mixed but every block payload is validated against the
 *   content-type registry before it is stored.
 */

const mongoose = require("mongoose");

const cmsBlockSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: true }
);

const cmsPageSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    title: { type: String, required: true, trim: true },
    seo: {
      metaTitle: { type: String, default: "" },
      metaDescription: { type: String, default: "" },
      ogImage: { type: String, default: "" },
    },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    version: { type: Number, default: 0 },
    publishedAt: { type: Date, default: null },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    draft: {
      blocks: { type: [cmsBlockSchema], default: [] },
    },
    published: {
      // Snapshot of everything that went live on the last publish, so
      // title/slug/seo edits stay in the draft until the page is published.
      title: { type: String, default: "" },
      slug: { type: String, default: "" },
      seo: {
        metaTitle: { type: String, default: "" },
        metaDescription: { type: String, default: "" },
        ogImage: { type: String, default: "" },
      },
      blocks: { type: [cmsBlockSchema], default: [] },
    },
  },
  {
    timestamps: true,
    collection: "cmsPages",
  }
);

cmsPageSchema.index({ "draft.blocks.type": 1 });
cmsPageSchema.index({ status: 1, updatedAt: -1 });

/** Plain-object representation with a stable string `id`. */
cmsPageSchema.methods.toSafeJson = function toSafeJson(includeDraft = true) {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;

  if (includeDraft) {
    obj.draft = obj.draft || { blocks: [] };
    if (!Array.isArray(obj.draft.blocks)) obj.draft.blocks = [];
  } else {
    delete obj.draft;
  }

  obj.published = obj.published || { blocks: [] };
  if (!Array.isArray(obj.published.blocks)) obj.published.blocks = [];

  return obj;
};

module.exports = mongoose.model("CmsPage", cmsPageSchema);