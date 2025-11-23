const { formatLabel } = require("./formatLabel");

/**
 * Transform raw filter data into FilterConfig format for frontend
 * This matches the structure expected by FilterContent component
 * 
 * @param {Object} rawFilters - Raw filter data from products
 * @param {string[]} rawFilters.color - Array of color values
 * @param {string[]} rawFilters.size - Array of size values
 * @param {string[]} rawFilters.brand - Array of brand values
 * @param {Object} rawFilters.priceRange - Price range object with min/max
 * @returns {Array} FilterConfig array matching frontend FilterConfig type
 */
const generateFilterConfig = (rawFilters) => {
  const filterConfigs = [];

  // Price Range Slider
  if (rawFilters.priceRange && typeof rawFilters.priceRange === "object") {
    const { min, max } = rawFilters.priceRange;
    if (typeof min === "number" && typeof max === "number" && max > min) {
      filterConfigs.push({
        key: "priceRange",
        label: "Price",
        type: "slider",
        min: Math.floor(min),
        max: Math.ceil(max),
        step: Math.max(10, Math.floor((max - min) / 20)), // Dynamic step based on range
      });
    }
  }

  // Color Checkbox
  if (rawFilters.color && Array.isArray(rawFilters.color) && rawFilters.color.length > 0) {
    filterConfigs.push({
      key: "color",
      label: "Color",
      type: "checkbox",
      options: rawFilters.color.map((color) => ({
        value: color, // Keep original value
        label: formatLabel(color), // Format label for display
      })),
    });
  }

  // Size/Age Checkbox (API uses "size", frontend uses "age")
  if (rawFilters.size && Array.isArray(rawFilters.size) && rawFilters.size.length > 0) {
    filterConfigs.push({
      key: "age",
      label: "Size",
      type: "checkbox",
      options: rawFilters.size.map((size) => ({
        value: size, // Keep original value
        label: formatLabel(size), // Format label for display (e.g., "0-3" -> "0 - 3")
      })),
    });
  }

  // Brand Checkbox (if available)
  // Note: Brand is not currently in FilterConfig type, so we skip it
  // If you want to add brand filtering, update FilterConfig type to include it
  // if (rawFilters.brand && Array.isArray(rawFilters.brand) && rawFilters.brand.length > 0) {
  //   filterConfigs.push({
  //     key: "brand",
  //     label: "Brand",
  //     type: "checkbox",
  //     options: rawFilters.brand.map((brand) => ({
  //       value: brand,
  //       label: brand,
  //     })),
  //   });
  // }

  // In Stock Radio (always available) - Changed from toggle to radio
  filterConfigs.push({
    key: "inStock",
    label: "Availability",
    type: "radio",
    options: [
      { value: "true", label: "In Stock" },
      { value: "false", label: "Out of Stock" },
    ],
  });

  // Sort By Radio (always available)
  filterConfigs.push({
    key: "sortBy",
    label: "Sort by",
    type: "radio",
    options: [
      { value: "newest", label: "Latest" },
      { value: "price_low", label: "Price: Low to High" },
      { value: "price_high", label: "Price: High to Low" },
      { value: "rating", label: "Highest Rated" },
      { value: "popularity", label: "Most Popular" },
    ],
  });

  return filterConfigs;
};

module.exports = { generateFilterConfig };

