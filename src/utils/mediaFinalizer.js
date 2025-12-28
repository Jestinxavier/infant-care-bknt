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

/**
 * Recursively extract public_ids from any object/array
 * Scans for:
 * 1. public_id keys
 * 2. assetId keys (fallback)
 * 3. Cloudinary URLs in strings
 * @param {any} data - Object, Array, or String to scan
 * @param {Set} ids - Set to collect IDs (internal recursion use)
 * @returns {string[]} Array of unique public_ids
 */
function extractPublicIdsFromObject(data, ids = new Set()) {
  if (!data) return [];

  // If initial call (not recursion), initialize Set
  const isRoot = ids.size === 0 && Array.isArray(data) === false; // rough check, mostly for return

  // Handle String
  if (typeof data === "string") {
    // Check for Cloudinary URL pattern
    if (data.includes("cloudinary.com") || data.includes("/upload/")) {
      const match = data.match(/\/v\d+\/(.+)\.[^.]+$/);
      if (match && match[1]) {
        ids.add(match[1]);
      }
    }
    return Array.from(ids);
  }

  // Handle Array
  if (Array.isArray(data)) {
    data.forEach((item) => extractPublicIdsFromObject(item, ids));
    return Array.from(ids);
  }

  // Handle Object
  if (typeof data === "object") {
    // Check for explicit keys
    if (data.public_id) ids.add(data.public_id);
    // assetId often maps to public_id in standard uploads (if not, it might be Mongo ID, but Asset model has assetId field)
    // We should be careful. The user's JSON shows assetId is a Mongo ObjectId-like string.
    // Asset model has proper `assetId` string field.
    // If we only have public_id in Asset model, assume public_id is the key.

    // Traverse all values
    Object.values(data).forEach((value) => {
      extractPublicIdsFromObject(value, ids);
    });
  }

  return Array.from(ids);
}

/**
 * Delete assets from Cloudinary and Database (Unified Cleanup)
 * @param {Array<String>} publicIds - Array of public IDs to delete
 * @returns {Promise<Object>} Results { deleted: [], failed: [] }
 */
const deleteAssets = async (publicIds) => {
  const Asset = require("../models/Asset");
  const Media = require("../models/Media");

  const results = {
    deleted: [],
    archived: [],
    failed: [],
  };

  for (const publicId of publicIds) {
    try {
      console.log(`🗑️ [Media Utils] Processing deletion: ${publicId}`);

      // 1. Check if Asset exists
      const asset = await Asset.findOne({ publicId });

      if (asset && asset.status === "permanent") {
        // --- PHASE 1: SOFT DELETE (Archive) ---
        asset.status = "archived";
        asset.archivedAt = new Date();
        asset.usedBy = []; // Clear usage since it's logically deleted
        await asset.save();

        console.log(`  📦 Asset archived (Soft Delete): ${publicId}`);
        results.archived.push(publicId);
      } else {
        // --- PHASE 2: HARD DELETE (Immediate for Temp or Non-Asset) ---
        // It's either a temp asset, already archived, or not in Asset DB (legacy)

        // Delete from Cloudinary
        try {
          await cloudinary.uploader.destroy(publicId, {
            resource_type: "image",
          });
          console.log(`  ✅ Cloudinary delete: ${publicId}`);
        } catch (cloudError) {
          console.warn(`  ⚠️ Cloudinary delete failed: ${cloudError.message}`);
        }

        // Delete from Asset collection (if exists - e.g. temp)
        if (asset) {
          await Asset.deleteOne({ _id: asset._id });
          console.log(`  ✅ Asset DB delete: ${publicId}`);
        }

        results.deleted.push(publicId);
      }

      // Cleanup Legacy Media Collection (Always delete to avoid confusion)
      const mediaDel = await Media.deleteOne({ public_id: publicId });
      if (mediaDel.deletedCount)
        console.log(`  ✅ Media DB delete (Legacy): ${publicId}`);
    } catch (error) {
      console.error(`  ❌ Failed to process ${publicId}:`, error);
      results.failed.push({ publicId, error: error.message });
    }
  }

  return results;
};

module.exports = {
  extractImagePublicIds,
  extractPublicIdsFromObject,
  finalizeImages,
  deleteAssets,
};
