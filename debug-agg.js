require('dotenv').config();
const mongoose = require('mongoose');

async function debugAggregation() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const aggregation = [
            { $match: { orderStatus: { $ne: 'cancelled' } } },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.productId',
                    variantId: { $first: '$items.variantId' },
                    totalSold: { $sum: '$items.quantity' },
                    revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
                }
            },
            { $match: { _id: { $ne: null } } },
            { $sort: { totalSold: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'products',
                    let: { pid: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $or: [
                                        { $eq: ["$_id", { $cond: [{ $regexMatch: { input: { $toString: "$$pid" }, regex: /^[0-9a-fA-F]{24}$/ } }, { $toObjectId: "$$pid" }, "$$pid"] }] },
                                        { $eq: ["$url_key", "$$pid"] },
                                        { $in: ["$$pid", "$variants.id"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: 'productInfo'
                }
            },
            { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },
            { $limit: 5 },
            {
                $project: {
                    name: {
                        $ifNull: [
                            "$productInfo.title",
                            { $ifNull: ["$productInfo.name", { $ifNull: ["$variantId", "Unknown Product"] }] }
                        ]
                    },
                    totalSold: 1,
                    revenue: 1
                }
            }
        ];

        const result = await mongoose.connection.db.collection('orders').aggregate(aggregation).toArray();
        console.log(`Results Found: ${result.length}`);
        result.forEach((r, i) => {
            console.log(`Rank ${i + 1}: Name="${r.name}", Sold=${r.totalSold}, Revenue=${r.revenue}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

debugAggregation();
