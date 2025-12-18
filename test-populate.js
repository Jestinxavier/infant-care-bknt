require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./src/models/Order');
const Product = require('./src/models/Product');

async function testPopulate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const orderId = '94CFB5A4';
        const order = await Order.findOne({ orderId }).populate('items.productId');

        if (order) {
            console.log('Order found!');
            order.items.forEach((item, i) => {
                console.log(`Item ${i + 1}:`);
                console.log(`  productId: ${item.productId ? (item.productId._id || item.productId) : 'NULL'}`);
                if (item.productId && typeof item.productId === 'object') {
                    console.log(`  TITLE: ${item.productId.title}`);
                } else {
                    console.log(`  POPULATE FAILED for ID: ${item.productId}`);
                }
            });
        } else {
            console.log('Order not found!');
        }
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

testPopulate();
