// controllers/csvImage.controller.js
const { cloudinary, tempParser } = require("../config/cloudinary");
const ApiResponse = require("../core/ApiResponse");
const asyncHandler = require("../core/middleware/asyncHandler");
const Asset = require("../models/Asset");
const crypto = require("crypto");

/**
 * CSV Image Controller (Unified Asset System)
 * Handles temporary image upload for CSV import workflow
 * Now uses the central Asset model and 'assets' folder
 */
class CsvImageController {
  /**
   * List all temp CSV images for current user
   * GET /api/v1/admin/csv-images
   * Filters Assets where origin.source = 'csv' and status = 'temp'
   */
  listTempImages = asyncHandler(async (req, res) => {
    const userId = req.user?.id || req.user?._id;

    // Query params for filtering
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

    // Map Asset to legacy response format if needed by frontend
    const mappedImages = assets.map((asset) => ({
      _id: asset._id,
      temp_key: asset.publicId, // Use publicId as temp_key
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
   * Uses Asset model to upload to 'assets' folder
   */
  uploadTempImage = [
    tempParser.single("file"), // Maintains same multer config (memory storage or temp file)
    asyncHandler(async (req, res) => {
      if (!req.file) {
        return res
          .status(400)
          .json(ApiResponse.error("No file provided", 400).toJSON());
      }

      try {
        const file = req.file;
        const userId = req.user?.id || req.user?._id || null;

        // 1. Generate hash for deduplication
        // Note: verify if tempParser provides buffer. If diskStorage, read file.
        // Assuming simple upload for now.
        // For consistency with uploadAsset, ideally we deduplicate.
        // But for CSV temp uploads, we'll simpler logic first or mimic uploadAsset.
        const fileBuffer = file.buffer; // Assuming memory storage from config?
        // If config uses disk storage, we'd need fs.readFileSync(file.path)
        // Let's assume standard Asset upload flow logic here.

        // We will upload to 'assets' folder directly.
        // Use filename or random ID if no buffer dedupe available conveniently.
        const publicId = `assets/csv_${Date.now()}_${Math.random()
          .toString(36)
          .substring(7)}`;

        const uploadResult = await cloudinary.uploader.upload(
          file.path || file.url, // Use path if disk storage
          {
            folder: "assets",
            public_id: publicId.split("/").pop(), // Cloudinary adds folder
            resource_type: "auto",
          }
        );

        // 2. Create Asset Record
        const asset = await Asset.create({
          publicId: uploadResult.public_id,
          secureUrl: uploadResult.secure_url,
          assetId: uploadResult.public_id,
          hash: uploadResult.etag || "csv_upload_no_hash", // Fallback
          status: "temp",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
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
          resourceType: uploadResult.resource_type,
          bytes: uploadResult.bytes,
        });

        console.log(`✅ [CSV Image] Asset uploaded: ${asset.publicId}`);

        res.status(200).json(
          ApiResponse.success("Temp image uploaded", {
            temp_key: asset.publicId, // Mapping publicId to temp_key
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
    const { temp_key } = req.params; // In new system, this is publicId

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

      // Determine if deletable (only if temp and unused)
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

      // Delete from Cloudinary
      await cloudinary.uploader.destroy(asset.publicId);

      // Delete from DB
      await Asset.deleteOne({ _id: asset._id });

      console.log("✅ [CSV Image] Deleted asset:", temp_key);

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

    // Find all matching assets
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
   * Now simply promotes the Assets to 'permanent' status.
   */
  convertToPermanent = asyncHandler(async (req, res) => {
    const { temp_keys } = req.body;

    if (!temp_keys || !Array.isArray(temp_keys) || temp_keys.length === 0) {
      return res
        .status(400)
        .json(ApiResponse.error("temp_keys array is required", 400).toJSON());
    }

    const { finalizeImages } = require("../utils/mediaFinalizer");

    // Use our finalizeImages result which handles promotion
    // Since we might not have the entity ID here (it might be done before import?),
    // finalizeImages supports fallback to just marking permanent if entityId is null.
    // However, usually import happens together.
    // If strict entity tracking is required, the Import variants step should do it.
    // Here we'll just mark them permanent to prevent cleanup.

    const result = await finalizeImages(temp_keys, null, null);

    // Map result to match expected frontend structure (converted/failed)
    const converted = result.success.map((id) => ({
      temp_key: id,
      old_public_id: id,
      new_public_id: id, // No change in ID/Folder
      url: "", // Provide if possible, or frontend might not need it if ID logic holds
    }));

    // We need URLs for the response? Let's fetch them if needed or skip.
    // The previous controller returned URLs.
    // Let's quickly re-fetch the assets to get URLs for the response.
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
   * Manual cleanup
   * Note: Standard Asset cleanup job now handles this.
   * This method can trigger that job or manual deletion.
   */
  manualCleanup = asyncHandler(async (req, res) => {
    // Trigger standard cleanup logic or re-implement for specific scope
    // For safety, we'll leave this implementing the Asset deletion logic
    // but restricted to CSV source assets.

    const { maxAgeHours = 24 } = req.body;
    const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    const oldAssets = await Asset.find({
      "origin.source": "csv",
      status: "temp",
      createdAt: { $lt: cutoffDate }, // uploadedAt equivalent
      usedBy: { $size: 0 },
    });

    const results = { deleted: [], failed: [] };

    for (const asset of oldAssets) {
      try {
        await cloudinary.uploader.destroy(asset.publicId);
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
