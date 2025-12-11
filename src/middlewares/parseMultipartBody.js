const parseMultipartBody = (req, res, next) => {
    if (!req.body) return next();

    // Fields that are sent as JSON strings and need parsing
    const jsonFields = ["variants", "images", "variantOptions", "tags", "details", "pricing", "stockObj"];

    jsonFields.forEach((field) => {
        if (req.body[field] && typeof req.body[field] === "string") {
            try {
                // Only parse if it looks like a JSON array or object
                if (
                    req.body[field].startsWith("[") ||
                    req.body[field].startsWith("{")
                ) {
                    req.body[field] = JSON.parse(req.body[field]);
                }
            } catch (error) {
                console.warn(`Failed to parse ${field} from multipart body:`, error);
                // Leave as is if parsing fails, validation will likely catch it
            }
        }
    });

    // Handle number conversion for specific fields if they are strings
    const numberFields = [
        "price",
        "discountPrice",
        "stock",
        "weight",
        "length",
        "width",
        "height",
        "averageRating",
        "totalReviews",
    ];

    numberFields.forEach((field) => {
        if (req.body[field] && typeof req.body[field] === "string") {
            const val = parseFloat(req.body[field]);
            if (!isNaN(val)) {
                req.body[field] = val;
            }
        }
    });

    // Handle boolean conversion
    const booleanFields = ["skuLocked"];
    booleanFields.forEach((field) => {
        if (req.body[field] !== undefined) {
            req.body[field] = req.body[field] === 'true';
        }
    });

    next();
};

module.exports = parseMultipartBody;
