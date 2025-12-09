/**
 * Media Finalizer Utility
 * Helper functions to mark images as final when products are saved
 */

const { cloudinary } = require("../config/cloudinary");
const Media = require("../models/Media");

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
        // Cloudinary URLs contain public_id in the path
        const match = img.match(/\/v\d+\/([^\/]+)\./);
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
            const match = img.match(/\/v\d+\/([^\/]+)\./);
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
 * Mark images as final (remove temp tag and update DB)
 * @param {string[]} publicIds - Array of Cloudinary public_ids
 * @returns {Promise<{success: string[], failed: Array}>}
 */
async function finalizeImages(publicIds) {
  if (!publicIds || publicIds.length === 0) {
    return { success: [], failed: [] };
  }

  const results = {
    success: [],
    failed: [],
  };

  for (const publicId of publicIds) {
    try {
      // Remove temp-upload tag from Cloudinary
      try {
        await cloudinary.uploader.remove_tag("temp-upload", [publicId], {
          resource_type: "image",
        });
      } catch (tagError) {
        // Tag might not exist - that's okay
        console.warn(
          `⚠️ Could not remove tag from ${publicId}:`,
          tagError.message
        );
      }

      // Update Media collection
      const updated = await Media.findOneAndUpdate(
        { public_id: publicId },
        {
          isTemp: false,
          finalizedAt: new Date(),
        },
        { new: true }
      );

      if (updated) {
        results.success.push(publicId);
      } else {
        // Image not in DB, but that's okay - might be legacy
        results.success.push(publicId);
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
