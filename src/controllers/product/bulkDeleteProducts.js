const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const Review = require("../../models/Review");
const { extractImagePublicIds } = require("../../utils/mediaFinalizer");
const Media = require("../../models/Media");
const logger = require("../../utils/logger");
const {
  invalidateProductCatalogCaches,
} = require("../../utils/productCacheInvalidation");
const { removeProductsByIds } = require("../../services/searchIndexService");

/**
 * Bulk delete multiple products and all their associated data
 * Accepts an array of product IDs and deletes them with error tracking
 */
const bulkDeleteProducts = async (req, res) => {
  try {
    const { productIds } = req.body;

    // Validate input
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Product IDs array is required and must not be empty",
      });
    }

    // Validate each product ID format
    const invalidIds = productIds.filter((id) => {
      if (!id || id === "undefined" || id === "null") return true;
      return !/^[0-9a-fA-F]{24}$/.test(id);
    });

    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format detected",
        invalidIds,
      });
    }

    // Track results
    const results = {
      successful: [],
      failed: [],
      totalRequested: productIds.length,
      successCount: 0,
      failureCount: 0,
      deletedVariantsCount: 0,
      deletedReviewsCount: 0,
      deletedImagesCount: 0,
    };

    // Batch-prefetch all target products and their legacy variants in two
    // queries instead of a findById + Variant.find per product (N+1).
    const productDocs = await Product.find({ _id: { $in: productIds } });
    const productById = new Map(productDocs.map((p) => [String(p._id), p]));

    const allVariants = await Variant.find({
      productId: { $in: productIds },
    }).select("_id productId");
    const variantIdsByProduct = new Map();
    for (const v of allVariants) {
      const key = String(v.productId);
      if (!variantIdsByProduct.has(key)) variantIdsByProduct.set(key, []);
      variantIdsByProduct.get(key).push(v._id);
    }

    // Process each product deletion
    for (const productId of productIds) {
      try {
        // Check if product exists
        const product = productById.get(String(productId));
        if (!product) {
          results.failed.push({
            productId,
            reason: "Product not found",
          });
          results.failureCount++;
          continue;
        }

        // Variant IDs for this product (from the batched fetch)
        const variantIds = variantIdsByProduct.get(String(productId)) || [];

        // Delete all reviews associated with these variants
        let deletedReviewsCount = 0;
        if (variantIds.length > 0) {
          const deleteReviewsResult = await Review.deleteMany({
            variantId: { $in: variantIds },
          });
          deletedReviewsCount = deleteReviewsResult.deletedCount;
          results.deletedReviewsCount += deletedReviewsCount;
        }

        // Delete all variants associated with this product
        const deleteVariantsResult = await Variant.deleteMany({ productId });
        const deletedVariantsCount = deleteVariantsResult.deletedCount;
        results.deletedVariantsCount += deletedVariantsCount;

        // Extract images but defer deletion (batch process at end)
        const publicIds = extractImagePublicIds(product);
        if (publicIds.length > 0) {
          // Store for batch processing
          if (!results.allPublicIds) results.allPublicIds = new Set();
          if (!results.productImagesMap) results.productImagesMap = new Map();

          publicIds.forEach((id) => results.allPublicIds.add(id));
          results.productImagesMap.set(productId, publicIds);
        }

        // Delete the product
        await Product.findByIdAndDelete(productId);

        // Track successful deletion
        // At this point images are only queued for batch deletion,
        // so per-product deletedImages is not yet known. Use 0 here;
        // the aggregated deletedImagesCount is computed after batch deletion.
        results.successful.push({
          productId,
          name: product.name,
          deletedVariants: deletedVariantsCount,
          deletedReviews: deletedReviewsCount,
          deletedImages: 0,
        });
        results.successCount++;

        logger.info(`✅ Deleted product ${productId}: ${product.name}`);
      } catch (error) {
        logger.error(`❌ Error deleting product ${productId}:`, error);
        results.failed.push({
          productId,
          reason: error.message || "Unknown error",
        });
        results.failureCount++;
      }
    }

    // Fire-and-forget: drop deleted products from search index
    if (results.successful.length > 0) {
      removeProductsByIds(results.successful.map((r) => r.productId));
    }

    // Batch process image deletion AFTER all products are deleted
    if (results.allPublicIds && results.allPublicIds.size > 0) {
      try {
        logger.info(
          `Processing ${results.allPublicIds.size} unique images from bulk delete...`,
        );

        const Asset = require("../../models/Asset");
        const allPublicIdsArray = Array.from(results.allPublicIds);
        const assets = await Asset.find({
          publicId: { $in: allPublicIdsArray },
        });

        const safeToDeleteIds = [];
        let skippedCount = 0;

        for (const publicId of allPublicIdsArray) {
          const asset = assets.find((a) => a.publicId === publicId);

          if (!asset) {
            // Legacy image not in Asset DB - safe to delete
            safeToDeleteIds.push(publicId);
          } else {
            // Check if used by products OUTSIDE the deletion batch
            const usedByOthers = asset.usedBy.some((usage) => {
              if (usage.entity !== "product") return true; // Used by non-product entity
              return !productIds.includes(usage.id.toString()); // Used by product not being deleted
            });

            if (usedByOthers) {
              logger.info(`⚠️ Skipping shared image: ${publicId}`);
              skippedCount++;

              // Remove references to deleted products
              asset.usedBy = asset.usedBy.filter(
                (usage) =>
                  usage.entity !== "product" ||
                  !productIds.includes(usage.id.toString()),
              );
              await asset.save();
            } else {
              safeToDeleteIds.push(publicId);
            }
          }
        }

        if (safeToDeleteIds.length > 0) {
          const { deleteAssets } = require("../../utils/mediaFinalizer");
          const deleteResults = await deleteAssets(safeToDeleteIds);
          results.deletedImagesCount =
            deleteResults.deleted.length + deleteResults.archived.length;
          logger.info(`✅ Deleted ${results.deletedImagesCount} images`);
        }

        if (skippedCount > 0) {
          logger.info(`✓ Protected ${skippedCount} shared images`);
        }
      } catch (imageError) {
        logger.error("❌ Error batch processing images:", imageError);
      }
    }

    // Determine response status
    const allSuccessful = results.failureCount === 0;
    const allFailed = results.successCount === 0;
    const partialSuccess = results.successCount > 0 && results.failureCount > 0;

    const statusCode = allFailed ? 400 : 200;

    if (results.successCount > 0) {
      invalidateProductCatalogCaches("products bulk deleted");
    }

    return res.status(statusCode).json({
      success: allSuccessful,
      partialSuccess,
      message: allSuccessful
        ? `Successfully deleted ${results.successCount} product(s)`
        : partialSuccess
          ? `Deleted ${results.successCount} of ${results.totalRequested} product(s). ${results.failureCount} failed.`
          : `Failed to delete all ${results.totalRequested} product(s)`,
      results: {
        totalRequested: results.totalRequested,
        successCount: results.successCount,
        failureCount: results.failureCount,
        deletedVariantsCount: results.deletedVariantsCount,
        deletedReviewsCount: results.deletedReviewsCount,
        deletedImagesCount: results.deletedImagesCount,
        successful: results.successful,
        failed: results.failed,
      },
    });
  } catch (err) {
    logger.error("❌ Bulk delete error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
          });
  }
};

module.exports = bulkDeleteProducts;
