const express = require("express");
const router = express.Router();
const {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,

  deleteCategory,
  bulkDeleteCategories,
} = require("../controllers/category");
const verifyToken = require("../middlewares/authMiddleware");
const { categoryImageUploader } = require("../config/categoryImageUpload");

/**
 * @swagger
 * components:
 *   schemas:
 *     Category:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         _id:
 *           type: string
 *           description: Category ID
 *         name:
 *           type: string
 *           description: Category name
 *           example: "Rompers"
 *         slug:
 *           type: string
 *           description: URL-friendly slug
 *           example: "rompers"
 *         description:
 *           type: string
 *           description: Category description
 *         isActive:
 *           type: boolean
 *           description: Whether category is active
 *           default: true
 *         displayOrder:
 *           type: number
 *           description: Display order for sorting
 *           default: 0
 *         parentCategory:
 *           type: string
 *           description: Parent category ID (for sub-categories)
 *           nullable: true
 */

/**
 * @swagger
 * /api/v1/category:
 *   get:
 *     summary: Get all categories
 *     tags: [Categories]
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *         description: Include inactive categories
 *     responses:
 *       200:
 *         description: List of categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 totalCategories:
 *                   type: number
 *                 categories:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Category'
 */
router.get("/", getAllCategories);

/**
 * @swagger
 * /api/v1/category/bulk-delete:
 *   post:
 *     summary: Bulk delete categories
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - categoryIds
 *             properties:
 *               categoryIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Categories deleted successfully or partially
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post("/bulk-delete", verifyToken, bulkDeleteCategories);

/**
 * @swagger
 * /api/v1/category/{categoryId}:
 *   get:
 *     summary: Get category by ID
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category details
 *       404:
 *         description: Category not found
 */
router.get("/:categoryId", getCategoryById);

/**
 * @swagger
 * /api/v1/category:
 *   post:
 *     summary: Create a new category
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Rompers"
 *               description:
 *                 type: string
 *                 example: "Comfortable rompers for babies"
 *               displayOrder:
 *                 type: number
 *                 example: 1
 *               parentCategory:
 *                 type: string
 *                 nullable: true
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Category image/avatar (optional)
 *     responses:
 *       201:
 *         description: Category created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/",
  verifyToken,
  (req, res, next) => {
    categoryImageUploader.single("image")(req, res, function (err) {
      if (err) {
        console.error("❌ Category image upload error:", err);
        return res
          .status(400)
          .json({ success: false, message: err.message, error: err });
      }
      next();
    });
  },
  createCategory
);

/**
 * @swagger
 * /api/v1/category/{categoryId}:
 *   put:
 *     summary: Update a category
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               displayOrder:
 *                 type: number
 *               isActive:
 *                 type: boolean
 *               parentCategory:
 *                 type: string
 *                 nullable: true
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Category image/avatar (optional)
 *               removeImage:
 *                 type: boolean
 *                 description: Set to true to remove existing image (optional)
 *     responses:
 *       200:
 *         description: Category updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Category not found
 */
router.put(
  "/:categoryId",
  verifyToken,
  (req, res, next) => {
    categoryImageUploader.single("image")(req, res, function (err) {
      if (err) {
        console.error("❌ Category image upload error:", err);
        return res
          .status(400)
          .json({ success: false, message: err.message, error: err });
      }
      next();
    });
  },
  updateCategory
);

/**
 * @swagger
 * /api/v1/category/{categoryId}:
 *   delete:
 *     summary: Delete a category
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category deleted successfully
 *       400:
 *         description: Cannot delete (has products or sub-categories)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Category not found
 */
router.delete("/:categoryId", verifyToken, deleteCategory);

module.exports = router;
