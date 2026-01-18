import mongoose from "mongoose";
import Subject from "../models/subject.model.js";
import Class from "../models/class.model.js";

const debugDelete = async () => {
  try {
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/ssms";
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB\n");

    // Get ALL subjects (including deleted)
    const allSubjects = await Subject.find({});

    let activeCount = 0;
    let deletedCount = 0;

    allSubjects.forEach((subject, index) => {
      const status = subject.isActive ? "🟢 ACTIVE" : "🔴 DELETED";
      if (subject.isActive) activeCount++;
      else deletedCount++;

     
    });

 

    // Check for subjects missing isActive field
    const noIsActiveField = await Subject.find({
      isActive: { $exists: false },
    });
    if (noIsActiveField.length > 0) {
      console.log(
        `\n⚠️  Subjects without isActive field: ${noIsActiveField.length}`
      );
    }

    // Get ALL classes (including deleted)
    const allClasses = await Class.find({});
    

    let activeClassCount = 0;
    let deletedClassCount = 0;

    allClasses.forEach((cls, index) => {
      const status = cls.isActive ? "🟢 ACTIVE" : "🔴 DELETED";
      if (cls.isActive) activeClassCount++;
      else deletedClassCount++;
    });

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Debug error:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

debugDelete();
