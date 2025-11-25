/**
 * Format product data for API response in the new structure
 * Converts from database format to frontend format
 */
const formatProductResponse = (product) => {
  const productObj = product.toObject ? product.toObject() : product;
  
  // Get category info
  const categoryName = productObj.category?.name || productObj.categoryName || productObj.category;
  const categorySlug = productObj.category?.slug || categoryName?.toLowerCase().replace(/\s+/g, '-');
  
  // Format variants
  const formattedVariants = (productObj.variants || []).map((variant) => {
    // Use attributes if available, otherwise use options
    const attributes = variant.attributes 
      ? (variant.attributes instanceof Map ? Object.fromEntries(variant.attributes) : variant.attributes)
      : (variant.options instanceof Map ? Object.fromEntries(variant.options) : variant.options || {});
    
    // Get pricing - prefer nested pricing object, fallback to direct fields
    const price = variant.pricing?.price || variant.price || 0;
    const discountPrice = variant.pricing?.discountPrice || variant.discountPrice;
    
    // Get stock - prefer nested stock object, fallback to direct field
    const stock = variant.stockObj?.available !== undefined ? variant.stockObj.available : variant.stock || 0;
    const isInStock = variant.stockObj?.isInStock !== undefined ? variant.stockObj.isInStock : (stock > 0);
    
    return {
      id: variant.id,
      url_key: variant.url_key, // Include variant url_key in response
      sku: variant.sku,
      attributes: attributes,
      images: variant.images || [],
      pricing: {
        price: price,
        ...(discountPrice ? { discountPrice: discountPrice } : {}),
      },
      stock: {
        available: stock,
        isInStock: isInStock,
      },
    };
  });
  
  // Format variantOptions
  const formattedVariantOptions = (productObj.variantOptions || []).map((option) => ({
    name: option.name,
    code: option.code,
    values: (option.values || []).map((val) => ({
      label: val.label || val.value,
      value: val.value,
      ...(val.hex ? { hex: val.hex } : {}),
    })),
  }));
  
  // Format details
  const formattedDetails = (productObj.details || []).map((detail) => {
    // New format: has title and fields
    if (detail.title && detail.fields) {
      return {
        title: detail.title,
        fields: detail.fields.map((field) => {
          if (field.type === 'badges') {
            return {
              type: 'badges',
              value: Array.isArray(field.value) ? field.value : [field.value],
            };
          } else if (field.type === 'flex_box') {
            return {
              type: 'flex_box',
              value: Array.isArray(field.value) ? field.value : [field.value],
            };
          } else {
            return {
              label: field.label,
              value: field.value,
            };
          }
        }),
      };
    }
    // Legacy format: has label and value
    else if (detail.label && detail.value) {
      return {
        title: detail.label,
        fields: [
          {
            label: detail.label,
            value: detail.value,
            ...(detail.badges?.length > 0 ? { type: 'badges', value: detail.badges } : {}),
            ...(detail.flex_box ? { type: 'flex_box' } : {}),
          },
        ],
      };
    }
    return detail;
  });
  
  // Format response
  return {
    id: productObj._id?.toString() || productObj.id,
    url_key: productObj.url_key,
    title: productObj.title || productObj.name,
    description: productObj.description,
    category: categorySlug || categoryName,
    images: productObj.images || [],
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
          .map(v => {
            const vPrice = v.pricing.price || 0;
            const vDiscountPrice = v.pricing.discountPrice;
            // Use effective price (discountPrice if available, otherwise regular price)
            return vDiscountPrice && vDiscountPrice > 0 ? vDiscountPrice : vPrice;
          })
          .filter(p => p > 0);
        
        if (variantEffectivePrices.length > 0) {
          const minEffectivePrice = Math.min(...variantEffectivePrices);
          
          // Find the variant with the minimum effective price
          const variantWithMinPrice = formattedVariants.find(v => {
            const vPrice = v.pricing.price || 0;
            const vDiscountPrice = v.pricing.discountPrice;
            const effectivePrice = vDiscountPrice && vDiscountPrice > 0 ? vDiscountPrice : vPrice;
            return effectivePrice === minEffectivePrice;
          });
          
          if (variantWithMinPrice) {
            // Set parentPrice to the variant's regular price
            parentPrice = variantWithMinPrice.pricing.price || 0;
            // Set parentDiscountPrice to the variant's discountPrice if it exists
            parentDiscountPrice = variantWithMinPrice.pricing.discountPrice || null;
          }
        }
      }
      
      // Fallback to product's own pricing fields if no variants or variant prices are 0
      if (parentPrice === 0) {
        parentPrice = productObj.pricing?.price || productObj.price || productObj.basePrice || 0;
        parentDiscountPrice = productObj.pricing?.discountPrice || productObj.discountPrice || null;
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
          available: formattedVariants.reduce((sum, v) => sum + v.stock.available, 0),
          isInStock: formattedVariants.some(v => v.stock.isInStock),
        };
      }
      
      // If no variants, use product's own stock fields
      const productStock = productObj.stockObj?.available !== undefined
        ? productObj.stockObj.available
        : (productObj.stock !== undefined ? productObj.stock : 0);
      const productIsInStock = productStock > 0;
      
      return {
        available: productStock,
        isInStock: productIsInStock,
      };
    })(),
    variantOptions: formattedVariantOptions,
    variants: formattedVariants,
    details: formattedDetails,
  };
};

module.exports = { formatProductResponse };

