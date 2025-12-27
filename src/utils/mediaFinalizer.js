/**
 * Media Finalizer Utility
 * Helper functions to mark images as final when products are saved
 */

const { cloudinary } = require("../config/cloudinary");
const Asset = require("../models/Asset");

/**
 * Extract all public_ids from product and variant images
 * @param {Object} productData - Product data with images
 * @returns {string[]} Array of public_ids
 */
function extractImagePublicIds(productData) {
  const publicIds = [];

  // Extract from product images
  if (productData.images && Array.isArray(productData.images)) {
    productData.images.forEach((img) => {
      if (typeof img === "object" && img.public_id) {
        publicIds.push(img.public_id);
      } else if (typeof img === "string") {
        // Legacy format - try to extract public_id from URL
        // Cloudinary URLs contain public_id in the path: /v<version>/<public_id>.<format>
        // Regex matches everything after /v<digits>/ up to the last dot
        const match = img.match(/\/v\d+\/(.+)\.[^.]+$/);
        if (match && match[1]) {
          publicIds.push(match[1]);
        }
      }
    });
  }

  // Extract from variant images
  if (productData.variants && Array.isArray(productData.variants)) {
    productData.variants.forEach((variant) => {
      if (variant.images && Array.isArray(variant.images)) {
        variant.images.forEach((img) => {
          if (typeof img === "object" && img.public_id) {
            publicIds.push(img.public_id);
          } else if (typeof img === "string") {
            const match = img.match(/\/v\d+\/(.+)\.[^.]+$/);
            if (match && match[1]) {
              publicIds.push(match[1]);
            }
          }
        });
      }
    });
  }

  return publicIds.filter(Boolean); // Remove any undefined/null values
}

/**
 * Mark images as final (permanent) and track usage
 * @param {string[]} publicIds - Array of Cloudinary public_ids
 * @param {string} entityType - Entity type (product, cms, etc.)
 * @param {string|Object} entityId - Entity ID
 * @returns {Promise<{success: string[], failed: Array}>}
 */
async function finalizeImages(publicIds, entityType, entityId) {
  if (!publicIds || publicIds.length === 0) {
    return { success: [], failed: [] };
  }

  const results = {
    success: [],
    failed: [],
  };

  for (const publicId of publicIds) {
    try {
      // Find the asset
      const asset = await Asset.findOne({ publicId });

      if (asset) {
        // Promote to permanent and add reference
        if (entityType && entityId) {
          await asset.promoteToPermanent(entityType, entityId);
        } else {
          // Fallback if no entity info (just mark permanent)
          asset.status = "permanent";
          asset.expiresAt = null;
          await asset.save();
        }

        results.success.push(publicId);
      } else {
        // Asset not found in DB - might be legacy or external
        // We can't track it, but we can try to remove the Cloudinary tag if we want
        results.failed.push({ publicId, error: "Asset not found in DB" });
      }

      // Attempt to remove temp tag from Cloudinary regardless of DB status
      try {
        await cloudinary.uploader.remove_tag("temp-upload", [publicId], {
          resource_type: "image",
        });
      } catch (tagError) {
        // Ignore tag error
      }
    } catch (error) {
      console.error(`❌ Failed to finalize ${publicId}:`, error);
      results.failed.push({ publicId, error: error.message });
    }
  }

  return results;
}

module.exports = {
  extractImagePublicIds,
  finalizeImages,
};
