import mongoose from "mongoose";
import Subject from "../models/subject.model.js";

const fixSubjects = async () => {
  try {
    // Connect to MongoDB
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/ssms";
    await mongoose.connect(mongoUri);

    // Find all subjects missing the isActive field
    const subjectsWithoutIsActive = await Subject.find({
      isActive: { $exists: false },
    });

    if (subjectsWithoutIsActive.length > 0) {
      // Set isActive to true for all subjects that don't have it
      const result = await Subject.updateMany(
        { isActive: { $exists: false } },
        { $set: { isActive: true } },
      );

      // ...existing code...
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
        // ...existing code...
      }
    }

    // ...existing code...

    // Display final status
    const activeCount = await Subject.countDocuments({ isActive: true });
    const inactiveCount = await Subject.countDocuments({ isActive: false });

    // ...existing code...
    // ...existing code...
    // ...existing code...
    // ...existing code...
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
