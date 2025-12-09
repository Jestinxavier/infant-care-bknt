const { cloudinary, mediaParser } = require("../config/cloudinary");
const ApiResponse = require("../core/ApiResponse");
const ApiError = require("../core/ApiError");
const asyncHandler = require("../core/middleware/asyncHandler");
const Media = require("../models/Media");

/**
 * Media Controller
 * Handles media upload and delete operations
 */
class MediaController {
  /**
   * Upload a single media file to Cloudinary
   * POST /api/v1/admin/media/upload
   */
  uploadMedia = [
    // Use multer middleware for file upload
    mediaParser.single("file"),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        return res
          .status(400)
          .json(ApiResponse.error("No file provided", 400).toJSON());
      }

      try {
        // req.file contains Cloudinary metadata
        // Note: multer-storage-cloudinary v4 populates 'path' (secure_url) and 'filename' (public_id)
        const fileData = req.file;
        const publicId = fileData.filename || fileData.public_id;

        console.log("✅ [Media] File uploaded successfully:", {
          originalname: fileData.originalname,
          mimetype: fileData.mimetype,
          size: fileData.size,
          filename: fileData.filename,
          path: fileData.path,
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
          // Continue even if tagging fails - the upload was successful
        }

        // Get full image details from Cloudinary (including dimensions)
        let cloudinaryDetails = {};
        try {
          const details = await cloudinary.api.resource(publicId, {
            resource_type: "image",
          });
          cloudinaryDetails = {
            width: details.width || 0,
            height: details.height || 0,
            format: details.format || fileData.mimetype?.split("/")[1] || "jpg",
            bytes: details.bytes || fileData.size || 0,
          };
        } catch (detailsError) {
          console.warn(
            "⚠️ [Media] Could not fetch Cloudinary details:",
            detailsError
          );
          // Fallback to file data
          cloudinaryDetails = {
            width: fileData.width || 0,
            height: fileData.height || 0,
            format:
              fileData.format || fileData.mimetype?.split("/")[1] || "jpg",
            bytes: fileData.size || fileData.bytes || 0,
          };
        }

        // Return Cloudinary metadata in the expected format
        const metadata = {
          url: fileData.path || fileData.url || fileData.secure_url,
          public_id: publicId,
          width: cloudinaryDetails.width,
          height: cloudinaryDetails.height,
          format: cloudinaryDetails.format,
          resource_type: fileData.resource_type || "image",
          size: cloudinaryDetails.bytes,
          bytes: cloudinaryDetails.bytes,
          created_at: fileData.created_at || new Date().toISOString(),
          alt: fileData.originalname, // Use original filename as alt text
        };

        // Save to Media collection for tracking
        // Get user ID from request if available (from auth middleware)
        const userId = req.user?.id || req.user?._id || null;
        const context = req.body?.context || "other"; // Optional context from request

        try {
          await Media.findOneAndUpdate(
            { public_id: publicId },
            {
              public_id: publicId,
              url: metadata.url,
              width: metadata.width,
              height: metadata.height,
              format: metadata.format,
              size: metadata.bytes,
              resource_type: metadata.resource_type,
              isTemp: true, // Mark as temporary until form submission
              uploadedAt: new Date(),
              finalizedAt: null,
              uploadedBy: userId,
              context: context,
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
          // Continue - the upload was successful even if DB tracking fails
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
      // Delete from Cloudinary
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: "image", // Default to image, can be made configurable
      });

      console.log("🗑️ [Media] Delete result:", result);

      // Also remove from Media collection
      try {
        await Media.findOneAndDelete({ public_id: publicId });
        console.log("✅ [Media] Removed from database:", publicId);
      } catch (dbError) {
        console.warn(
          "⚠️ [Media] Failed to remove from DB (non-critical):",
          dbError
        );
      }

      if (result.result === "ok" || result.result === "not found") {
        // "not found" is also considered success (idempotent delete)
        res
          .status(200)
          .json(ApiResponse.success("File deleted successfully").toJSON());
      } else {
        throw new Error(`Delete failed: ${result.result}`);
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
      const results = {
        deleted: [],
        failed: [],
      };

      // Process each public_id
      for (const publicId of publicIds) {
        try {
          // Delete from Cloudinary
          const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: "image",
          });

          if (result.result === "ok" || result.result === "not found") {
            // Remove from Media collection
            await Media.findOneAndDelete({ public_id: publicId });
            results.deleted.push(publicId);
            console.log("✅ [Media] Deleted temp image:", publicId);
          } else {
            throw new Error(`Delete failed: ${result.result}`);
          }
        } catch (error) {
          console.error(`❌ [Media] Failed to delete ${publicId}:`, error);
          results.failed.push({ publicId, error: error.message });
        }
      }

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
