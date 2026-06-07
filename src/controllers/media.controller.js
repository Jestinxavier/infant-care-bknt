const crypto = require('crypto');
const { getValidFolder, uploadToMediaServer, deleteFromMediaServer, isMediaServerUrl } = require('../config/mediaServer');
const ApiResponse = require('../core/ApiResponse');
const asyncHandler = require('../core/middleware/asyncHandler');
const Media = require('../models/Media');
const multer = require('multer');
const logger = require('../utils/logger');

// Memory storage — buffer is sent directly to media server
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

class MediaController {
  /**
   * Upload a single media file to our media server.
   * POST /api/v1/admin/media/upload
   * Body: file (multipart), folder (optional), imageType (optional)
   */
  uploadMedia = [
    memoryUpload.single('file'),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        return res.status(400).json(ApiResponse.error('No file provided', 400).toJSON());
      }

      try {
        const folder = req.body?.folder || 'uploads';
        const imageType = req.body?.imageType || 'default';
        const validFolder = getValidFolder(folder);

        logger.info(`📁 [Media] Uploading to folder: ${validFolder}, type: ${imageType}`);

        // Content-based hash for deduplication (same file → same public_id)
        const fileHash = crypto
          .createHash('md5')
          .update(req.file.buffer)
          .digest('hex')
          .substring(0, 16);

        logger.info(`🔑 [Media] Content hash: ${fileHash}`);

        const uploadResult = await uploadToMediaServer(req.file.buffer, {
          public_id: fileHash,
          mimeType: req.file.mimetype,
          originalName: req.file.originalname,
        });

        logger.info('✅ [Media] File uploaded:', {
          originalname: req.file.originalname,
          size: req.file.size,
          folder: validFolder,
          public_id: uploadResult.public_id,
        });

        const metadata = {
          url: uploadResult.url,
          alt: req.file.originalname || '',
          width: uploadResult.width || 0,
          height: uploadResult.height || 0,
          public_id: uploadResult.public_id,
        };

        // Persist metadata for lifecycle tracking
        const userId = req.user?.id || req.user?._id || null;
        const context = req.body?.context || validFolder;

        try {
          await Media.findOneAndUpdate(
            { public_id: metadata.public_id },
            {
              public_id: metadata.public_id,
              url: metadata.url,
              width: metadata.width,
              height: metadata.height,
              format: uploadResult.format || 'webp',
              size: uploadResult.size || req.file.size,
              resource_type: 'image',
              isTemp: true,
              uploadedAt: new Date(),
              finalizedAt: null,
              uploadedBy: userId,
              context,
              folder: validFolder,
              alt: metadata.alt,
            },
            { upsert: true, new: true },
          );
          logger.info('✅ [Media] Saved metadata to DB:', metadata.public_id);
        } catch (dbError) {
          logger.warn('⚠️ [Media] Failed to save metadata (non-critical):', dbError);
        }

        res.status(200).json(ApiResponse.success('File uploaded successfully', metadata).toJSON());
      } catch (error) {
        logger.error('❌ [Media] Upload error:', error);
        res.status(500).json(ApiResponse.error('Failed to process upload', 500, error).toJSON());
      }
    }),
  ];

  /**
   * Delete a media file.
   * DELETE /api/v1/admin/media/delete/:publicId
   */
  deleteMedia = asyncHandler(async (req, res) => {
    const publicId = req.params.publicId || req.query.publicId || req.body.publicId;

    if (!publicId) {
      return res.status(400).json(ApiResponse.error('Public ID is required', 400).toJSON());
    }

    try {
      const { deleteAssets } = require('../utils/mediaFinalizer');
      const results = await deleteAssets([publicId]);

      if (results.deleted.length > 0 || results.archived?.length > 0) {
        res.status(200).json(ApiResponse.success('File deleted successfully').toJSON());
      } else {
        throw new Error(results.failed[0]?.error || 'Failed to delete file (not found)');
      }
    } catch (error) {
      logger.error('❌ [Media] Delete error:', error);
      res.status(500).json(ApiResponse.error('Failed to delete file', 500, error).toJSON());
    }
  });

  /**
   * Mark images as final (remove temp flag in DB).
   * POST /api/v1/admin/media/finalize
   * Body: { publicIds: string[] }
   */
  finalizeMedia = asyncHandler(async (req, res) => {
    const { publicIds } = req.body;

    if (!publicIds || !Array.isArray(publicIds) || publicIds.length === 0) {
      return res.status(400).json(ApiResponse.error('publicIds array is required', 400).toJSON());
    }

    const results = { success: [], failed: [] };

    for (const publicId of publicIds) {
      try {
        const updated = await Media.findOneAndUpdate(
          { public_id: publicId },
          { isTemp: false, finalizedAt: new Date() },
          { new: true },
        );

        if (updated) {
          results.success.push(publicId);
          logger.info('✅ [Media] Marked as final:', publicId);
        } else {
          results.failed.push({ publicId, error: 'Not found in DB' });
        }
      } catch (error) {
        logger.error(`❌ [Media] Failed to finalize ${publicId}:`, error);
        results.failed.push({ publicId, error: error.message });
      }
    }

    res.status(200).json(
      ApiResponse.success('Images finalized', {
        success: results.success,
        failed: results.failed,
        total: publicIds.length,
        succeeded: results.success.length,
      }).toJSON(),
    );
  });

  /**
   * Batch delete temp images (cancel / cleanup).
   * POST /api/v1/admin/media/delete-temp
   * Body: { publicIds: string[] }
   */
  deleteTempMedia = asyncHandler(async (req, res) => {
    const { publicIds } = req.body;

    if (!publicIds || !Array.isArray(publicIds) || publicIds.length === 0) {
      return res.status(400).json(ApiResponse.error('publicIds array is required', 400).toJSON());
    }

    try {
      const { deleteAssets } = require('../utils/mediaFinalizer');
      const results = await deleteAssets(publicIds);

      res.status(200).json(
        ApiResponse.success('Temp images deleted', {
          deleted: results.deleted,
          failed: results.failed,
          total: publicIds.length,
          deletedCount: results.deleted.length,
        }).toJSON(),
      );
    } catch (error) {
      logger.error('❌ [Media] Batch delete error:', error);
      res.status(500).json(ApiResponse.error('Failed to delete temp images', 500, error).toJSON());
    }
  });
}

module.exports = new MediaController();
