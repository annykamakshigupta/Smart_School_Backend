import mongoose from "mongoose";

const classSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Class name is required"],
      trim: true,
    },
    section: {
      type: String,
      required: [true, "Section is required"],
      trim: true,
      uppercase: true,
    },
    academicYear: {
      type: String,
      required: [true, "Academic year is required"],
      trim: true,
    },
    classTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    subjects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subject",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique constraint for name + section + academicYear
classSchema.index({ name: 1, section: 1, academicYear: 1 }, { unique: true });

// Virtual for full class name
classSchema.virtual("fullName").get(function () {
  return `${this.name} - ${this.section}`;
});

// Ensure virtuals are included in JSON
classSchema.set("toJSON", { virtuals: true });
classSchema.set("toObject", { virtuals: true });

const Class = mongoose.model("Class", classSchema);

export default Class;
