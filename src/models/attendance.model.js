import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Student is required"],
      index: true,
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: [true, "Class is required"],
      index: true,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: [true, "Subject is required"],
      index: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Teacher is required"],
      index: true,
    },
    date: {
      type: Date,
      required: [true, "Date is required"],
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ["present", "absent", "late"],
        message: "{VALUE} is not a valid attendance status",
      },
      required: [true, "Attendance status is required"],
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: [500, "Remarks cannot exceed 500 characters"],
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Marked by user is required"],
    },
    markedByRole: {
      type: String,
      enum: ["admin", "teacher"],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure one attendance record per student per subject per date
attendanceSchema.index({ student: 1, subject: 1, date: 1 }, { unique: true });

// Index for efficient querying
attendanceSchema.index({ class: 1, date: 1 });
attendanceSchema.index({ student: 1, date: 1 });
attendanceSchema.index({ teacher: 1, date: 1 });

// Validate that student role is student
attendanceSchema.pre("save", async function (next) {
  if (this.isNew || this.isModified("student")) {
    const User = mongoose.model("User");
    const student = await User.findById(this.student);
    if (!student || student.role !== "student") {
      throw new Error("Invalid student reference");
    }
  }
  next();
});

// Validate that teacher role is teacher
attendanceSchema.pre("save", async function (next) {
  if (this.isNew || this.isModified("teacher")) {
    const User = mongoose.model("User");
    const teacher = await User.findById(this.teacher);
    if (!teacher || teacher.role !== "teacher") {
      throw new Error("Invalid teacher reference");
    }
  }
  next();
});

const Attendance = mongoose.model("Attendance", attendanceSchema);

export default Attendance;
