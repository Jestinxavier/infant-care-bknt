require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./src/models/user");

const listUsers = async () => {
  
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const users = await User.find({}, "email username role");

    console.log("\n--- User List ---");
    users.forEach((u) => {
      console.log(
        `ID: ${u._id} | Username: ${u.username} | Email: ${u.email} | Role: ${u.role}`
      );
    });
    console.log("-----------------\n");
  } catch (error) {
    console.error("Error listing users:", error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};

listUsers();
