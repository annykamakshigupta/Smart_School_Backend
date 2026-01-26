import mongoose from "mongoose";

/**
 * Result Model (Marks)
 * Purpose: Stores academic performance.
 */
const resultSchema = new mongoose.Schema(
  {
    // Student ID - Student reference
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: [true, "Student is required"],
      index: true,
    },
    // Subject ID - Subject reference
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: [true, "Subject is required"],
      index: true,
    },
    // Class ID - Class reference
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: [true, "Class is required"],
      index: true,
    },
    // Exam Type - Midterm / Final / Unit Test / Assignment
    examType: {
      type: String,
      enum: {
        values: [
          "unit-test-1",
          "unit-test-2",
          "midterm",
          "final",
          "assignment",
          "practical",
        ],
        message: "{VALUE} is not a valid exam type",
      },
      required: [true, "Exam type is required"],
    },
    // Exam Name - Custom exam name
    examName: {
      type: String,
      trim: true,
      default: null,
    },
    // Marks Obtained - Numeric marks
    marksObtained: {
      type: Number,
      required: [true, "Marks obtained is required"],
      min: [0, "Marks cannot be negative"],
    },
    // Maximum Marks - Total marks
    maxMarks: {
      type: Number,
      required: [true, "Maximum marks is required"],
      min: [1, "Maximum marks must be at least 1"],
    },
    // Grade - Grade representation (A+, A, B+, B, C+, C, D, F)
    grade: {
      type: String,
      enum: ["A+", "A", "B+", "B", "C+", "C", "D", "F", null],
      default: null,
    },
    // Percentage
    percentage: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    // Academic Year
    academicYear: {
      type: String,
      required: [true, "Academic year is required"],
      trim: true,
    },
    // Remarks
    remarks: {
      type: String,
      trim: true,
      default: null,
    },
    // Published - Result status
    isPublished: {
      type: Boolean,
      default: false,
    },
    // Published Date
    publishedAt: {
      type: Date,
      default: null,
    },
    // Entered By - Teacher who entered the result
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      default: null,
    },
  },
  {
    timestamps: true, // Adds createdAt
  },
);

// Pre-save middleware to calculate percentage and grade
resultSchema.pre("save", function (next) {
  // Calculate percentage
  if (this.marksObtained !== undefined && this.maxMarks) {
    this.percentage = (this.marksObtained / this.maxMarks) * 100;

    // Auto-assign grade based on percentage
    if (this.percentage >= 90) this.grade = "A+";
    else if (this.percentage >= 80) this.grade = "A";
    else if (this.percentage >= 70) this.grade = "B+";
    else if (this.percentage >= 60) this.grade = "B";
    else if (this.percentage >= 50) this.grade = "C+";
    else if (this.percentage >= 40) this.grade = "C";
    else if (this.percentage >= 33) this.grade = "D";
    else this.grade = "F";
  }
  next();
});

// Compound index for unique result per student per subject per exam
resultSchema.index(
  { studentId: 1, subjectId: 1, examType: 1, academicYear: 1 },
  { unique: true },
);

// Index for efficient querying
resultSchema.index({ classId: 1, examType: 1, academicYear: 1 });
resultSchema.index({ studentId: 1, academicYear: 1 });
resultSchema.index({ isPublished: 1 });

const Result = mongoose.model("Result", resultSchema);

export default Result;
