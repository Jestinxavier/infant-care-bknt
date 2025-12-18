require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Use absolute paths for requires
const Product = require(path.join(process.cwd(), 'src/models/Product'));
const { transformForDashboard } = require(path.join(process.cwd(), 'src/utils/transformForDashboard'));

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    console.log('Connected to DB');
    const products = await Product.find({})
        .populate("category", "name slug")
        .sort({ createdAt: -1 })
        .lean();

    console.log('Total Products in DB:', products.length);

    const formatted = products.map(p => transformForDashboard(p));

    console.log('--- Low Stock Findings ---');

    formatted.forEach(p => {
        const lowStockVariants = p.variants.filter(v => v.stock < 10);
        const isParentLow = (p.stock < 10 && p.variantCount === 0);
        const hasLowVariants = lowStockVariants.length > 0;

        if (isParentLow || hasLowVariants) {
            console.log(`[LOW STOCK] ${p.title}`);
            console.log(`  - Parent Stock: ${p.stock}`);
            console.log(`  - Variant Count: ${p.variantCount}`);
            if (hasLowVariants) {
                console.log(`  - Low Stock Variants: ${lowStockVariants.map(v => `${v.attributes.color || ''} ${v.attributes.age || ''} (${v.stock})`).join(', ')}`);
            }
            console.log('---');
        }
    });

    process.exit(0);
}).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
