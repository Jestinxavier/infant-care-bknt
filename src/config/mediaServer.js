/**
 * Media Server config — replaces Cloudinary for new uploads.
 * Old Cloudinary assets continue to work via their existing URLs (backward compat).
 * Required env vars: MEDIA_SERVER_URL, MEDIA_SERVER_API_KEY
 */
const multer = require('multer');
const logger = require('../utils/logger');

const MEDIA_SERVER_URL = process.env.MEDIA_SERVER_URL;
const MEDIA_SERVER_API_KEY = process.env.MEDIA_SERVER_API_KEY;

const VALID_FOLDERS = [
  'products',
  'cms-home',
  'cms-about',
  'avatar',
  'temp',
  'temporary',
  'assets',
  'category',
  'cms',
];

const getValidFolder = (folder) => {
  if (folder && VALID_FOLDERS.includes(folder)) return folder;
  return 'uploads';
};

const imageFileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/')) {
    return cb(new Error('Only image and video files are allowed'), false);
  }
  cb(null, true);
};

const uploadOptions = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter,
};

// Same names as cloudinary.js so routes importing parser/mediaParser/tempParser
// don't need changes during the transition.
const parser = multer(uploadOptions);
const mediaParser = multer(uploadOptions);
const tempParser = multer(uploadOptions);

/**
 * Upload a buffer to the media server.
 * @param {Buffer} buffer - File buffer
 * @param {{ public_id?: string, mimeType?: string, originalName?: string }} opts
 * @returns {Promise<{ url, filename, public_id, width, height, format, size }>}
 */
async function uploadToMediaServer(buffer, opts = {}) {
  if (!MEDIA_SERVER_URL) throw new Error('MEDIA_SERVER_URL is not configured');
  if (!MEDIA_SERVER_API_KEY) throw new Error('MEDIA_SERVER_API_KEY is not configured');

  const formData = new FormData();
  formData.append(
    'image',
    new Blob([buffer], { type: opts.mimeType || 'image/jpeg' }),
    opts.originalName || 'image.jpg',
  );
  if (opts.public_id) formData.append('public_id', opts.public_id);

  const response = await fetch(`${MEDIA_SERVER_URL}/api/media/upload`, {
    method: 'POST',
    headers: { 'x-api-key': MEDIA_SERVER_API_KEY },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Media server upload failed: ${err.error || response.statusText}`);
  }

  const result = await response.json();
  if (result && typeof result.url === 'string' && MEDIA_SERVER_URL) {
    try {
      if (result.url.startsWith('/')) {
        result.url = `${MEDIA_SERVER_URL.replace(/\/+$/, '')}${result.url}`;
      } else {
        const parsedUrl = new URL(result.url);
        const mediaServerParsed = new URL(MEDIA_SERVER_URL);
        parsedUrl.protocol = mediaServerParsed.protocol;
        parsedUrl.host = mediaServerParsed.host;
        result.url = parsedUrl.toString();
      }
    } catch (e) {
      logger.warn(`[MediaServer] Failed to normalize URL ${result.url}: ${e.message}`);
    }
  }
  return result;
}

/**
 * Delete a file from the media server by filename.
 * @param {string} filename - e.g. 'a1b2c3d4ef567890.webp'
 * @returns {Promise<boolean>}
 */
async function deleteFromMediaServer(filename) {
  if (!MEDIA_SERVER_URL || !MEDIA_SERVER_API_KEY) {
    logger.warn('[MediaServer] delete skipped — server not configured');
    return false;
  }

  try {
    const response = await fetch(`${MEDIA_SERVER_URL}/api/media/delete`, {
      method: 'DELETE',
      headers: {
        'x-api-key': MEDIA_SERVER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename }),
    });
    return response.ok;
  } catch (err) {
    logger.warn(`[MediaServer] delete failed for ${filename}:`, err.message);
    return false;
  }
}

/**
 * Determine if a URL belongs to our media server.
 * @param {string} url
 * @returns {boolean}
 */
function isMediaServerUrl(url) {
  if (!url || !MEDIA_SERVER_URL) return false;
  // Compare host so localhost and production both match
  try {
    const a = new URL(url);
    const b = new URL(MEDIA_SERVER_URL);
    return a.host === b.host;
  } catch {
    return false;
  }
}

logger.info(
  MEDIA_SERVER_URL
    ? `[MediaServer] configured at ${MEDIA_SERVER_URL}`
    : '[MediaServer] MEDIA_SERVER_URL not set — uploads will fail',
);

/**
 * Express middleware — runs AFTER any multer memory-storage middleware.
 * Uploads every file in req.files / req.file to the media server and
 * patches the fields that controllers expect:
 *   file.path       → full URL  (Cloudinary compat: multer-storage-cloudinary sets file.path)
 *   file.secure_url → full URL  (Cloudinary API compat)
 *   file.url        → full URL
 *   file.filename   → public_id (Cloudinary compat: multer-storage-cloudinary sets file.filename)
 *   file.public_id  → public_id
 *   file.width / height / format / size → Sharp metadata
 *
 * Drop this middleware right after the multer call — no controller changes needed.
 */
async function uploadFilesMiddleware(req, res, next) {
  const files = req.files?.length
    ? req.files
    : req.file
    ? [req.file]
    : [];

  if (!files.length) return next();

  try {
    await Promise.all(
      files.map(async (file) => {
        if (!file.buffer) return; // already processed or disk storage
        const result = await uploadToMediaServer(file.buffer, {
          mimeType: file.mimetype,
          originalName: file.originalname,
        });
        file.path       = result.url;
        file.secure_url = result.url;
        file.url        = result.url;
        file.filename   = result.public_id;
        file.public_id  = result.public_id;
        file.width      = result.width;
        file.height     = result.height;
        file.format     = result.format;
        file.size       = result.size;
      }),
    );
    next();
  } catch (err) {
    logger.error('[MediaServer] uploadFilesMiddleware error:', err.message);
    next(err);
  }
}

/**
 * Extract filename from a media server URL for deletion.
 * Works for both http://localhost:5003/uploads/abc.webp
 * and https://media.yourdomain.com/uploads/abc.webp
 */
function filenameFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  return require('path').basename(url.split('?')[0]);
}

module.exports = {
  parser,
  mediaParser,
  tempParser,
  getValidFolder,
  VALID_FOLDERS,
  uploadToMediaServer,
  uploadFilesMiddleware,
  deleteFromMediaServer,
  isMediaServerUrl,
  filenameFromUrl,
};
