/**
 * Pricing Utilities
 * Handles time-aware offer price resolution and validation.
 */

/**
 * Determines if an offer is currently active based on validity dates.
 * @param {number|null} offerPrice - The configured offer price
 * @param {Date|string|null} startAt - Offer start datetime (UTC)
 * @param {Date|string|null} endAt - Offer end datetime (UTC)
 * @returns {boolean}
 */
function isOfferActive(offerPrice, startAt, endAt) {
  if (!offerPrice || offerPrice <= 0) return false;

  const now = new Date();

  if (startAt && now < new Date(startAt)) return false; // Not started yet
  if (endAt && now > new Date(endAt)) return false; // Already expired

  return true;
}

/**
 * Resolves pricing with computed discountPrice based on offer validity.
 * @param {object} pricing - Pricing object with price, offerPrice, offerStartAt, offerEndAt
 * @returns {{ price: number, discountPrice: number|null, isOfferActive: boolean, offer: object|null }}
 */
function resolvePrice(pricing) {
  if (!pricing) {
    return { price: 0, discountPrice: null, isOfferActive: false, offer: null };
  }

  const { price, offerPrice, offerStartAt, offerEndAt } = pricing;
  const active = isOfferActive(offerPrice, offerStartAt, offerEndAt);

  return {
    price: price || 0,
    discountPrice: active ? offerPrice : null,
    isOfferActive: active,
    offer:
      offerPrice > 0
        ? {
            price: offerPrice,
            startAt: offerStartAt || null,
            endAt: offerEndAt || null,
          }
        : null,
  };
}

/**
 * Validates pricing data before save.
 * @param {object} pricing - Pricing object to validate
 * @returns {string[]} - Array of error messages (empty if valid)
 */
function validatePricing(pricing) {
  if (!pricing) return [];

  const { price, offerPrice, offerStartAt, offerEndAt } = pricing;
  const errors = [];

  // offerPrice must be less than price
  if (offerPrice && price && offerPrice >= price) {
    errors.push("Offer price must be less than base price");
  }

  // If validity dates are set, offerPrice must exist
  if ((offerStartAt || offerEndAt) && !offerPrice) {
    errors.push("Offer price is required when validity dates are set");
  }

  // End date must be after start date
  if (offerStartAt && offerEndAt) {
    const start = new Date(offerStartAt);
    const end = new Date(offerEndAt);
    if (end <= start) {
      errors.push("Offer end date must be after start date");
    }
  }

  return errors;
}

/**
 * Applies pricing resolution to a product object (mutates in place for performance).
 * @param {object} product - Product object with pricing fields
 * @returns {object} - Product with resolved pricing
 */
function applyPricingResolution(product) {
  if (!product) return product;

  // Resolve product-level pricing
  const productPricing = {
    price: product.price || product.pricing?.price,
    offerPrice: product.offerPrice || product.pricing?.offerPrice,
    offerStartAt: product.offerStartAt || product.pricing?.offerStartAt,
    offerEndAt: product.offerEndAt || product.pricing?.offerEndAt,
  };

  const resolved = resolvePrice(productPricing);
  product.price = resolved.price;
  product.discountPrice = resolved.discountPrice;
  product.isOfferActive = resolved.isOfferActive;
  product.offer = resolved.offer;

  // Resolve variant-level pricing
  if (product.variants && Array.isArray(product.variants)) {
    product.variants = product.variants.map((variant) => {
      const variantPricing = {
        price: variant.price || variant.pricing?.price,
        offerPrice: variant.offerPrice || variant.pricing?.offerPrice,
        offerStartAt: variant.offerStartAt || variant.pricing?.offerStartAt,
        offerEndAt: variant.offerEndAt || variant.pricing?.offerEndAt,
      };

      const variantResolved = resolvePrice(variantPricing);
      return {
        ...variant,
        price: variantResolved.price,
        discountPrice: variantResolved.discountPrice,
        isOfferActive: variantResolved.isOfferActive,
        offer: variantResolved.offer,
      };
    });
  }

  return product;
}

module.exports = {
  isOfferActive,
  resolvePrice,
  validatePricing,
  applyPricingResolution,
};
