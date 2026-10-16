/**
 * Shared product pricing helpers for lightweight storefront payloads
 * (search suggestions, "you may like", etc.).
 *
 * Configurable products store price/offer on variants rather than the root, so
 * a naive `product.price` reads back as 0. These helpers resolve the effective
 * MRP and the currently-active offer price across both levels.
 */

const getActiveOfferPrice = (offerPrice, offerStartAt, offerEndAt) => {
  if (!offerPrice) return null;
  const now = Date.now();
  const afterStart = !offerStartAt || now >= new Date(offerStartAt).getTime();
  const beforeEnd = !offerEndAt || now <= new Date(offerEndAt).getTime();
  return afterStart && beforeEnd ? offerPrice : null;
};

/**
 * Effective MRP (regular_price) and active offer (offer_price) for a product.
 * Returns offer_price: null when there is no active, cheaper offer.
 *
 * @param {object} product lean product with price/offerPrice/variants
 * @returns {{ regular_price: number, offer_price: number|null }}
 */
const getPricing = (product) => {
  const variants = Array.isArray(product.variants) ? product.variants : [];

  let regular = product.pricing?.price || product.price || 0;
  const variantPrices = variants.map((v) => v.price).filter((p) => p > 0);
  if (variantPrices.length > 0) regular = Math.min(...variantPrices);

  let offer = getActiveOfferPrice(
    product.offerPrice,
    product.offerStartAt,
    product.offerEndAt
  );
  const variantOffers = variants
    .map((v) => getActiveOfferPrice(v.offerPrice, v.offerStartAt, v.offerEndAt))
    .filter((o) => o > 0);
  if (variantOffers.length > 0) {
    const minVariantOffer = Math.min(...variantOffers);
    offer = offer == null ? minVariantOffer : Math.min(offer, minVariantOffer);
  }

  const hasOffer = offer != null && offer > 0 && offer < regular;
  return {
    regular_price: regular,
    offer_price: hasOffer ? offer : null,
  };
};

module.exports = { getActiveOfferPrice, getPricing };
