/**
 * Format product data for API response in the new structure
 * Converts from database format to frontend format
 */
const { resolvePrice } = require("./pricingUtils");
const { ensureImageUrl, ensureImageUrls } = require("./cloudinaryUrlUtils");

const formatProductResponse = (product) => {
  const productObj = product.toObject ? product.toObject() : product;

  // Get category info
  const categoryName =
    productObj.category?.name || productObj.categoryName || productObj.category;
  const categorySlug =
    productObj.category?.slug ||
    categoryName?.toLowerCase().replace(/\s+/g, "-");

  // Format variants
  const formattedVariants = (productObj.variants || []).map((variant) => {
    // Use attributes if available, otherwise use options
    const attributes = variant.attributes
      ? variant.attributes instanceof Map
        ? Object.fromEntries(variant.attributes)
        : variant.attributes
      : variant.options instanceof Map
      ? Object.fromEntries(variant.options)
      : variant.options || {};

    // Get pricing - use flat fields only (discountPrice computed via resolvePrice)
    const variantPricing = {
      price: variant.price || 0,
      offerPrice: variant.offerPrice,
      offerStartAt: variant.offerStartAt,
      offerEndAt: variant.offerEndAt,
    };
    const resolvedPricing = resolvePrice(variantPricing);

    // Get stock - prefer nested stock object, fallback to direct field
    const stock =
      variant.stockObj?.available !== undefined
        ? variant.stockObj.available
        : variant.stock || 0;
    const isInStock =
      variant.stockObj?.isInStock !== undefined
        ? variant.stockObj.isInStock
        : stock > 0;

    return {
      id: variant.id,
      url_key: variant.url_key, // Include variant url_key in response
      sku: variant.sku,
      attributes: attributes,
      images: ensureImageUrls(variant.images || []),
      pricing: {
        price: resolvedPricing.price,
        ...(resolvedPricing.discountPrice
          ? { discountPrice: resolvedPricing.discountPrice }
          : {}),
      },
      isOfferActive: resolvedPricing.isOfferActive,
      ...(resolvedPricing.offer ? { offer: resolvedPricing.offer } : {}),
      stock: {
        available: stock,
        isInStock: isInStock,
      },
    };
  });

  // Format variantOptions (hex is now in uiMeta, not in variant option values)
  const formattedVariantOptions = (productObj.variantOptions || []).map(
    (option) => ({
      name: option.name,
      code: option.code,
      values: (option.values || []).map((val) => ({
        label: val.label || val.value,
        value: val.value,
        // hex is available in uiMeta - no longer included here
      })),
    })
  );

  // Format details - preserve new structure (description/grid/pair)
  const formattedDetails = (productObj.details || []).map((detail) => {
    // Just return detail as-is to preserve all fields including type, description, data
    // The schema already handles the correct structure
    return detail;
  });

  // Get category value - return full object if populated
  let categoryValue;
  if (
    productObj.category &&
    typeof productObj.category === "object" &&
    productObj.category._id
  ) {
    // Category was populated - return the full object
    categoryValue = {
      _id: productObj.category._id.toString(),
      name: productObj.category.name,
      slug: productObj.category.slug,
    };
  } else {
    // Category not populated - return the slug or name as fallback
    categoryValue = categorySlug || categoryName;
  }

  // Format response
  return {
    id: productObj._id?.toString() || productObj.id,
    sku: productObj.sku, // ✅ Include SKU in response
    url_key: productObj.url_key,
    title: productObj.title || productObj.name,
    description: productObj.description,
    product_type: productObj.product_type || "SIMPLE",
    // Include bundle config for BUNDLE products
    ...(productObj.product_type === "BUNDLE" && productObj.bundle_config
      ? {
          bundle_config: {
            pricing: productObj.bundle_config.pricing || "FIXED",
            items: (productObj.bundle_config.items || []).map((item) => ({
              sku: item.sku,
              qty: item.qty,
              title: item.title,
              url_key: item.url_key,
              isFree: item.isFree,
            })),
            gift_slot: productObj.bundle_config.gift_slot
              ? {
                  enabled: productObj.bundle_config.gift_slot.enabled,
                  qty: productObj.bundle_config.gift_slot.qty,
                  options: (
                    productObj.bundle_config.gift_slot.options || []
                  ).map((opt) => ({
                    sku: opt.sku,
                    label: opt.label,
                    image: opt.image ? ensureImageUrl(opt.image) : undefined,
                  })),
                }
              : undefined,
          },
        }
      : {}),
    category: categoryValue,
    images: ensureImageUrls(productObj.images || []),
    rating: {
      value: productObj.averageRating || 0,
      totalReviews: productObj.totalReviews || 0,
    },
    pricing: (() => {
      // Calculate pricing from variants if available
      let parentPrice = 0;
      let parentDiscountPrice = null;

      if (formattedVariants.length > 0) {
        // Get all variant effective prices (discountPrice if available, otherwise regular price)
        const variantEffectivePrices = formattedVariants
          .map((v) => {
            const vPrice = v.pricing.price || 0;
            const vDiscountPrice = v.pricing.discountPrice;
            // Use effective price (discountPrice if available, otherwise regular price)
            return vDiscountPrice && vDiscountPrice > 0
              ? vDiscountPrice
              : vPrice;
          })
          .filter((p) => p > 0);

        if (variantEffectivePrices.length > 0) {
          const minEffectivePrice = Math.min(...variantEffectivePrices);

          // Find the variant with the minimum effective price
          const variantWithMinPrice = formattedVariants.find((v) => {
            const vPrice = v.pricing.price || 0;
            const vDiscountPrice = v.pricing.discountPrice;
            const effectivePrice =
              vDiscountPrice && vDiscountPrice > 0 ? vDiscountPrice : vPrice;
            return effectivePrice === minEffectivePrice;
          });

          if (variantWithMinPrice) {
            // Set parentPrice to the variant's regular price
            parentPrice = variantWithMinPrice.pricing.price || 0;
            // Set parentDiscountPrice to the variant's discountPrice if it exists
            parentDiscountPrice =
              variantWithMinPrice.pricing.discountPrice || null;
          }
        }
      }

      // Fallback to product's own pricing fields if no variants or variant prices are 0
      if (parentPrice === 0) {
        const productPricing = {
          price: productObj.price || productObj.basePrice || 0,
          offerPrice: productObj.offerPrice,
          offerStartAt: productObj.offerStartAt,
          offerEndAt: productObj.offerEndAt,
        };
        const resolvedProductPricing = resolvePrice(productPricing);
        parentPrice = resolvedProductPricing.price;
        parentDiscountPrice = resolvedProductPricing.discountPrice;
      }

      return {
        price: parentPrice,
        ...(parentDiscountPrice ? { discountPrice: parentDiscountPrice } : {}),
      };
    })(),
    stock: (() => {
      // If product has variants, calculate from variants
      if (formattedVariants.length > 0) {
        return {
          available: formattedVariants.reduce(
            (sum, v) => sum + v.stock.available,
            0
          ),
          isInStock: formattedVariants.some((v) => v.stock.isInStock),
        };
      }

      // If no variants, use product's own stock fields
      const productStock =
        productObj.stockObj?.available !== undefined
          ? productObj.stockObj.available
          : productObj.stock !== undefined
          ? productObj.stock
          : 0;
      const productIsInStock =
        productObj.stockObj?.isInStock !== undefined
          ? productObj.stockObj.isInStock
          : productStock > 0;

      return {
        available: productStock,
        isInStock: productIsInStock,
      };
    })(),
    variantOptions: formattedVariantOptions,
    variants: formattedVariants,
    details: formattedDetails,
    // Additional fields
    tags: productObj.tags || "",
    meta_title: productObj.metaTitle || productObj.meta_title || "",
    meta_description:
      productObj.metaDescription || productObj.meta_description || "",
    uiMeta: productObj.uiMeta || {},
    // Quantity-based tier pricing
    quantityRules: productObj.quantityRules || [],
  };
};

module.exports = { formatProductResponse };
