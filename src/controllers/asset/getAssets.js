const Asset = require("../../models/Asset");

/**
 * Get assets with filtering and cursor-based pagination
 * GET /api/admin/assets?status=temp&origin=product&search=abc&cursor=id&limit=20
 */
const getAssets = async (req, res) => {
  try {
    const { status, origin, search, cursor, limit = 20 } = req.query;

    // Build query
    const query = {};

    // Filter by status (temp or permanent)
    if (status) {
      query.status = status;
    }

    // Filter by origin source
    if (origin) {
      query["origin.source"] = origin;
    }

    // Search by publicId (partial match, case-insensitive)
    if (search) {
      query.publicId = { $regex: search, $options: "i" };
    }

    // Cursor-based pagination
    if (cursor) {
      query._id = { $lt: cursor };
    }

    // Fetch assets with pagination
    const assets = await Asset.find(query)
      .sort({ _id: -1 }) // Sort by _id DESC (newest first)
      .limit(parseInt(limit) + 1) // Fetch one extra to check if more exist
      .populate("uploadedBy", "name email") // Populate user info
      .lean(); // Convert to plain objects for better performance

    // Check if there are more results
    const hasMore = assets.length > parseInt(limit);
    const items = hasMore ? assets.slice(0, limit) : assets;

    // Next cursor is the last item's _id
    const nextCursor = hasMore ? items[items.length - 1]._id : null;

    res.status(200).json({
      success: true,
      assets: items,
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
