require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./src/models/user");
const { USER_ROLES } = require("./resources/constants");

// Default role to assign
const ROLE_TO_ASSIGN = USER_ROLES.DEVELOPER;

const updateUserRole = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Get email from command line args
    const email = process.argv[2];

    if (!email) {
      console.error("❌ Please provide an email address as an argument.");
      console.log("Usage: node update-role.js <email>");
      process.exit(1);
    }

    // Find the user
    const user = await User.findOne({ email });

    if (!user) {
      console.error(`❌ User with email '${email}' not found.`);
      process.exit(1);
    }

    console.log(`Found user: ${user.username} (${user.email})`);
    console.log(`Current Role: ${user.role}`);

    // Update the role
    user.role = ROLE_TO_ASSIGN;
    await user.save();

    console.log(
      `✅ Successfully updated role to '${ROLE_TO_ASSIGN}' for user '${user.email}'`
    );
  } catch (error) {
    console.error("❌ Error updating user role:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
};

updateUserRole();
