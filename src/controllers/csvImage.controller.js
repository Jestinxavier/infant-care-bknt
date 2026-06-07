// controllers/csvImage.controller.js
const { tempParser, uploadToMediaServer, deleteFromMediaServer, filenameFromUrl } = require("../config/mediaServer");
const ApiResponse = require("../core/ApiResponse");
const asyncHandler = require("../core/middleware/asyncHandler");
const Asset = require("../models/Asset");
const crypto = require("crypto");
const logger = require("../utils/logger");

/**
 * CSV Image Controller (Unified Asset System)
 * Handles temporary image upload for CSV import workflow
 * Now uses the central Asset model and media server for storage.
 */
class CsvImageController {
  /**
   * List all temp CSV images for current user
   * GET /api/v1/admin/csv-images
   */
  listTempImages = asyncHandler(async (req, res) => {
    const userId = req.user?.id || req.user?._id;

    const { limit = 50, skip = 0 } = req.query;

    const query = {
      "origin.source": "csv",
      status: "temp",
    };

    if (userId) {
      query.uploadedBy = userId;
    }

    const [assets, total] = await Promise.all([
      Asset.find(query)
        .sort({ createdAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .lean(),
      Asset.countDocuments(query),
    ]);

    const mappedImages = assets.map((asset) => ({
      _id: asset._id,
      temp_key: asset.publicId,
      public_id: asset.publicId,
      url: asset.secureUrl,
      width: asset.width,
      height: asset.height,
      format: asset.format,
      size: asset.bytes,
      uploadedAt: asset.createdAt,
      originalName: asset.origin?.sourceContext || "",
    }));

    res.status(200).json(
      ApiResponse.success("Temp images retrieved", {
        images: mappedImages,
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
        const file = req.file;
        const userId = req.user?.id || req.user?._id || null;

        const uploadResult = await uploadToMediaServer(file.buffer, {
          mimeType: file.mimetype,
          originalName: file.originalname,
        });

        const hash = crypto
          .createHash("md5")
          .update(file.buffer)
          .digest("hex");

        const asset = await Asset.create({
          publicId: uploadResult.public_id,
          secureUrl: uploadResult.url,
          assetId: uploadResult.public_id,
          hash,
          status: "temp",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          origin: {
            source: "csv",
            sourceContext: file.originalname || "csv-upload",
          },
          intendedFor: "product",
          usedBy: [],
          uploadedBy: userId,
          width: uploadResult.width,
          height: uploadResult.height,
          format: uploadResult.format,
          resourceType: "image",
          bytes: uploadResult.size,
        });

        logger.info(`✅ [CSV Image] Asset uploaded: ${asset.publicId}`);

        res.status(200).json(
          ApiResponse.success("Temp image uploaded", {
            temp_key: asset.publicId,
            public_id: asset.publicId,
            url: asset.secureUrl,
            width: asset.width,
            height: asset.height,
            format: asset.format,
            size: asset.bytes,
            originalName: file.originalname,
          }).toJSON()
        );
      } catch (error) {
        logger.error("❌ [CSV Image] Upload error:", error);
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
        .json(
          ApiResponse.error("temp_key (publicId) is required", 400).toJSON()
        );
    }

    try {
      const asset = await Asset.findOne({ publicId: temp_key });

      if (!asset) {
        return res
          .status(404)
          .json(ApiResponse.error("Image not found", 404).toJSON());
      }

      if (asset.status !== "temp" || asset.usedBy.length > 0) {
        return res
          .status(400)
          .json(
            ApiResponse.error(
              "Cannot delete permanent or used asset",
              400
            ).toJSON()
          );
      }

      const filename = filenameFromUrl(asset.secureUrl);
      if (filename) await deleteFromMediaServer(filename);

      await Asset.deleteOne({ _id: asset._id });

      logger.info("✅ [CSV Image] Deleted asset:", temp_key);

      res
        .status(200)
        .json(ApiResponse.success("Temp image deleted", { temp_key }).toJSON());
    } catch (error) {
      logger.error("❌ [CSV Image] Delete error:", error);
      res
        .status(500)
        .json(ApiResponse.error("Failed to delete image", 500, error).toJSON());
    }
  });

  /**
   * Validate temp images exist
   * POST /api/v1/admin/csv-images/validate
   */
  validateTempImages = asyncHandler(async (req, res) => {
    const { temp_keys } = req.body;

    if (!temp_keys || !Array.isArray(temp_keys) || temp_keys.length === 0) {
      return res
        .status(400)
        .json(ApiResponse.error("temp_keys array is required", 400).toJSON());
    }

    const foundAssets = await Asset.find({
      publicId: { $in: temp_keys },
    }).lean();

    const foundKeys = new Set(foundAssets.map((img) => img.publicId));
    const missingKeys = temp_keys.filter((key) => !foundKeys.has(key));

    res.status(200).json(
      ApiResponse.success("Validation complete", {
        valid: missingKeys.length === 0,
        found: foundAssets.length,
        missing: missingKeys,
        images: foundAssets.map((img) => ({
          temp_key: img.publicId,
          public_id: img.publicId,
          url: img.secureUrl,
        })),
      }).toJSON()
    );
  });

  /**
   * Convert temp images to permanent
   * POST /api/v1/admin/csv-images/convert
   */
  convertToPermanent = asyncHandler(async (req, res) => {
    const { temp_keys } = req.body;

    if (!temp_keys || !Array.isArray(temp_keys) || temp_keys.length === 0) {
      return res
        .status(400)
        .json(ApiResponse.error("temp_keys array is required", 400).toJSON());
    }

    const { finalizeImages } = require("../utils/mediaFinalizer");

    const result = await finalizeImages(temp_keys, null, null);

    const promotedAssets = await Asset.find({
      publicId: { $in: result.success },
    }).lean();

    const responseConverted = promotedAssets.map((asset) => ({
      temp_key: asset.publicId,
      old_public_id: asset.publicId,
      new_public_id: asset.publicId,
      url: asset.secureUrl,
    }));

    const responseFailed = result.failed.map((f) => ({
      temp_key: f.publicId || f.id,
      error: f.error,
    }));

    res.status(200).json(
      ApiResponse.success("Conversion complete (Assets Promoted)", {
        converted: responseConverted,
        failed: responseFailed,
        total: temp_keys.length,
        convertedCount: responseConverted.length,
      }).toJSON()
    );
  });

  /**
   * Manual cleanup — restricted to CSV source assets older than maxAgeHours.
   */
  manualCleanup = asyncHandler(async (req, res) => {
    const { maxAgeHours = 24 } = req.body;
    const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    const oldAssets = await Asset.find({
      "origin.source": "csv",
      status: "temp",
      createdAt: { $lt: cutoffDate },
      usedBy: { $size: 0 },
    });

    const results = { deleted: [], failed: [] };

    for (const asset of oldAssets) {
      try {
        const filename = filenameFromUrl(asset.secureUrl);
        if (filename) await deleteFromMediaServer(filename);
        await Asset.findByIdAndDelete(asset._id);
        results.deleted.push(asset.publicId);
      } catch (err) {
        results.failed.push({ temp_key: asset.publicId, error: err.message });
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
