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
      required: false,
      default: null,
    },
    section: {
      type: String,
      required: false,
      trim: true,
      uppercase: true,
    },
    rollNumber: {
      type: String,
      required: false,
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
      required: false,
      trim: true,
      default: () => new Date().getFullYear().toString(),
    },
  },
  {
    timestamps: true,
  },
);

// Unique constraint: rollNumber unique per class per academic year (only when all exist)
studentSchema.index(
  { classId: 1, rollNumber: 1, academicYear: 1 },
  {
    unique: true,
    partialFilterExpression: {
      classId: { $exists: true, $ne: null },
      rollNumber: { $exists: true, $ne: null },
    },
  },
);

// Index for faster queries
studentSchema.index({ parentId: 1 });
studentSchema.index({ userId: 1 }, { unique: true });

const Student = mongoose.model("Student", studentSchema);

export default Student;
