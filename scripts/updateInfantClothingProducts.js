/**
 * Update Script: Update existing infant clothing products
 *
 * This script updates existing products with the new structure including parent-level pricing
 *
 * Usage: node scripts/updateInfantClothingProducts.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

const Product = require("../src/models/Product");
const Category = require("../src/models/Category");
const { generateSlug } = require("../src/utils/slugGenerator");

const infantProducts = [
  /* -------------------------------------------------------
     PRODUCT 1 (Variants)
  ------------------------------------------------------- */
  {
    title: "Premium Organic Cotton Infant Jumpsuit",
    description:
      "Ultra-soft 100% organic cotton infant jumpsuit designed for comfort, breathability, and all-day wear.",
    categorySlug: "jumpsuits",
    url_key: "premium-organic-cotton-infant-jumpsuit",
    images: [
      "https://picsum.photos/seed/parent001/600",
      "https://picsum.photos/seed/parent002/600",
    ],

    pricing: {
      price: 1199,
      discountPrice: 999,
    },

    stock: {
      available: 120,
      isInStock: true,
    },

    variantOptions: [
      {
        id: "color",
        name: "Color",
        code: "color",
        values: [
          { id: "red", value: "red", label: "Red", hex: "#f44336" },
          { id: "blue", value: "blue", label: "Blue", hex: "#2196f3" },
        ],
      },
      {
        id: "size",
        name: "Size",
        code: "size",
        values: [
          { id: "0-3", value: "0-3", label: "0–3 Months" },
          { id: "3-6", value: "3-6", label: "3–6 Months" },
        ],
      },
    ],

    variants: [
      {
        id: "cotton_jumpsuit_red_0_3",
        sku: "CJ-RED-0-3",
        attributes: {
          color: "red",
          size: "0-3",
        },
        images: ["https://picsum.photos/seed/red03/600"],
        pricing: {
          price: 1199,
          discountPrice: 999,
        },
        stock: {
          available: 25,
          isInStock: true,
        },
      },

      {
        id: "cotton_jumpsuit_red_3_6",
        sku: "CJ-RED-3-6",
        attributes: {
          color: "red",
          size: "3-6",
        },
        images: ["https://picsum.photos/seed/red36/600"],
        pricing: {
          price: 1199,
        },
        stock: {
          available: 0,
          isInStock: false,
        },
      },

      {
        id: "cotton_jumpsuit_blue_0_3",
        sku: "CJ-BLU-0-3",
        attributes: {
          color: "blue",
          size: "0-3",
        },
        images: ["https://picsum.photos/seed/blue03/600"],
        pricing: {
          price: 1199,
          discountPrice: 899,
        },
        stock: {
          available: 34,
          isInStock: true,
        },
      },

      {
        id: "cotton_jumpsuit_blue_3_6",
        sku: "CJ-BLU-3-6",
        attributes: {
          color: "blue",
          size: "3-6",
        },
        images: ["https://picsum.photos/seed/blue36/600"],
        pricing: {
          price: 1199,
        },
        stock: {
          available: 61,
          isInStock: true,
        },
      },
    ],

    details: [
      {
        title: "Product Details",
        fields: [
          { label: "Material & Fabric", value: "100% Organic Cotton" },
          {
            type: "badges",
            value: [
              "Soft",
              "Breathable",
              "Lightweight",
              "Hypoallergenic",
              "Gentle on Skin",
            ],
          },
        ],
      },
      {
        title: "Design",
        fields: [
          {
            type: "flex_box",
            value: [
              { label: "Pattern", value: "Graphic Embroidered" },
              { label: "Neck", value: "Round Neck" },
              {
                label: "Sleeves",
                value: "Short Sleeves / Regular Sleeves",
              },
            ],
          },
        ],
      },
      {
        title: "Wash & Care",
        fields: [
          { label: "Machine Wash", value: "Cold, Gentle Cycle" },
          { label: "Bleach", value: "Do Not Bleach" },
          { label: "Drying", value: "Tumble Dry Low" },
        ],
      },
    ],

    status: "published",
  },
  /* -------------------------------------------------------
     PRODUCT 2 (No Variants)
  ------------------------------------------------------- */
  {
    title: "Soft Cotton Newborn Cap",
    description:
      "Premium cotton cap designed to keep newborns warm and comfortable.",
    categorySlug: "caps",
    url_key: "soft-cotton-newborn-cap",
    images: ["https://picsum.photos/seed/cap1/600"],
    pricing: { price: 299, discountPrice: 199 }, // ⭐ Parent pricing
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [
          { label: "Material", value: "100% Cotton" },
          { type: "badges", value: ["Breathable", "Skin-friendly"] },
        ],
      },
    ],
    status: "published",
  },

  /* -------------------------------------------------------
     PRODUCTS 3 to 40 AUTO-GENERATED
  ------------------------------------------------------- */
  ...Array.from({ length: 38 }).map((_, idx) => {
    const id = idx + 3;
    const hasVariants = Math.random() > 0.4;

    const colors = [
      { id: "pink", value: "pink", label: "Pink", hex: "#ffc0cb" },
      { id: "yellow", value: "yellow", label: "Yellow", hex: "#ffeb3b" },
      { id: "grey", value: "grey", label: "Grey", hex: "#9e9e9e" },
    ];

    const sizes = [
      { id: "0-3", value: "0-3", label: "0–3 Months" },
      { id: "3-6", value: "3-6", label: "3–6 Months" },
    ];

    const variants = hasVariants
      ? colors.flatMap((color) =>
          sizes.map((size) => {
            const price = 499 + (id % 5) * 50;
            return {
              id: `p${id}_${color.id}_${size.id}`,
              sku: `P${id}-${color.id}-${size.id}`,
              attributes: new Map([
                ["color", color.id],
                ["size", size.id],
              ]),
              images: [
                `https://picsum.photos/seed/p${id}${color.id}${size.id}/600`,
              ],
              pricing: {
                price,
                discountPrice: id % 2 === 0 ? price - 100 : undefined,
              },
              stock: {
                available: Math.floor(Math.random() * 20),
                isInStock: Math.random() > 0.3,
              },
            };
          })
        )
      : [];

    // ⭐ Compute parent price (lowest variant price)
    let parentPricing;
    if (variants.length > 0) {
      const prices = variants.map((v) => v.pricing.price);
      parentPricing = { price: Math.min(...prices) };
    } else {
      parentPricing = {
        price: 299 + (id % 6) * 30,
        discountPrice: id % 2 ? undefined : 249,
      };
    }

    // ⭐ Compute parent stock (sum of variant stock, isInStock if any variant is in stock)
    let parentStock;
    if (variants.length > 0) {
      const totalAvailable = variants.reduce(
        (sum, v) => sum + (v.stock?.available || 0),
        0
      );
      const hasInStock = variants.some(
        (v) => v.stock?.isInStock || v.stock?.available > 0
      );
      parentStock = {
        available: totalAvailable,
        isInStock: hasInStock,
      };
    } else {
      parentStock = {
        available: 30 + (id % 10) * 5,
        isInStock: true,
      };
    }

    return {
      title: `Infant Product ${id}`,
      description: "High-quality infant clothing with soft touch and comfort.",
      categorySlug: ["bodysuits", "jumpsuits", "caps", "sets"][id % 4],
      url_key: `infant-product-${id}`,
      images: [`https://picsum.photos/seed/inf${id}/600`],
      pricing: parentPricing, // ⭐ Added here
      stock: parentStock, // ⭐ Added here
      variantOptions: hasVariants
        ? [
            { id: "color", name: "Color", code: "color", values: colors },
            { id: "size", name: "Size", code: "size", values: sizes },
          ]
        : [],
      variants,
      details: [
        {
          title: "Product Details",
          fields: [{ label: "Material", value: "Soft Cotton Blend" }],
        },
      ],
      status: "published",
    };
  }),
];

const updateProducts = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error(
        "❌ MONGODB_URI or MONGO_URI is missing. Check your .env file!"
      );
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");
    console.log(`📊 Database: ${mongoose.connection.name}`);
    console.log(`📊 Collection: products`);

    let updated = 0;
    let notFound = 0;
    let errors = 0;

    for (const productData of infantProducts) {
      try {
        // Find existing product by url_key
        const existingProduct = await Product.findOne({
          url_key: productData.url_key,
        });

        if (!existingProduct) {
          console.log(`⏭️  Not found (skipped): ${productData.title}`);
          notFound++;
          continue;
        }

        // Find or create category
        let category = await Category.findOne({
          slug: productData.categorySlug,
        });
        if (!category) {
          // Create category if it doesn't exist
          category = await Category.create({
            name: productData.categorySlug
              .split("-")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" "),
            slug: productData.categorySlug,
            isActive: true,
            displayOrder: 1,
          });
          console.log(`  ✓ Created category: ${category.name}`);
        }

        // Generate variant url_keys and ensure stock format
        const processedVariants = (productData.variants || []).map((v) => {
          const attrs =
            v.attributes instanceof Map
              ? Object.fromEntries(v.attributes)
              : v.attributes || {};
          const variantUrlKey = productData.url_key
            ? `${productData.url_key}-${generateSlug(
                attrs.color || ""
              )}-${generateSlug(attrs.size || attrs.age || "")}`
            : null;

          // Ensure stock is in the correct format (use stockObj for DB)
          const variantStock = v.stock || v.stockObj || null;

          // Create variant object, always removing stock field (use stockObj instead)
          const variant = {
            ...v,
            url_key: variantUrlKey,
            stockObj: variantStock, // Use stockObj for DB schema
          };

          // Always remove stock field (we use stockObj instead)
          delete variant.stock;

          return variant;
        });

        // Calculate parent-level pricing if not provided in productData
        let parentPricing = productData.pricing;

        // Validate existing pricing or calculate new one
        if (
          !parentPricing ||
          !parentPricing.price ||
          isNaN(parentPricing.price)
        ) {
          if (processedVariants.length > 0) {
            const prices = processedVariants
              .map((v) => {
                // Check both pricing.price and price fields
                const price = v.pricing?.price || v.price || 0;
                return typeof price === "number" && !isNaN(price) && price > 0
                  ? price
                  : null;
              })
              .filter((p) => p !== null && p > 0);

            if (prices.length > 0) {
              parentPricing = { price: Math.min(...prices) };
            } else {
              parentPricing = { price: 299 }; // Default
            }
          } else {
            // Default pricing for products without variants
            parentPricing = { price: 299 };
          }
        }

        // Calculate parent-level stock if not provided in productData
        let parentStock = productData.stock;

        // Validate existing stock or calculate new one
        if (
          !parentStock ||
          typeof parentStock.available !== "number" ||
          isNaN(parentStock.available)
        ) {
          if (processedVariants.length > 0) {
            const totalAvailable = processedVariants.reduce((sum, v) => {
              const available =
                v.stockObj?.available || v.stock?.available || 0;
              return (
                sum +
                (typeof available === "number" && !isNaN(available)
                  ? available
                  : 0)
              );
            }, 0);
            const hasInStock = processedVariants.some((v) => {
              const stockObj = v.stockObj || v.stock;
              return (
                stockObj?.isInStock === true || (stockObj?.available || 0) > 0
              );
            });
            parentStock = {
              available: totalAvailable,
              isInStock: hasInStock,
            };
          } else {
            // Default stock for products without variants
            parentStock = {
              available: 30,
              isInStock: true,
            };
          }
        }

        // Ensure pricing and stockObj are always valid objects (never null/undefined)
        if (
          !parentPricing ||
          typeof parentPricing !== "object" ||
          !parentPricing.price
        ) {
          console.log(
            `   ⚠️  Warning: Invalid pricing for ${productData.title}, using default`
          );
          parentPricing = { price: 299 };
        }
        if (
          !parentStock ||
          typeof parentStock !== "object" ||
          typeof parentStock.available !== "number"
        ) {
          console.log(
            `   ⚠️  Warning: Invalid stock for ${productData.title}, using default`
          );
          parentStock = { available: 30, isInStock: true };
        }

        // Use findOneAndUpdate to ensure all changes are saved, including field removal
        const updateData = {
          title: productData.title,
          name: productData.title,
          description: productData.description,
          category: category._id,
          categoryName: category.name,
          images: productData.images || [],
          variantOptions: productData.variantOptions,
          variants: processedVariants,
          details: productData.details,
          status: productData.status || "published",
          pricing: parentPricing, // Use calculated or provided pricing (always valid object)
          stockObj: parentStock, // Use calculated or provided stock (always valid object)
          $unset: { selectedOptions: "" }, // Remove selectedOptions field
        };

        const savedProduct = await Product.findOneAndUpdate(
          { _id: existingProduct._id },
          updateData,
          { new: true, runValidators: true }
        );

        if (!savedProduct) {
          throw new Error("Product not found after update");
        }

        console.log(
          `✅ Updated product: ${savedProduct.title} (${savedProduct.variants.length} variants)`
        );
        console.log(`   - Pricing: ${JSON.stringify(savedProduct.pricing)}`);
        console.log(`   - Stock: ${JSON.stringify(savedProduct.stockObj)}`);
        console.log(`   - Variants count: ${savedProduct.variants.length}`);
        console.log(
          `   - selectedOptions removed: ${
            savedProduct.selectedOptions === undefined ? "yes" : "no"
          }`
        );
        updated++;
      } catch (err) {
        errors++;
        console.error(
          `❌ Error updating product ${productData.title}:`,
          err.message
        );
      }
    }

    console.log("\n📊 Update Summary:");
    console.log(`  ✅ Updated: ${updated}`);
    console.log(`  ⏭️  Not Found: ${notFound}`);
    console.log(`  ❌ Errors: ${errors}`);
    console.log("\n✅ Update completed!");

    // Close connection
    await mongoose.connection.close();
    console.log("✅ Database connection closed");
  } catch (err) {
    console.error("❌ Update failed:", err);
    process.exit(1);
  }
};

// Run update
if (require.main === module) {
  updateProducts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = updateProducts;
