const crypto = require("crypto");
const multer = require("multer");
const { uploadToMediaServer } = require("../../config/mediaServer");
const Asset = require("../../models/Asset");
const logger = require("../../utils/logger");

// 100MB limit kept for future video support; media server currently accepts images only.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

/**
 * Upload asset with hash-based deduplication
 * POST /api/admin/assets/upload
 */
const uploadAsset = [
  upload.single("file"),
  async (req, res) => {
    try {
      let { origin, intendedFor } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      if (typeof origin === "string") {
        try {
          origin = JSON.parse(origin);
        } catch (e) {
          return res.status(400).json({
            success: false,
            message: "Invalid origin format",
          });
        }
      }

      if (!origin || !origin.source || !origin.sourceContext) {
        return res.status(400).json({
          success: false,
          message: "Origin metadata is required (source, sourceContext)",
        });
      }

      // Generate hash for deduplication
      const hash = crypto
        .createHash("sha256")
        .update(file.buffer)
        .digest("hex");

      // Return existing asset if hash matches
      const existingAsset = await Asset.findByHash(hash);
      if (existingAsset) {
        logger.info(`✅ Asset with hash ${hash} already exists, reusing`);
        return res.status(200).json({
          success: true,
          message: "Asset already exists, reusing existing",
          asset: existingAsset,
          duplicate: true,
        });
      }

      // Upload to media server using hash as public_id for deduplication
      const uploadResult = await uploadToMediaServer(file.buffer, {
        mimeType: file.mimetype,
        originalName: file.originalname,
        public_id: hash,
      });

      const asset = await Asset.create({
        publicId: uploadResult.public_id,
        secureUrl: uploadResult.url,
        assetId: uploadResult.public_id,
        hash,
        status: "temp",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        origin: {
          source: origin.source,
          sourceContext: origin.sourceContext,
        },
        intendedFor: intendedFor || null,
        usedBy: [],
        uploadedBy: req.user?._id || req.user?.id,
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format,
        resourceType: file.mimetype.startsWith("video/") ? "video" : "image",
        bytes: uploadResult.size,
      });

      logger.info(`✅ New asset uploaded: ${asset.publicId}`);

      return res.status(201).json({
        success: true,
        message: "Asset uploaded successfully",
        asset,
        duplicate: false,
      });
    } catch (error) {
      logger.error("❌ Error uploading asset:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },
];

module.exports = { uploadAsset };
