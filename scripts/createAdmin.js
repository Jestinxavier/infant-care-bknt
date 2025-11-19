require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const User = require("../src/models/user");
const { sendAdminCredentialsEmail } = require("../src/services/emailService");

/**
 * Generate a secure random password
 * @param {number} length - Password length (default: 12)
 * @returns {string} - Secure random password
 */
const generateSecurePassword = (length = 12) => {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const symbols = "!@#$%^&*";
  const allChars = uppercase + lowercase + numbers + symbols;

  // Ensure at least one character from each category
  let password = "";
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
};

/**
 * Create admin user
 */
const createAdmin = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI or MONGO_URI not found in environment variables");
    }

    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Admin details
    const adminEmail = "xavierjestin@gmail.com";
    const adminUsername = "admin";
    const adminPassword = generateSecurePassword(16); // Generate 16-character secure password

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log("⚠️  Admin user already exists!");
      console.log(`📧 Email: ${adminEmail}`);
      console.log(`👤 Username: ${existingAdmin.username}`);
      console.log(`🔑 Role: ${existingAdmin.role}`);
      console.log(`✅ Email Verified: ${existingAdmin.isEmailVerified}`);
      
      // Ask if user wants to reset password
      console.log("\n💡 To reset the password, delete the user first or update manually.");
      await mongoose.disconnect();
      return;
    }

    // Create admin user
    console.log("\n👤 Creating admin user...");
    const adminUser = new User({
      username: adminUsername,
      email: adminEmail,
      password: adminPassword, // Will be hashed by pre-save hook
      role: "admin",
      isEmailVerified: true, // Admin email is pre-verified
    });

    await adminUser.save();
    console.log("✅ Admin user created successfully!");

    // Send credentials email
    console.log("\n📧 Sending credentials email...");
    try {
      await sendAdminCredentialsEmail(
        {
          email: adminEmail,
          username: adminUsername,
        },
        adminPassword
      );
      console.log("✅ Credentials email sent successfully!");
    } catch (emailError) {
      console.error("❌ Failed to send email:", emailError.message);
      console.log("\n⚠️  IMPORTANT: Save these credentials manually:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`📧 Email: ${adminEmail}`);
      console.log(`🔑 Password: ${adminPassword}`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    }

    // Display credentials in console as backup
    console.log("\n📋 Admin Credentials:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`📧 Email: ${adminEmail}`);
    console.log(`👤 Username: ${adminUsername}`);
    console.log(`🔑 Password: ${adminPassword}`);
    console.log(`🔐 Role: admin`);
    console.log(`✅ Email Verified: true`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n⚠️  SECURITY NOTE:");
    console.log("   - Password has been sent to the admin email");
    console.log("   - Please change the password after first login");
    console.log("   - Keep these credentials secure");

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log("\n✅ Script completed successfully!");
  } catch (error) {
    console.error("\n❌ Error creating admin:", error.message);
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

// Run the script
if (require.main === module) {
  createAdmin();
}

module.exports = { createAdmin };

