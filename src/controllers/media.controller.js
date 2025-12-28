const { cloudinary, getValidFolder } = require("../config/cloudinary");
const ApiResponse = require("../core/ApiResponse");
const ApiError = require("../core/ApiError");
const asyncHandler = require("../core/middleware/asyncHandler");
const Media = require("../models/Media");
const multer = require("multer");

// Use memory storage so we can access the buffer for direct upload
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

/**
 * Media Controller
 * Handles media upload and delete operations
 */
class MediaController {
  /**
   * Upload a single media file to Cloudinary with dynamic folder
   * POST /api/v1/admin/media/upload
   * Body: file (multipart), folder (optional: cms-home, cms-about, products, csv-temp)
   */
  uploadMedia = [
    // Use memory storage to get buffer
    memoryUpload.single("file"),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        return res
          .status(400)
          .json(ApiResponse.error("No file provided", 400).toJSON());
      }

      try {
        // Get folder and imageType from request body (sent as form data)
        const folder = req.body?.folder || "uploads";
        const imageType = req.body?.imageType || "default"; // product, banner_desktop, banner_mobile, category
        const validFolder = getValidFolder(folder);

        console.log(
          `📁 [Media] Uploading to folder: ${validFolder}, type: ${imageType}`
        );

        // NOTE: imageType is logged but NOT used for upload-time transformation
        // All optimization happens at DELIVERY time via frontend URL transforms

        // Create content-based hash for deduplication
        // This ensures same image content gets same public_id
        const crypto = require("crypto");
        const fileHash = crypto
          .createHash("md5")
          .update(req.file.buffer)
          .digest("hex")
          .substring(0, 16); // Use first 16 chars for reasonable length

        const publicIdBase = `${validFolder}/${fileHash}`;

        console.log(`🔑 [Media] Content hash: ${fileHash}`);

        // Upload directly to Cloudinary with specified folder
        // STRICT: NO transformations at upload - store original bytes only
        // All optimization happens at DELIVERY time via frontend URL transforms
        const uploadResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: validFolder,
              public_id: fileHash, // Use hash as public_id for deduplication
              overwrite: true, // Replace existing if same hash
              allowed_formats: ["jpg", "jpeg", "png", "webp"],
              resource_type: "image",
              // NO transformation - preserve original format and resolution
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          uploadStream.end(req.file.buffer);
        });

        const publicId = uploadResult.public_id;

        console.log("✅ [Media] File uploaded successfully:", {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          folder: validFolder,
          public_id: publicId,
          format: uploadResult.format,
        });

        // Add temp-upload tag to Cloudinary asset
        try {
          await cloudinary.uploader.add_tag("temp-upload", [publicId], {
            resource_type: "image",
          });
          console.log("✅ [Media] Added temp-upload tag to:", publicId);
        } catch (tagError) {
          console.warn(
            "⚠️ [Media] Failed to add temp tag (non-critical):",
            tagError
          );
        }

        // Return minimal Cloudinary metadata (url, alt, width, height, public_id)
        // Other fields are stored in DB for tracking but not returned to frontend
        const metadata = {
          url: uploadResult.secure_url,
          alt: req.file.originalname || "",
          width: uploadResult.width || 0,
          height: uploadResult.height || 0,
          public_id: publicId,
        };

        // Save full metadata to Media collection for tracking (internal use only)
        const userId = req.user?.id || req.user?._id || null;
        const context = req.body?.context || validFolder;

        try {
          await Media.findOneAndUpdate(
            { public_id: publicId },
            {
              public_id: publicId,
              url: metadata.url,
              width: metadata.width,
              height: metadata.height,
              format: uploadResult.format || "webp",
              size: uploadResult.bytes || req.file.size,
              resource_type: uploadResult.resource_type || "image",
              isTemp: true,
              uploadedAt: new Date(),
              finalizedAt: null,
              uploadedBy: userId,
              context: context,
              folder: validFolder,
              alt: metadata.alt,
            },
            { upsert: true, new: true }
          );
          console.log("✅ [Media] Saved metadata to database:", publicId);
        } catch (dbError) {
          console.warn(
            "⚠️ [Media] Failed to save metadata to DB (non-critical):",
            dbError
          );
        }

        res
          .status(200)
          .json(
            ApiResponse.success("File uploaded successfully", metadata).toJSON()
          );
      } catch (error) {
        console.error("❌ [Media] Error processing upload:", error);
        res
          .status(500)
          .json(
            ApiResponse.error("Failed to process upload", 500, error).toJSON()
          );
      }
    }),
  ];

  /**
   * Delete a media file from Cloudinary
   * DELETE /api/v1/admin/media/delete/:publicId
   */
  deleteMedia = asyncHandler(async (req, res) => {
    // Check params (legacy), query (standard), or body (alternative)
    const publicId =
      req.params.publicId || req.query.publicId || req.body.publicId;

    if (!publicId) {
      return res
        .status(400)
        .json(ApiResponse.error("Public ID is required", 400).toJSON());
    }

    try {
      // Use unified delete utility
      const { deleteAssets } = require("../utils/mediaFinalizer");
      const results = await deleteAssets([publicId]);

      if (results.deleted.length > 0) {
        res
          .status(200)
          .json(ApiResponse.success("File deleted successfully").toJSON());
      } else {
        throw new Error(
          results.failed[0]?.error || "Failed to delete file (not found)"
        );
      }
    } catch (error) {
      console.error("❌ [Media] Delete error:", error);
      res
        .status(500)
        .json(ApiResponse.error("Failed to delete file", 500, error).toJSON());
    }
  });

  /**
   * Mark images as final (remove temp tag and update DB)
   * POST /api/v1/admin/media/finalize
   * Body: { publicIds: string[] }
   */
  finalizeMedia = asyncHandler(async (req, res) => {
    const { publicIds } = req.body;

    if (!publicIds || !Array.isArray(publicIds) || publicIds.length === 0) {
      return res
        .status(400)
        .json(ApiResponse.error("publicIds array is required", 400).toJSON());
    }

    try {
      const results = {
        success: [],
        failed: [],
      };

      // Process each public_id
      for (const publicId of publicIds) {
        try {
          // Remove temp-upload tag from Cloudinary
          try {
            await cloudinary.uploader.remove_tag("temp-upload", [publicId], {
              resource_type: "image",
            });
            console.log("✅ [Media] Removed temp-upload tag from:", publicId);
          } catch (tagError) {
            console.warn(
              "⚠️ [Media] Failed to remove tag (may not exist):",
              tagError
            );
            // Continue - tag might not exist if already finalized
          }

          // Update Media collection
          const updated = await Media.findOneAndUpdate(
            { public_id: publicId },
            {
              isTemp: false,
              finalizedAt: new Date(),
            },
            { new: true }
          );

          if (updated) {
            results.success.push(publicId);
            console.log("✅ [Media] Marked as final in DB:", publicId);
          } else {
            // Image not in DB, but Cloudinary tag removal succeeded
            // Create entry if it doesn't exist
            try {
              const cloudinaryResource = await cloudinary.api.resource(
                publicId,
                {
                  resource_type: "image",
                }
              );
              await Media.create({
                public_id: publicId,
                url: cloudinaryResource.secure_url,
                width: cloudinaryResource.width || 0,
                height: cloudinaryResource.height || 0,
                format: cloudinaryResource.format || "jpg",
                size: cloudinaryResource.bytes || 0,
                resource_type: "image",
                isTemp: false,
                finalizedAt: new Date(),
                uploadedAt: new Date(cloudinaryResource.created_at),
              });
              results.success.push(publicId);
              console.log("✅ [Media] Created final entry in DB:", publicId);
            } catch (createError) {
              console.warn(
                "⚠️ [Media] Could not create DB entry:",
                createError
              );
              results.success.push(publicId); // Still count as success if tag removed
            }
          }
        } catch (error) {
          console.error(`❌ [Media] Failed to finalize ${publicId}:`, error);
          results.failed.push({ publicId, error: error.message });
        }
      }

      res.status(200).json(
        ApiResponse.success("Images finalized", {
          success: results.success,
          failed: results.failed,
          total: publicIds.length,
          succeeded: results.success.length,
        }).toJSON()
      );
    } catch (error) {
      console.error("❌ [Media] Finalize error:", error);
      res
        .status(500)
        .json(
          ApiResponse.error("Failed to finalize images", 500, error).toJSON()
        );
    }
  });

  /**
   * Batch delete temp images (for cancel/cleanup)
   * POST /api/v1/admin/media/delete-temp
   * Body: { publicIds: string[] }
   */
  deleteTempMedia = asyncHandler(async (req, res) => {
    const { publicIds } = req.body;

    if (!publicIds || !Array.isArray(publicIds) || publicIds.length === 0) {
      return res
        .status(400)
        .json(ApiResponse.error("publicIds array is required", 400).toJSON());
    }

    try {
      const { deleteAssets } = require("../utils/mediaFinalizer");
      const results = await deleteAssets(publicIds);

      res.status(200).json(
        ApiResponse.success("Temp images deleted", {
          deleted: results.deleted,
          failed: results.failed,
          total: publicIds.length,
          deletedCount: results.deleted.length,
        }).toJSON()
      );
    } catch (error) {
      console.error("❌ [Media] Batch delete error:", error);
      res
        .status(500)
        .json(
          ApiResponse.error("Failed to delete temp images", 500, error).toJSON()
        );
    }
  });
}

module.exports = new MediaController();
