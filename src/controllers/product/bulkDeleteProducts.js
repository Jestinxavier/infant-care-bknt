const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const Review = require("../../models/Review");
const { cloudinary } = require("../../config/cloudinary");
const { extractImagePublicIds } = require("../../utils/mediaFinalizer");
const Media = require("../../models/Media");

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
                message: "Product IDs array is required and must not be empty"
            });
        }

        // Validate each product ID format
        const invalidIds = productIds.filter(id => {
            if (!id || id === 'undefined' || id === 'null') return true;
            return !/^[0-9a-fA-F]{24}$/.test(id);
        });

        if (invalidIds.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID format detected",
                invalidIds
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
            deletedImagesCount: 0
        };

        // Process each product deletion
        for (const productId of productIds) {
            try {
                // Check if product exists
                const product = await Product.findById(productId);
                if (!product) {
                    results.failed.push({
                        productId,
                        reason: "Product not found"
                    });
                    results.failureCount++;
                    continue;
                }

                // Get all variant IDs for this product
                const variants = await Variant.find({ productId }).select('_id');
                const variantIds = variants.map(v => v._id);

                // Delete all reviews associated with these variants
                let deletedReviewsCount = 0;
                if (variantIds.length > 0) {
                    const deleteReviewsResult = await Review.deleteMany({
                        variantId: { $in: variantIds }
                    });
                    deletedReviewsCount = deleteReviewsResult.deletedCount;
                    results.deletedReviewsCount += deletedReviewsCount;
                }

                // Delete all variants associated with this product
                const deleteVariantsResult = await Variant.deleteMany({ productId });
                const deletedVariantsCount = deleteVariantsResult.deletedCount;
                results.deletedVariantsCount += deletedVariantsCount;

                // Extract and delete all images from Cloudinary
                let deletedImagesCount = 0;
                try {
                    const publicIds = extractImagePublicIds(product);

                    if (publicIds.length > 0) {
                        for (const publicId of publicIds) {
                            try {
                                await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
                                deletedImagesCount++;

                                // Remove from Media collection
                                await Media.deleteOne({ public_id: publicId });
                            } catch (imgError) {
                                console.warn(`⚠️ Could not delete image ${publicId}:`, imgError.message);
                            }
                        }
                        results.deletedImagesCount += deletedImagesCount;
                    }
                } catch (imageError) {
                    console.error(`❌ Error deleting images for product ${productId}:`, imageError);
                    // Continue with product deletion even if images fail
                }

                // Delete the product
                await Product.findByIdAndDelete(productId);

                // Track successful deletion
                results.successful.push({
                    productId,
                    name: product.name,
                    deletedVariants: deletedVariantsCount,
                    deletedReviews: deletedReviewsCount,
                    deletedImages: deletedImagesCount
                });
                results.successCount++;

                console.log(`✅ Deleted product ${productId}: ${product.name}`);
            } catch (error) {
                console.error(`❌ Error deleting product ${productId}:`, error);
                results.failed.push({
                    productId,
                    reason: error.message || "Unknown error"
                });
                results.failureCount++;
            }
        }

        // Determine response status
        const allSuccessful = results.failureCount === 0;
        const allFailed = results.successCount === 0;
        const partialSuccess = results.successCount > 0 && results.failureCount > 0;

        const statusCode = allFailed ? 400 : 200;

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
                failed: results.failed
            }
        });
    } catch (err) {
        console.error("❌ Bulk delete error:", err);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: err.message
        });
    }
};

module.exports = bulkDeleteProducts;
