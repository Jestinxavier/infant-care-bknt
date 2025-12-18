require('dotenv').config();
const mongoose = require('mongoose');

async function listAllVariants() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const products = await mongoose.connection.db.collection('products').find({}).toArray();
        const variantsFound = [];
        products.forEach(p => {
            if (p.variants) {
                p.variants.forEach(v => {
                    variantsFound.push({
                        productId: p._id,
                        productTitle: p.title,
                        variantId: v.id,
                        variantSku: v.sku
                    });
                });
            }
        });
        console.log(`Total Variants across all products: ${variantsFound.length}`);
        variantsFound.forEach(v => {
            console.log(`Product: "${v.productTitle}" | VariantID: "${v.variantId}" | Sku: "${v.variantSku}"`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

listAllVariants();
