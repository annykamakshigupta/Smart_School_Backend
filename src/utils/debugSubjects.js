import mongoose from "mongoose";
import Subject from "../models/subject.model.js";

const debugSubjects = async () => {
  try {
    // Connect to MongoDB
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/ssms";
    await mongoose.connect(mongoUri);
    // ...existing code...

    // Get ALL subjects without any filters
    const allSubjects = await Subject.find({});

    allSubjects.forEach((subject, index) => {});

    // Check for active subjects only
    const activeSubjects = await Subject.find({ isActive: true });

    // Check for inactive subjects
    const inactiveSubjects = await Subject.find({ isActive: false });

    // Check for subjects without isActive field
    const noIsActiveField = await Subject.find({
      isActive: { $exists: false },
    });
    // ...existing code...

    // Check for duplicate codes
    const codes = allSubjects.map((s) => s.code);
    const duplicates = codes.filter(
      (code, index) => codes.indexOf(code) !== index,
    );
    if (duplicates.length > 0) {
      // ...existing code...
    } else {
      // ...existing code...
    }

    // ...existing code...
    // ...existing code...

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Debug error:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

debugSubjects();
