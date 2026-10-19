const { formatCartResponse } = require("../../src/utils/formatCartResponse");

describe("formatCartResponse: orphaned / deleted-product items", () => {
  test("legacy item without snapshots for a deleted product renders unavailable with fallback title (not blank)", () => {
    const cart = {
      cartId: "cart_legacy",
      userId: null,
      items: [
        {
          _id: "item_deleted",
          productId: null, // populate found nothing → product hard-deleted
          variantId: null,
          quantity: 2,
          selectedGiftSku: null,
        },
      ],
      subtotal: 0,
      discountedSubtotal: 0,
      shippingEstimate: 0,
      total: 0,
      coupons: [],
    };

    const formatted = formatCartResponse(cart, null, null, null);
    const item = formatted.items[0];

    expect(item.unavailable).toBe(true);
    expect(item.titleSnapshot).toBe("Item no longer available");
    expect(item.productId).toBeNull();
    expect(item.skuSnapshot).toBeNull();
  });

  test("deleted product with saved snapshots keeps its snapshot data and flags unavailable", () => {
    const cart = {
      cartId: "cart_legacy2",
      userId: null,
      items: [
        {
          _id: "item_snap",
          productId: null,
          variantId: null,
          quantity: 1,
          titleSnapshot: "Legacy Sleepsuit - Blue Star",
          imageSnapshot: "https://media.infantscare.in/uploads/abc.jpg",
          skuSnapshot: "LEGACY-SLEEP-001",
          selectedGiftSku: null,
        },
      ],
      subtotal: 0,
      discountedSubtotal: 0,
      shippingEstimate: 0,
      total: 0,
      coupons: [],
    };

    const formatted = formatCartResponse(cart, null, null, null);
    const item = formatted.items[0];

    expect(item.unavailable).toBe(true);
    expect(item.titleSnapshot).toBe("Legacy Sleepsuit - Blue Star");
    expect(item.skuSnapshot).toBe("LEGACY-SLEEP-001");
    expect(item.imageSnapshot).toContain("uploads/abc");
  });

  test("live published product stays available", () => {
    const cart = {
      cartId: "cart_live",
      userId: null,
      items: [
        {
          _id: "item_live",
          productId: {
            _id: "p1",
            title: "Active Product",
            url_key: "active-product",
            images: ["https://example.com/a.jpg"],
            product_type: "SIMPLE",
            status: "published",
          },
          variantId: null,
          quantity: 1,
          titleSnapshot: "Active Product",
          imageSnapshot: "https://example.com/a.jpg",
          skuSnapshot: "ACTIVE-001",
          selectedGiftSku: null,
        },
      ],
      baseSubtotal: 100,
      subtotal: 100,
      discountedSubtotal: 100,
      shippingEstimate: 0,
      total: 100,
      coupons: [],
    };

    const formatted = formatCartResponse(cart, null, null, null);
    const item = formatted.items[0];

    expect(item.unavailable).toBe(false);
    expect(item.url_key).toBeUndefined();
    expect(item.product.url_key).toBe("active-product");
  });
});