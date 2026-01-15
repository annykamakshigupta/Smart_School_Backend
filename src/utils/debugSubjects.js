import mongoose from "mongoose";
import Subject from "../models/subject.model.js";

const debugSubjects = async () => {
  try {
    // Connect to MongoDB
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/ssms";
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Get ALL subjects without any filters
    const allSubjects = await Subject.find({});
    console.log("\n📊 TOTAL SUBJECTS IN DATABASE:", allSubjects.length);
    console.log("=".repeat(80));

    allSubjects.forEach((subject, index) => {
      console.log(`\n📌 Subject ${index + 1}:`);
      console.log(`   ID: ${subject._id}`);
      console.log(`   Name: ${subject.name}`);
      console.log(`   Code: "${subject.code}"`);
      console.log(`   Academic Year: ${subject.academicYear}`);
      console.log(`   isActive: ${subject.isActive}`);
      console.log(`   Class ID: ${subject.classId || "Not assigned"}`);
      console.log(
        `   Teacher ID: ${subject.assignedTeacher || "Not assigned"}`
      );
      console.log(`   Created: ${subject.createdAt}`);
      console.log(`   Updated: ${subject.updatedAt}`);
    });

    // Check for active subjects only
    const activeSubjects = await Subject.find({ isActive: true });
    console.log("\n\n🟢 ACTIVE SUBJECTS:", activeSubjects.length);

    // Check for inactive subjects
    const inactiveSubjects = await Subject.find({ isActive: false });
    console.log("🔴 INACTIVE SUBJECTS:", inactiveSubjects.length);

    // Check for subjects without isActive field
    const noIsActiveField = await Subject.find({
      isActive: { $exists: false },
    });
    console.log("⚠️  SUBJECTS WITHOUT isActive FIELD:", noIsActiveField.length);

    // Check for duplicate codes
    const codes = allSubjects.map((s) => s.code);
    const duplicates = codes.filter(
      (code, index) => codes.indexOf(code) !== index
    );
    if (duplicates.length > 0) {
      console.log("\n⚠️  DUPLICATE SUBJECT CODES FOUND:", duplicates);
    } else {
      console.log("\n✅ No duplicate subject codes");
    }

    console.log("\n" + "=".repeat(80));
    console.log("✅ Debug complete");

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Debug error:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

debugSubjects();
