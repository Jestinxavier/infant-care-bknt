function validateProductPricing({
  productType,
  price,
  offerPrice,
  offerStartAt,
  offerEndAt,
  variants,
}) {
  const errors = [];
  const basePrice = Number(price);
  const discountPrice = Number(offerPrice);
  const hasOffer = offerPrice !== undefined && offerPrice !== null && offerPrice !== "" && discountPrice > 0;
  const hasStart = offerStartAt !== undefined && offerStartAt !== null && offerStartAt !== "";
  const hasEnd = offerEndAt !== undefined && offerEndAt !== null && offerEndAt !== "";

  if (hasOffer && (productType === "SIMPLE" || productType === "BUNDLE")) {
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      errors.push("A regular price is required when an offer price is set");
    } else if (discountPrice >= basePrice) {
      errors.push("Offer price must be less than the regular price");
    }
  }

  if ((hasStart || hasEnd) && !hasOffer) {
    errors.push("Offer dates require a valid offer price");
  }

  if (hasStart && hasEnd) {
    const start = new Date(offerStartAt);
    const end = new Date(offerEndAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      errors.push("Offer dates must be valid dates");
    } else if (end <= start) {
      errors.push("Offer end date must be after the start date");
    }
  }

  if (productType === "CONFIGURABLE" && Array.isArray(variants)) {
    variants.forEach((variant, index) => {
      const variantErrors = validateProductPricing({
        productType: "SIMPLE",
        price: variant?.price,
        offerPrice: variant?.offerPrice,
        offerStartAt: variant?.offerStartAt,
        offerEndAt: variant?.offerEndAt,
      });
      errors.push(...variantErrors.map((error) => `Variant ${index + 1}: ${error}`));
    });
  }

  return errors;
}

module.exports = { validateProductPricing };
