// controllers/csvImage.controller.js
const { cloudinary, tempParser } = require("../config/cloudinary");
const ApiResponse = require("../core/ApiResponse");
const asyncHandler = require("../core/middleware/asyncHandler");
const CsvTempImage = require("../models/CsvTempImage");

// Cloudinary folder for CSV temp images
const CSV_TEMP_FOLDER = "temp";
const CSV_PERMANENT_FOLDER = "products";

/**
 * CSV Image Controller
 * Handles temporary image upload for CSV import workflow
 */
class CsvImageController {
  /**
   * List all temp CSV images for current user
   * GET /api/v1/admin/csv-images
   */
  listTempImages = asyncHandler(async (req, res) => {
    const userId = req.user?.id || req.user?._id;

    // Query params for filtering
    const { limit = 50, skip = 0 } = req.query;

    const query = userId ? { uploadedBy: userId } : {};

    const [images, total] = await Promise.all([
      CsvTempImage.find(query)
        .sort({ uploadedAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .lean(),
      CsvTempImage.countDocuments(query),
    ]);

    res.status(200).json(
      ApiResponse.success("Temp images retrieved", {
        images,
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
      }).toJSON()
    );
  });

  /**
   * Upload a temp CSV image
   * POST /api/v1/admin/csv-images/upload
   */
  uploadTempImage = [
    tempParser.single("file"),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        return res
          .status(400)
          .json(ApiResponse.error("No file provided", 400).toJSON());
      }

      try {
        const fileData = req.file;
        const publicId = fileData.filename || fileData.public_id;
        const userId = req.user?.id || req.user?._id || null;

        // Generate unique temp key
        const temp_key = CsvTempImage.generateTempKey();

        console.log("📷 [CSV Image] Uploading temp image:", {
          temp_key,
          originalname: fileData.originalname,
          publicId,
        });

        // Get full image details from Cloudinary
        let cloudinaryDetails = {
          width: 0,
          height: 0,
          format: fileData.mimetype?.split("/")[1] || "jpg",
          bytes: fileData.size || 0,
        };

        try {
          const details = await cloudinary.api.resource(publicId, {
            resource_type: "image",
          });
          cloudinaryDetails = {
            width: details.width || 0,
            height: details.height || 0,
            format: details.format || cloudinaryDetails.format,
            bytes: details.bytes || cloudinaryDetails.bytes,
          };
        } catch (detailsError) {
          console.warn(
            "⚠️ [CSV Image] Could not fetch details:",
            detailsError.message
          );
        }

        // Save to database
        const tempImage = await CsvTempImage.create({
          temp_key,
          public_id: publicId,
          url: fileData.path || fileData.url || fileData.secure_url,
          width: cloudinaryDetails.width,
          height: cloudinaryDetails.height,
          format: cloudinaryDetails.format,
          size: cloudinaryDetails.bytes,
          uploadedAt: new Date(),
          uploadedBy: userId,
          originalName: fileData.originalname || "",
        });

        console.log("✅ [CSV Image] Temp image saved:", temp_key);

        res.status(200).json(
          ApiResponse.success("Temp image uploaded", {
            temp_key: tempImage.temp_key,
            public_id: tempImage.public_id,
            url: tempImage.url,
            width: tempImage.width,
            height: tempImage.height,
            format: tempImage.format,
            size: tempImage.size,
            originalName: tempImage.originalName,
          }).toJSON()
        );
      } catch (error) {
        console.error("❌ [CSV Image] Upload error:", error);
        res
          .status(500)
          .json(
            ApiResponse.error("Failed to upload image", 500, error).toJSON()
          );
      }
    }),
  ];

  /**
   * Delete a temp CSV image
   * DELETE /api/v1/admin/csv-images/:temp_key
   */
  deleteTempImage = asyncHandler(async (req, res) => {
    const { temp_key } = req.params;

    if (!temp_key) {
      return res
        .status(400)
        .json(ApiResponse.error("temp_key is required", 400).toJSON());
    }

    try {
      // Find the image
      const tempImage = await CsvTempImage.findOne({ temp_key });

      if (!tempImage) {
        return res
          .status(404)
          .json(ApiResponse.error("Temp image not found", 404).toJSON());
      }

      // Delete from Cloudinary
      try {
        await cloudinary.uploader.destroy(tempImage.public_id, {
          resource_type: "image",
        });
        console.log(
          "🗑️ [CSV Image] Deleted from Cloudinary:",
          tempImage.public_id
        );
      } catch (cloudinaryError) {
        console.warn(
          "⚠️ [CSV Image] Cloudinary delete failed:",
          cloudinaryError.message
        );
        // Continue - image might already be deleted
      }

      // Delete from database
      await CsvTempImage.deleteOne({ temp_key });
      console.log("✅ [CSV Image] Deleted from database:", temp_key);

      res
        .status(200)
        .json(ApiResponse.success("Temp image deleted", { temp_key }).toJSON());
    } catch (error) {
      console.error("❌ [CSV Image] Delete error:", error);
      res
        .status(500)
        .json(ApiResponse.error("Failed to delete image", 500, error).toJSON());
    }
  });

  /**
   * Validate temp images exist (for Phase 1 validation)
   * POST /api/v1/admin/csv-images/validate
   * Body: { temp_keys: string[] }
   */
  validateTempImages = asyncHandler(async (req, res) => {
    const { temp_keys } = req.body;

    if (!temp_keys || !Array.isArray(temp_keys) || temp_keys.length === 0) {
      return res
        .status(400)
        .json(ApiResponse.error("temp_keys array is required", 400).toJSON());
    }

    // Find all matching temp images
    const foundImages = await CsvTempImage.find({
      temp_key: { $in: temp_keys },
    }).lean();

    const foundKeys = new Set(foundImages.map((img) => img.temp_key));
    const missingKeys = temp_keys.filter((key) => !foundKeys.has(key));

    res.status(200).json(
      ApiResponse.success("Validation complete", {
        valid: missingKeys.length === 0,
        found: foundImages.length,
        missing: missingKeys,
        images: foundImages.map((img) => ({
          temp_key: img.temp_key,
          public_id: img.public_id,
          url: img.url,
        })),
      }).toJSON()
    );
  });

  /**
   * Convert temp images to permanent (move to products folder)
   * POST /api/v1/admin/csv-images/convert
   * Body: { temp_keys: string[] }
   * Returns mapping of temp_key -> new permanent public_id
   */
  convertToPermanent = asyncHandler(async (req, res) => {
    const { temp_keys } = req.body;

    if (!temp_keys || !Array.isArray(temp_keys) || temp_keys.length === 0) {
      return res
        .status(400)
        .json(ApiResponse.error("temp_keys array is required", 400).toJSON());
    }

    const results = {
      converted: [],
      failed: [],
    };

    // Find all temp images
    const tempImages = await CsvTempImage.find({
      temp_key: { $in: temp_keys },
    });

    for (const tempImage of tempImages) {
      try {
        // Generate new public_id in products folder
        const newPublicId = `${CSV_PERMANENT_FOLDER}/${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 8)}`;

        // Move image in Cloudinary (rename/move)
        const moveResult = await cloudinary.uploader.rename(
          tempImage.public_id,
          newPublicId,
          { resource_type: "image" }
        );

        console.log("📦 [CSV Image] Moved to permanent:", {
          from: tempImage.public_id,
          to: newPublicId,
        });

        results.converted.push({
          temp_key: tempImage.temp_key,
          old_public_id: tempImage.public_id,
          new_public_id: newPublicId,
          url: moveResult.secure_url || moveResult.url,
        });

        // Delete from temp collection
        await CsvTempImage.deleteOne({ temp_key: tempImage.temp_key });
      } catch (error) {
        console.error(
          `❌ [CSV Image] Failed to convert ${tempImage.temp_key}:`,
          error
        );
        results.failed.push({
          temp_key: tempImage.temp_key,
          error: error.message,
        });
      }
    }

    // Check for missing keys
    const foundKeys = new Set(tempImages.map((img) => img.temp_key));
    const missingKeys = temp_keys.filter((key) => !foundKeys.has(key));
    missingKeys.forEach((key) => {
      results.failed.push({ temp_key: key, error: "Not found" });
    });

    res.status(200).json(
      ApiResponse.success("Conversion complete", {
        converted: results.converted,
        failed: results.failed,
        total: temp_keys.length,
        convertedCount: results.converted.length,
      }).toJSON()
    );
  });

  /**
   * Manual cleanup (for testing/admin)
   * POST /api/v1/admin/csv-images/cleanup
   * Body: { maxAgeHours: number } (default: 24)
   */
  manualCleanup = asyncHandler(async (req, res) => {
    const { maxAgeHours = 24 } = req.body;

    const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    // Find old temp images
    const oldImages = await CsvTempImage.find({
      uploadedAt: { $lt: cutoffDate },
    });

    const results = {
      deleted: [],
      failed: [],
    };

    for (const image of oldImages) {
      try {
        // Delete from Cloudinary
        await cloudinary.uploader.destroy(image.public_id, {
          resource_type: "image",
        });

        // Delete from database
        await CsvTempImage.deleteOne({ temp_key: image.temp_key });

        results.deleted.push(image.temp_key);
        console.log("🧹 [CSV Image] Cleaned up:", image.temp_key);
      } catch (error) {
        console.error(
          `❌ [CSV Image] Cleanup failed for ${image.temp_key}:`,
          error
        );
        results.failed.push({ temp_key: image.temp_key, error: error.message });
      }
    }

    res.status(200).json(
      ApiResponse.success("Cleanup complete", {
        deleted: results.deleted,
        failed: results.failed,
        deletedCount: results.deleted.length,
        cutoffDate: cutoffDate.toISOString(),
      }).toJSON()
    );
  });
}

module.exports = new CsvImageController();
