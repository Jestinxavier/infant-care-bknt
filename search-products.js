require('dotenv').config();
const mongoose = require('mongoose');

async function searchProducts() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const products = await mongoose.connection.db.collection('products').find({
            $or: [
                { title: /romper/i },
                { name: /romper/i },
                { 'variants.id': /romper/i },
                { 'variants.url_key': /romper/i }
            ]
        }).toArray();
        console.log(`Found ${products.length} products with "romper":`);
        products.forEach(p => console.log(`ID: ${p._id} Title: ${p.title} URL_KEY: ${p.url_key}`));
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

searchProducts();
