const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const Review = require("../../models/Review");
const { cloudinary } = require("../../config/cloudinary");
const { extractImagePublicIds } = require("../../utils/mediaFinalizer");
const Media = require("../../models/Media");

/**
 * Delete a product and all its variants, reviews, and related data
 */
const deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    // Validate productId
    if (!productId || productId === "undefined" || productId === "null") {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    // Validate ObjectId format
    if (!/^[0-9a-fA-F]{24}$/.test(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format",
      });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Step 1: Get all variant IDs for this product
    const variants = await Variant.find({ productId }).select("_id");
    const variantIds = variants.map((v) => v._id);

    // Step 2: Delete all reviews associated with these variants
    let deletedReviewsCount = 0;
    if (variantIds.length > 0) {
      const deleteReviewsResult = await Review.deleteMany({
        variantId: { $in: variantIds },
      });
      deletedReviewsCount = deleteReviewsResult.deletedCount;
      console.log(
        `Deleted ${deletedReviewsCount} reviews for ${variantIds.length} variants`,
      );
    }

    // Step 3: Delete all variants associated with this product
    const deleteVariantsResult = await Variant.deleteMany({ productId });
    const deletedVariantsCount = deleteVariantsResult.deletedCount;
    console.log(
      `Deleted ${deletedVariantsCount} variants for product ${productId}`,
    );

    // Step 4: Extract and delete only UNUSED images from Cloudinary and DB
    let deletedImagesCount = 0;
    let skippedImagesCount = 0;
    try {
      const publicIds = extractImagePublicIds(product);

      if (publicIds.length > 0) {
        console.log(`Checking usage for ${publicIds.length} images...`);

        // Query Asset DB to check usage
        const Asset = require("../../models/Asset");
        const assets = await Asset.find({ publicId: { $in: publicIds } });

        // Filter: only delete images that are EXCLUSIVELY used by this product
        const safeToDeleteIds = [];
        const sharedImageIds = [];

        for (const publicId of publicIds) {
          const asset = assets.find((a) => a.publicId === publicId);

          if (!asset) {
            // Asset not tracked in DB - legacy image, safe to delete
            safeToDeleteIds.push(publicId);
          } else {
            // Check if used by other entities
            const usedByOthers = asset.usedBy.some(
              (usage) =>
                usage.entity !== "product" || !usage.id.equals(product._id),
            );

            if (usedByOthers || asset.usedBy.length > 1) {
              // Image is shared with other products/entities - skip deletion
              console.log(
                `⚠️ Skipping deletion of shared image: ${publicId} (used by ${asset.usedBy.length} entities)`,
              );
              sharedImageIds.push(publicId);
              skippedImagesCount++;

              // Remove only THIS product's reference from usedBy
              asset.usedBy = asset.usedBy.filter(
                (usage) =>
                  usage.entity !== "product" || !usage.id.equals(product._id),
              );
              await asset.save();
            } else {
              // Image is only used by this product - safe to delete
              safeToDeleteIds.push(publicId);
            }
          }
        }

        if (safeToDeleteIds.length > 0) {
          console.log(`Deleting ${safeToDeleteIds.length} exclusive images...`);
          const { deleteAssets } = require("../../utils/mediaFinalizer");
          const results = await deleteAssets(safeToDeleteIds);
          deletedImagesCount = results.deleted.length + results.archived.length;
          console.log(`Deleted ${deletedImagesCount} images successfully`);
        }

        if (sharedImageIds.length > 0) {
          console.log(
            `✓ Protected ${sharedImageIds.length} shared images from deletion`,
          );
        }
      }
    } catch (imageError) {
      console.error("❌ Error processing images:", imageError);
      // Continue with product deletion even if images fail
    }

    // Step 5: Delete the product
    await Product.findByIdAndDelete(productId);
    console.log(`Deleted product ${productId}: ${product.name}`);

    res.status(200).json({
      success: true,
      message: "Product and all associated data deleted successfully",
      deletedProduct: {
        id: product._id,
        name: product.name,
      },
      deletedVariantsCount,
      deletedReviewsCount,
      deletedImagesCount,
    });
  } catch (err) {
    console.error("❌ Error deleting product:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = deleteProduct;
