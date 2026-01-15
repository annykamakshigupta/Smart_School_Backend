import mongoose from "mongoose";
import Subject from "../models/subject.model.js";

const fixSubjects = async () => {
  try {
    // Connect to MongoDB
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/ssms";
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Find all subjects missing the isActive field
    const subjectsWithoutIsActive = await Subject.find({
      isActive: { $exists: false },
    });

    console.log(
      `\n📊 Found ${subjectsWithoutIsActive.length} subjects without isActive field`
    );

    if (subjectsWithoutIsActive.length > 0) {
      // Set isActive to true for all subjects that don't have it
      const result = await Subject.updateMany(
        { isActive: { $exists: false } },
        { $set: { isActive: true } }
      );

      console.log(`✅ Updated ${result.modifiedCount} subjects`);
    }

    // Normalize all subject codes to uppercase
    const allSubjects = await Subject.find({});
    let normalizedCount = 0;

    for (const subject of allSubjects) {
      const normalizedCode = subject.code.trim().toUpperCase();
      if (subject.code !== normalizedCode) {
        subject.code = normalizedCode;
        await subject.save();
        normalizedCount++;
        console.log(`📝 Normalized: "${subject.code}" -> "${normalizedCode}"`);
      }
    }

    console.log(`\n✅ Normalized ${normalizedCount} subject codes`);

    // Display final status
    const activeCount = await Subject.countDocuments({ isActive: true });
    const inactiveCount = await Subject.countDocuments({ isActive: false });

    console.log("\n" + "=".repeat(60));
    console.log("📊 FINAL STATUS:");
    console.log(`   Active subjects: ${activeCount}`);
    console.log(`   Inactive subjects: ${inactiveCount}`);
    console.log(`   Total: ${activeCount + inactiveCount}`);
    console.log("=".repeat(60));

    await mongoose.connection.close();
    console.log("\n✅ Fix complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Fix error:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

fixSubjects();
