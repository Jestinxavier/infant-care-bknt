export const TEST_MODE = true;
export const TEST_OTP = "123456";

export const PRODUCTS = [
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
          { id: "0-3", value: "0-3", label: "0-3 Months" },
          { id: "3-6", value: "3-6", label: "3-6 Months" },
        ],
      },
    ],
    variants: [
      {
        id: "cotton_jumpsuit_red_0_3",
        sku: "CJ-RED-0-3",
        title: "Premium Organic Cotton Infant Jumpsuit - Red - 0-3 Months",
        attributes: { color: "red", size: "0-3" },
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
        title: "Premium Organic Cotton Infant Jumpsuit - Red - 3-6 Months",
        attributes: { color: "red", size: "3-6" },
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
        title: "Premium Organic Cotton Infant Jumpsuit - Blue - 0-3 Months",
        attributes: { color: "blue", size: "0-3" },
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
        title: "Premium Organic Cotton Infant Jumpsuit - Blue - 3-6 Months",
        attributes: { color: "blue", size: "3-6" },
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
              { label: "Sleeves", value: "Short Sleeves / Regular Sleeves" },
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
  {
    title: "Soft Fleece Winter Baby Romper",
    description:
      "A warm, ultra-soft fleece romper designed to keep infants cozy during winter outings.",
    categorySlug: "rompers",
    url_key: "soft-fleece-winter-baby-romper",
    images: [
      "https://picsum.photos/seed/romper001/600",
      "https://picsum.photos/seed/romper002/600",
    ],
    pricing: {
      price: 1499,
      discountPrice: 1299,
    },
    stock: {
      available: 85,
      isInStock: true,
    },
    variantOptions: [
      {
        id: "color",
        name: "Color",
        code: "color",
        values: [
          { id: "pink", value: "pink", label: "Pink", hex: "#e91e63" },
          { id: "grey", value: "grey", label: "Grey", hex: "#9e9e9e" },
        ],
      },
      {
        id: "size",
        name: "Size",
        code: "size",
        values: [
          { id: "0-3", value: "0-3", label: "0-3 Months" },
          { id: "3-6", value: "3-6", label: "3-6 Months" },
          { id: "6-9", value: "6-9", label: "6-9 Months" },
        ],
      },
    ],
    variants: [
      {
        id: "winter_romper_pink_0_3",
        sku: "WR-PNK-0-3",
        title: "Soft Fleece Winter Baby Romper - Pink - 0-3 Months",
        attributes: { color: "pink", size: "0-3" },
        images: ["https://picsum.photos/seed/pink03/600"],
        pricing: {
          price: 1499,
          discountPrice: 1299,
        },
        stock: {
          available: 14,
          isInStock: true,
        },
      },
      {
        id: "winter_romper_pink_3_6",
        sku: "WR-PNK-3-6",
        title: "Soft Fleece Winter Baby Romper - Pink - 3-6 Months",
        attributes: { color: "pink", size: "3-6" },
        images: ["https://picsum.photos/seed/pink36/600"],
        pricing: {
          price: 1499,
          discountPrice: 1299,
        },
        stock: {
          available: 22,
          isInStock: true,
        },
      },
      {
        id: "winter_romper_pink_6_9",
        sku: "WR-PNK-6-9",
        title: "Soft Fleece Winter Baby Romper - Pink - 6-9 Months",
        attributes: { color: "pink", size: "6-9" },
        images: ["https://picsum.photos/seed/pink69/600"],
        pricing: {
          price: 1499,
        },
        stock: {
          available: 0,
          isInStock: false,
        },
      },
      {
        id: "winter_romper_grey_0_3",
        sku: "WR-GRY-0-3",
        title: "Soft Fleece Winter Baby Romper - Grey - 0-3 Months",
        attributes: { color: "grey", size: "0-3" },
        images: ["https://picsum.photos/seed/grey03/600"],
        pricing: {
          price: 1499,
        },
        stock: {
          available: 30,
          isInStock: true,
        },
      },
      {
        id: "winter_romper_grey_3_6",
        sku: "WR-GRY-3-6",
        title: "Soft Fleece Winter Baby Romper - Grey - 3-6 Months",
        attributes: { color: "grey", size: "3-6" },
        images: ["https://picsum.photos/seed/grey36/600"],
        pricing: {
          price: 1499,
        },
        stock: {
          available: 19,
          isInStock: true,
        },
      },
      {
        id: "winter_romper_grey_6_9",
        sku: "WR-GRY-6-9",
        title: "Soft Fleece Winter Baby Romper - Grey - 6-9 Months",
        attributes: { color: "grey", size: "6-9" },
        images: ["https://picsum.photos/seed/grey69/600"],
        pricing: {
          price: 1499,
          discountPrice: 1399,
        },
        stock: {
          available: 0,
          isInStock: false,
        },
      },
    ],
    details: [
      {
        title: "Material",
        fields: [
          { label: "Fabric", value: "Premium Ultra-Soft Fleece" },
          {
            type: "badges",
            value: ["Warm", "Soft Touch", "Winter Wear", "Insulated"],
          },
        ],
      },
      {
        title: "Design & Features",
        fields: [
          {
            type: "flex_box",
            value: [
              { label: "Closure", value: "Front Zip" },
              { label: "Hood", value: "Attached Hood" },
              { label: "Foot Cover", value: "Enclosed Feet Design" },
            ],
          },
        ],
      },
      {
        title: "Care Guide",
        fields: [
          { label: "Washing", value: "Machine Wash Cold" },
          { label: "Bleach", value: "Do Not Bleach" },
          { label: "Drying", value: "Do Not Tumble Dry" },
        ],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 3",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "caps",
    url_key: "infant-product-3",
    images: ["https://picsum.photos/seed/inf3/600"],
    pricing: {
      price: 449,
      discountPrice: 349,
    },
    stock: {
      available: 35,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 4",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "sets",
    url_key: "infant-product-4",
    images: ["https://picsum.photos/seed/inf4/600"],
    pricing: {
      price: 499,
    },
    stock: {
      available: 45,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 5",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "bodysuits",
    url_key: "infant-product-5",
    images: ["https://picsum.photos/seed/inf5/600"],
    pricing: {
      price: 549,
      discountPrice: 449,
    },
    stock: {
      available: 55,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 6",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "jumpsuits",
    url_key: "infant-product-6",
    images: ["https://picsum.photos/seed/inf6/600"],
    pricing: {
      price: 299,
      discountPrice: 249,
    },
    stock: {
      available: 60,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 7",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "caps",
    url_key: "infant-product-7",
    images: ["https://picsum.photos/seed/inf7/600"],
    pricing: {
      price: 329,
    },
    stock: {
      available: 40,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 8",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "sets",
    url_key: "infant-product-8",
    images: ["https://picsum.photos/seed/inf8/600"],
    pricing: {
      price: 359,
      discountPrice: 249,
    },
    stock: {
      available: 50,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 9",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "bodysuits",
    url_key: "infant-product-9",
    images: ["https://picsum.photos/seed/inf9/600"],
    pricing: {
      price: 389,
    },
    stock: {
      available: 48,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 10",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "jumpsuits",
    url_key: "infant-product-10",
    images: ["https://picsum.photos/seed/inf10/600"],
    pricing: {
      price: 419,
      discountPrice: 319,
    },
    stock: {
      available: 52,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 11",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "caps",
    url_key: "infant-product-11",
    images: ["https://picsum.photos/seed/inf11/600"],
    pricing: {
      price: 449,
      discountPrice: 349,
    },
    stock: {
      available: 65,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 12",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "sets",
    url_key: "infant-product-12",
    images: ["https://picsum.photos/seed/inf12/600"],
    pricing: {
      price: 499,
    },
    stock: {
      available: 58,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 13",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "bodysuits",
    url_key: "infant-product-13",
    images: ["https://picsum.photos/seed/inf13/600"],
    pricing: {
      price: 549,
      discountPrice: 449,
    },
    stock: {
      available: 44,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 14",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "jumpsuits",
    url_key: "infant-product-14",
    images: ["https://picsum.photos/seed/inf14/600"],
    pricing: {
      price: 299,
      discountPrice: 249,
    },
    stock: {
      available: 72,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 15",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "caps",
    url_key: "infant-product-15",
    images: ["https://picsum.photos/seed/inf15/600"],
    pricing: {
      price: 329,
    },
    stock: {
      available: 46,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 16",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "sets",
    url_key: "infant-product-16",
    images: ["https://picsum.photos/seed/inf16/600"],
    pricing: {
      price: 359,
      discountPrice: 249,
    },
    stock: {
      available: 59,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 17",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "bodysuits",
    url_key: "infant-product-17",
    images: ["https://picsum.photos/seed/inf17/600"],
    pricing: {
      price: 389,
    },
    stock: {
      available: 53,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 18",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "jumpsuits",
    url_key: "infant-product-18",
    images: ["https://picsum.photos/seed/inf18/600"],
    pricing: {
      price: 419,
      discountPrice: 319,
    },
    stock: {
      available: 48,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 19",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "caps",
    url_key: "infant-product-19",
    images: ["https://picsum.photos/seed/inf19/600"],
    pricing: {
      price: 449,
      discountPrice: 349,
    },
    stock: {
      available: 42,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
  {
    title: "Infant Product 20",
    description: "High-quality infant clothing with soft touch and comfort.",
    categorySlug: "sets",
    url_key: "infant-product-20",
    images: ["https://picsum.photos/seed/inf20/600"],
    pricing: {
      price: 499,
    },
    stock: {
      available: 70,
      isInStock: true,
    },
    variantOptions: [],
    variants: [],
    details: [
      {
        title: "Product Details",
        fields: [{ label: "Material", value: "Soft Cotton Blend" }],
      },
    ],
    status: "published",
  },
];
