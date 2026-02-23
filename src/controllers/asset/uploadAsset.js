const crypto = require("crypto");
const multer = require("multer");
const { cloudinary } = require("../../config/cloudinary");
const Asset = require("../../models/Asset");

// Use memory storage to access buffer for hashing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

/**
 * Upload asset with hash-based deduplication and full metadata support
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

      // Parse JSON fields if they are strings (Multipart/form-data)
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

      // 1. Generate hash from file buffer for deduplication
      const hash = crypto
        .createHash("sha256")
        .update(file.buffer)
        .digest("hex");

      // 2. Check for existing asset with same hash
      const existingAsset = await Asset.findByHash(hash);

      if (existingAsset) {
        console.log(`✅ Asset with hash ${hash} already exists, reusing`);
        // We can update the usage or just return it
        // Ideally, we should add to usedBy if we knew the entity, but intendedFor isn't enough
        // We will return it, and let the frontend use the ID.
        // Promotion happens later when saving the entity (Product/Category).

        return res.status(200).json({
          success: true,
          message: "Asset already exists, reusing existing",
          asset: existingAsset,
          duplicate: true,
        });
      }

      // 3. Upload to Cloudinary (Stream)
      // No quality/format/transformation options — original file is stored as-is.
      // Optimization happens only at delivery via frontend URL transforms (cloudinary-transform.ts).
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "assets",
            public_id: hash,
            overwrite: false,
            resource_type: "auto",
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(file.buffer);
      });

      // 4. Create DB record
      const asset = await Asset.create({
        publicId: uploadResult.public_id,
        secureUrl: uploadResult.secure_url,
        assetId: uploadResult.public_id,
        hash,
        status: "temp",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        origin: {
          source: origin.source,
          sourceContext: origin.sourceContext,
        },
        intendedFor: intendedFor || null,
        usedBy: [],
        uploadedBy: req.user?._id || req.user?.id, // Assumes verifyToken middleware runs before

        // Metadata
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format,
        resourceType: uploadResult.resource_type,
        bytes: uploadResult.bytes,
      });

      console.log(`✅ New asset uploaded: ${asset.publicId}`);

      return res.status(201).json({
        success: true,
        message: "Asset uploaded successfully",
        asset,
        duplicate: false,
      });
    } catch (error) {
      console.error("❌ Error uploading asset:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },
];

module.exports = { uploadAsset };
