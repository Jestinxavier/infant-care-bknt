const Asset = require("../../models/Asset");
const mongoose = require("mongoose");

/**
 * Get assets with filtering and pagination
 * Supports:
 * - Page mode:   GET /api/admin/assets?status=temp&origin=product&search=abc&page=1&limit=20
 * - Cursor mode: GET /api/admin/assets?status=temp&origin=product&search=abc&cursor=<id>&limit=20
 */
const getAssets = async (req, res) => {
  try {
    const { status, origin, search, cursor } = req.query;
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const parsedPage = Number.parseInt(req.query.page, 10);
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 100)
        : 20;
    const page =
      Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const useCursor = typeof cursor === "string" && cursor.trim().length > 0;

    // Build query
    const baseQuery = {};

    // Filter by status (temp or permanent)
    if (status) {
      baseQuery.status = status;
    }

    // Filter by origin source
    if (origin) {
      baseQuery["origin.source"] = origin;
    }

    // Search by publicId (partial match, case-insensitive)
    if (search) {
      baseQuery.publicId = { $regex: search, $options: "i" };
    }

    const [total] = await Promise.all([Asset.countDocuments(baseQuery)]);
    const pages = total === 0 ? 0 : Math.ceil(total / limit);

    let assets = [];
    let hasMore = false;
    let items = [];
    let nextCursor = null;

    if (useCursor) {
      if (!mongoose.Types.ObjectId.isValid(cursor)) {
        return res.status(400).json({
          success: false,
          message: "Invalid cursor",
        });
      }

      const cursorObjectId = new mongoose.Types.ObjectId(cursor);
      const query = {
        ...baseQuery,
        _id: { $lt: cursorObjectId },
      };

      // Cursor mode: fetch one extra to determine hasMore
      assets = await Asset.find(query)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .populate("uploadedBy", "name email")
        .lean();

      hasMore = assets.length > limit;
      items = hasMore ? assets.slice(0, limit) : assets;
      nextCursor =
        hasMore && items.length > 0 ? String(items[items.length - 1]._id) : null;

      // Defensive guard: if backend/windowing ever returns a non-decreasing cursor page,
      // stop further pagination to prevent infinite fetch loops on the client.
      if (items.length > 0) {
        const firstIdHex = String(items[0]._id);
        const cursorHex = String(cursorObjectId);
        if (firstIdHex >= cursorHex) {
          console.warn(
            `[Assets] Cursor anomaly detected (firstId=${firstIdHex}, cursor=${cursorHex}). Forcing hasMore=false.`
          );
          hasMore = false;
          nextCursor = null;
        }
      }
    } else {
      // Page mode: skip/limit with one-extra probing for hasMore
      const skip = (page - 1) * limit;
      assets = await Asset.find(baseQuery)
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit + 1)
        .populate("uploadedBy", "name email")
        .lean();

      hasMore = assets.length > limit;
      items = hasMore ? assets.slice(0, limit) : assets;
      nextCursor =
        hasMore && items.length > 0 ? String(items[items.length - 1]._id) : null;

      // Defensive guard for unstable/looping page windows:
      // if page>1 returns the same first document as previous page, stop pagination.
      if (page > 1 && items.length > 0) {
        const previousFirst = await Asset.find(baseQuery)
          .sort({ _id: -1 })
          .skip((page - 2) * limit)
          .limit(1)
          .select("_id")
          .lean();

        if (
          previousFirst.length > 0 &&
          String(previousFirst[0]._id) === String(items[0]._id)
        ) {
          console.warn(
            `[Assets] Page window anomaly detected at page=${page}. Repeated first _id=${String(
              items[0]._id
            )}. Forcing hasMore=false.`
          );
          hasMore = false;
          nextCursor = null;
        }
      }
    }

    res.status(200).json({
      success: true,
      assets: items,
      pagination: {
        page,
        limit,
        total,
        pages,
        hasMore,
      },
      nextCursor,
      hasMore,
      count: items.length,
    });
  } catch (error) {
    console.error("❌ Error fetching assets:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = { getAssets };
