const express = require("express");
const getFilters = require("../controllers/filter/getFilters");

const router = express.Router();

/**
 * @swagger
 * /api/v1/filter/{slug}:
 *   get:
 *     summary: Get filter options for a category
 *     description: Returns FilterConfig[] format with available filter options (color, size, price range, etc.) for a specific category or all products. Filters are auto-generated from product data.
 *     tags: [Filters]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Category slug (use 'all' for all products)
 *         example: jumpsuits
 *     responses:
 *       200:
 *         description: Filters retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 filters:
 *                   type: array
 *                   description: Array of filter configurations ready for frontend use. Price range uses effective price (discountPrice if available, otherwise regular price).
 *                   items:
 *                     type: object
 *                     properties:
 *                       key:
 *                         type: string
 *                         description: Filter key identifier
 *                         enum: [priceRange, color, age, inStock, sortBy]
 *                         example: priceRange
 *                       label:
 *                         type: string
 *                         description: Display label for the filter
 *                         example: "Price"
 *                       type:
 *                         type: string
 *                         description: Filter type/component type
 *                         enum: [slider, checkbox, radio]
 *                         example: slider
 *                       min:
 *                         type: number
 *                         description: Minimum value (for slider type only). Based on effective price (discountPrice if available, otherwise regular price).
 *                         example: 300
 *                       max:
 *                         type: number
 *                         description: Maximum value (for slider type only). Based on effective price (discountPrice if available, otherwise regular price).
 *                         example: 1299
 *                       step:
 *                         type: number
 *                         description: Step value (for slider type only)
 *                         example: 45
 *                       options:
 *                         type: array
 *                         description: Filter options (for checkbox, radio types)
 *                         items:
 *                           type: object
 *                           properties:
 *                             value:
 *                               type: string
 *                               description: Option value
 *                               example: Red
 *                             label:
 *                               type: string
 *                               description: Option display label (formatted for display)
 *                               example: Red
 *             examples:
 *               jumpsuits:
 *                 summary: Filters for jumpsuits category
 *                 value:
 *                   success: true
 *                   filters:
 *                     - key: priceRange
 *                       label: Price
 *                       type: slider
 *                       min: 399
 *                       max: 1299
 *                       step: 45
 *                     - key: color
 *                       label: Color
 *                       type: checkbox
 *                       options:
 *                         - value: Red
 *                           label: Red
 *                         - value: Blue
 *                           label: Blue
 *                     - key: age
 *                       label: Size
 *                       type: checkbox
 *                       options:
 *                         - value: "0-3"
 *                           label: "0 - 3"
 *                         - value: "3-6"
 *                           label: "3 - 6"
 *                     - key: inStock
 *                       label: Availability
 *                       type: radio
 *                       options:
 *                         - value: "true"
 *                           label: In Stock
 *                         - value: "false"
 *                           label: Out of Stock
 *                     - key: sortBy
 *                       label: Sort by
 *                       type: radio
 *                       options:
 *                         - value: newest
 *                           label: Latest
 *                         - value: price_low
 *                           label: "Price: Low to High"
 *                         - value: price_high
 *                           label: "Price: High to Low"
 *       404:
 *         description: Category not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Category not found
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Internal Server Error
 *                 error:
 *                   type: string
 */
router.get("/:slug", getFilters);

module.exports = router;

