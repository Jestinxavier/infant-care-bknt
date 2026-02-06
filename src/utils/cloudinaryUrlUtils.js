/**
 * Shared Cloudinary URL utilities.
 * Converts asset IDs (e.g. "assets/xxx", public_id) to full Cloudinary delivery URLs
 * for consistent use in products, categories, and CMS responses.
 */

/**
 * Convert a public_id or asset path to a full Cloudinary image URL.
 * - If input is already a full URL (starts with http), return as-is.
 * - If input is a relative path (starts with /), return as-is (e.g. menu links "/category/all").
 * - Otherwise treat as public_id and build: https://res.cloudinary.com/{cloudName}/image/upload/{publicId}
 *
 * @param {string} publicIdOrPath - Public ID (e.g. "assets/xxx"), path, or full URL
 * @returns {string|null} Full Cloudinary URL or null if input is falsy
 */
function toCloudinaryUrl(publicIdOrPath) {
  if (publicIdOrPath == null || publicIdOrPath === "") return null;
  const value =
    typeof publicIdOrPath === "string"
      ? publicIdOrPath
      : typeof publicIdOrPath === "object" && publicIdOrPath?.url != null
      ? publicIdOrPath.url
      : null;
  if (value == null || value === "") return null;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  // Relative paths (e.g. "/category/all", "/about") are not Cloudinary public_ids
  if (value.startsWith("/")) {
    return value;
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) {
    console.warn("CLOUDINARY_CLOUD_NAME not set, cannot build URL");
    return value;
  }

  return `https://res.cloudinary.com/${cloudName}/image/upload/${value}`;
}

/**
 * Convert a single image value to a full Cloudinary URL.
 * Handles string (URL or public_id) or object with .url.
 *
 * @param {string|object} image - String URL/public_id or { url, ... }
 * @returns {string|null} Full Cloudinary URL or null
 */
function ensureImageUrl(image) {
  if (image == null) return null;
  if (typeof image === "string") return toCloudinaryUrl(image);
  if (typeof image === "object" && image !== null && image.url != null) {
    const url = toCloudinaryUrl(image.url);
    return url ? { ...image, url } : image;
  }
  return image;
}

/**
 * Convert an array of image values to full Cloudinary URLs.
 * Each element can be a string (URL or public_id) or object with .url.
 *
 * @param {Array<string|object>} images - Array of image strings or objects
 * @returns {Array<string|object>} Array with URLs normalized to full Cloudinary URLs
 */
function ensureImageUrls(images) {
  if (!Array.isArray(images)) return [];
  return images.map((img) => {
    if (typeof img === "string") return toCloudinaryUrl(img) || img;
    if (img && typeof img === "object" && img.url != null) {
      const url = toCloudinaryUrl(img.url);
      return url ? { ...img, url } : img;
    }
    return img;
  });
}

/**
 * Recursively walk a plain object/array and convert any property named "url"
 * (when its value looks like a Cloudinary public_id) to a full Cloudinary URL.
 * Used for CMS content (blocks with image_small.url, image_large.url, etc.).
 * Relative paths (e.g. "/category/all") and full URLs are left unchanged so that
 * header/footer menu links and other non-image URLs are not broken.
 *
 * @param {any} obj - Content object or array (e.g. CMS page content)
 * @returns {any} New structure with url fields converted (shallow copy where changed)
 */
function ensureContentImageUrls(obj) {
  if (obj == null) return obj;
  if (typeof obj === "string") return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => ensureContentImageUrls(item));
  }
  if (typeof obj === "object") {
    const out = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (key === "url" && typeof val === "string") {
        // Leave full URLs and relative paths (e.g. "/category/all") unchanged.
        // Only convert values that look like Cloudinary public_ids (no leading slash).
        if (val.startsWith("http://") || val.startsWith("https://")) {
          out[key] = val;
        } else if (val.startsWith("/")) {
          out[key] = val;
        } else {
          out[key] = toCloudinaryUrl(val) || val;
        }
      } else if (val !== null && typeof val === "object") {
        out[key] = ensureContentImageUrls(val);
      } else {
        out[key] = val;
      }
    }
    return out;
  }
  return obj;
}

module.exports = {
  toCloudinaryUrl,
  ensureImageUrl,
  ensureImageUrls,
  ensureContentImageUrls,
};
