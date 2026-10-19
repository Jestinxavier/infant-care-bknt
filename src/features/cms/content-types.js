/**
 * Content Type Registry
 *
 * The single, authoritative source of truth for the "Static Pages" CMS.
 * Each content type (block) declares the fields that make up its data.
 * The same definitions drive BOTH:
 *   1. Server-side validation (pages.validation / pages.service)
 *   2. Admin form generation (mirrored in the dashboard UI)
 *
 * Adding a new section type = add one entry here + one form component
 * in the dashboard. No backend code changes required for validation.
 */

/**
 * Supported field types
 * - text / textarea : plain strings
 * - richText         : HTML string (produced by the dashboard TipTap editor)
 * - image            : URL string (full URL or relative /path)
 * - url              : link string (http(s)://, /path, #hash)
 * - select           : one of `options`
 * - boolean          : true/false
 * - repeater         : array of items validated against `itemSchema`
 */
const FIELD_TYPES = [
  "text",
  "textarea",
  "richText",
  "image",
  "url",
  "select",
  "boolean",
  "repeater",
  "category",
];

/** Content type definitions. `id` is the persisted block_type value. */
const CONTENT_TYPES = [
  {
    id: "richText",
    label: "Text Block",
    description: "Free-form rich text content — paragraphs, lists, headings and links.",
    group: "Content",
    fields: [
      {
        key: "body",
        label: "Body",
        type: "richText",
        required: true,
        help: "Main content of the section.",
      },
    ],
  },
  {
    id: "hero",
    label: "Hero Banner",
    description: "Full-width banner with heading, subtext and a call to action.",
    group: "Banners",
    fields: [
      {
        key: "heading",
        label: "Heading",
        type: "text",
        required: true,
      },
      { key: "subheading", label: "Subheading", type: "textarea" },
      { key: "imageUrl", label: "Background Image", type: "image" },
      { key: "ctaLabel", label: "Button Label", type: "text" },
      { key: "ctaHref", label: "Button Link", type: "url" },
      {
        key: "align",
        label: "Text Alignment",
        type: "select",
        options: ["left", "center", "right"],
        defaultValue: "left",
      },
    ],
  },
  {
    id: "textImage",
    label: "Text + Image",
    description: "A text block next to an image, image can sit left or right.",
    group: "Content",
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "body", label: "Body", type: "richText" },
      { key: "imageUrl", label: "Image", type: "image", required: true },
      { key: "imageAlt", label: "Image Alt Text", type: "text" },
      {
        key: "position",
        label: "Image Position",
        type: "select",
        options: ["left", "right"],
        defaultValue: "right",
      },
    ],
  },
  {
    id: "cards",
    label: "Card Grid",
    description: "A grid of image cards, each with heading, text and a link.",
    group: "Content",
    fields: [
      { key: "title", label: "Section Title", type: "text" },
      {
        key: "items",
        label: "Cards",
        type: "repeater",
        itemSchema: [
          { key: "heading", label: "Heading", type: "text" },
          { key: "body", label: "Body", type: "textarea" },
          { key: "imageUrl", label: "Image", type: "image" },
          { key: "imageAlt", label: "Image Alt Text", type: "text" },
          {
            key: "icon",
            label: "Icon",
            type: "select",
            options: ["heart", "shield", "star", "sparkles"],
          },
          { key: "link", label: "Link", type: "url" },
        ],
      },
    ],
  },
  {
    id: "faqList",
    label: "Q&A List",
    description:
      "A collapsible list of question & answer pairs — FAQs, policies, sizing tips and more.",
    group: "Content",
    fields: [
      { key: "title", label: "Section Title", type: "text" },
      {
        key: "items",
        label: "Questions",
        type: "repeater",
        itemSchema: [
          {
            key: "question",
            label: "Question",
            type: "text",
            required: true,
          },
          { key: "answer", label: "Answer", type: "richText", required: true },
        ],
      },
    ],
  },
  {
    id: "productSlider",
    label: "Product Slider",
    description:
      "A carousel of products from a single category, shown live on the storefront.",
    group: "Product Data",
    fields: [
      { key: "title", label: "Slider Title", type: "text" },
      { key: "categorySlug", label: "Category", type: "category", required: true },
    ],
  },
  {
    id: "categoryGrid",
    label: "Category Grid",
    description:
      "A grid of category cards, each linking to its landing page. Pick the top-level categories to showcase; their subcategories fill in automatically.",
    group: "Product Data",
    fields: [
      { key: "title", label: "Grid Title", type: "text" },
      {
        key: "items",
        label: "Categories",
        type: "repeater",
        itemSchema: [
          { key: "name", label: "Card Title", type: "text", required: true },
          { key: "slug", label: "Category", type: "category", required: true },
        ],
      },
    ],
  },
  {
    id: "editorPicks",
    label: "Editor Picks",
    description:
      "Editorially curated product picks from a category, shown live at published time.",
    group: "Product Data",
    fields: [
      { key: "title", label: "Picks Title", type: "text" },
      { key: "categorySlug", label: "Category", type: "category", required: true },
    ],
  },
];

/** Convenience lookups */
const CONTENT_TYPE_MAP = Object.fromEntries(
  CONTENT_TYPES.map((ct) => [ct.id, ct])
);
const ALL_BLOCK_TYPES = CONTENT_TYPES.map((ct) => ct.id);

/**
 * Resolve the default value for a field definition.
 */
function fieldDefault(fieldDef) {
  if (fieldDef.defaultValue !== undefined) return fieldDef.defaultValue;
  switch (fieldDef.type) {
    case "select":
      return fieldDef.options?.[0] ?? "";
    case "boolean":
      return false;
    case "repeater":
      return [];
    default:
      return "";
  }
}

module.exports = {
  FIELD_TYPES,
  CONTENT_TYPES,
  CONTENT_TYPE_MAP,
  ALL_BLOCK_TYPES,
  fieldDefault,
};