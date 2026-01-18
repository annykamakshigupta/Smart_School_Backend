import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      // unique: true, // Removed to avoid duplicate index warning
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },
    section: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    rollNumber: {
      type: String,
      required: true,
      trim: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    admissionDate: {
      type: Date,
      default: Date.now,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique constraint: rollNumber unique per class per academic year
studentSchema.index(
  { classId: 1, rollNumber: 1, academicYear: 1 },
  { unique: true }
);

// Index for faster queries
studentSchema.index({ parentId: 1 });
studentSchema.index({ userId: 1 }, { unique: true });

const Student = mongoose.model("Student", studentSchema);

export default Student;
