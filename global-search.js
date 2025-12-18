require('dotenv').config();
const mongoose = require('mongoose');

async function globalSearch() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const collections = await mongoose.connection.db.listCollections().toArray();
        const searchIdStr = '69231bc117fc772d26f701ae';
        const searchIdObj = new mongoose.Types.ObjectId(searchIdStr);

        console.log(`Searching for ${searchIdStr} or its ObjectId in all collections...`);

        for (const c of collections) {
            const name = c.name;
            const count = await mongoose.connection.db.collection(name).countDocuments();
            if (count === 0) continue;

            // Search for direct _id match
            const byId = await mongoose.connection.db.collection(name).findOne({ _id: searchIdObj });
            const byStrId = await mongoose.connection.db.collection(name).findOne({ _id: searchIdStr });

            if (byId) console.log(`[${name}] Found as ObjectId _id!`);
            if (byStrId) console.log(`[${name}] Found as String _id!`);

            // Search in all fields (sampled/limited if many docs)
            const docs = await mongoose.connection.db.collection(name).find({}).limit(500).toArray();
            for (const doc of docs) {
                const docStr = JSON.stringify(doc);
                if (docStr.includes(searchIdStr)) {
                    console.log(`[${name}] Found in field of document!`);
                    // Find which field
                    for (const key in doc) {
                        if (String(doc[key]) === searchIdStr || String(doc[key]) === String(searchIdObj)) {
                            console.log(`   Field: ${key}`);
                        }
                    }
                    break;
                }
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

globalSearch();
