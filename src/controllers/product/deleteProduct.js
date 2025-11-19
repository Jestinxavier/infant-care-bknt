const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const Review = require("../../models/Review");

/**
 * Delete a product and all its variants, reviews, and related data
 */
const deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    // Validate productId
    if (!productId || productId === 'undefined' || productId === 'null') {
      return res.status(400).json({
        success: false,
        message: "Product ID is required"
      });
    }

    // Validate ObjectId format
    if (!/^[0-9a-fA-F]{24}$/.test(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format"
      });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    // Step 1: Get all variant IDs for this product
    const variants = await Variant.find({ productId }).select('_id');
    const variantIds = variants.map(v => v._id);

    // Step 2: Delete all reviews associated with these variants
    let deletedReviewsCount = 0;
    if (variantIds.length > 0) {
      const deleteReviewsResult = await Review.deleteMany({ variantId: { $in: variantIds } });
      deletedReviewsCount = deleteReviewsResult.deletedCount;
      console.log(`Deleted ${deletedReviewsCount} reviews for ${variantIds.length} variants`);
    }

    // Step 3: Delete all variants associated with this product
    const deleteVariantsResult = await Variant.deleteMany({ productId });
    const deletedVariantsCount = deleteVariantsResult.deletedCount;
    console.log(`Deleted ${deletedVariantsCount} variants for product ${productId}`);

    // Step 4: Delete the product
    await Product.findByIdAndDelete(productId);
    console.log(`Deleted product ${productId}: ${product.name}`);

    res.status(200).json({
      success: true,
      message: "Product and all associated data deleted successfully",
      deletedProduct: {
        id: product._id,
        name: product.name
      },
      deletedVariantsCount,
      deletedReviewsCount
    });
  } catch (err) {
    console.error("❌ Error deleting product:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};

module.exports = deleteProduct;

