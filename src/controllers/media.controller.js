const { cloudinary, mediaParser } = require("../config/cloudinary");
const ApiResponse = require("../core/ApiResponse");
const ApiError = require("../core/ApiError");
const asyncHandler = require("../core/middleware/asyncHandler");

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
        return res.status(400).json(
          ApiResponse.error("No file provided", 400).toJSON()
        );
      }

      try {
        // req.file contains Cloudinary metadata
        // Note: multer-storage-cloudinary v4 populates 'path' (secure_url) and 'filename' (public_id)
        const fileData = req.file;

        console.log("✅ [Media] File uploaded successfully:", {
          originalname: fileData.originalname,
          mimetype: fileData.mimetype,
          size: fileData.size,
          filename: fileData.filename,
          path: fileData.path,
        });

        // Return Cloudinary metadata in the expected format
        // Fallback to standard Multer fields if specific keys are missing
        const metadata = {
          url: fileData.path || fileData.url || fileData.secure_url,
          public_id: fileData.filename || fileData.public_id,
          width: fileData.width || 0, // dimensions might not be returned by storage engine directly
          height: fileData.height || 0,
          format: fileData.format || fileData.mimetype?.split("/")[1] || "website",
          resource_type: fileData.resource_type || "image",
          bytes: fileData.size || fileData.bytes,
          created_at: fileData.created_at || new Date().toISOString(),
          alt: fileData.originalname, // Use original filename as alt text
        };

        res.status(200).json(
          ApiResponse.success("File uploaded successfully", metadata).toJSON()
        );
      } catch (error) {
        console.error("❌ [Media] Error processing upload:", error);
        res.status(500).json(
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
    const publicId = req.params.publicId || req.query.publicId || req.body.publicId;

    if (!publicId) {
      return res.status(400).json(
        ApiResponse.error("Public ID is required", 400).toJSON()
      );
    }

    try {
      // Delete from Cloudinary
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: "image", // Default to image, can be made configurable
      });

      console.log("🗑️ [Media] Delete result:", result);

      if (result.result === "ok" || result.result === "not found") {
        // "not found" is also considered success (idempotent delete)
        res.status(200).json(
          ApiResponse.success("File deleted successfully").toJSON()
        );
      } else {
        throw new Error(`Delete failed: ${result.result}`);
      }
    } catch (error) {
      console.error("❌ [Media] Delete error:", error);
      res.status(500).json(
        ApiResponse.error("Failed to delete file", 500, error).toJSON()
      );
    }
  });
}

module.exports = new MediaController();

