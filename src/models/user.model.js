import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["student", "parent", "teacher", "admin"],
      required: true,
    },
    phone: { type: String, required: true },
    status: {
      type: String,
      enum: ["active", "suspended", "inactive"],
      default: "active",
    },
    // For teachers - assigned classes and subjects
    assignedClasses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Class",
      },
    ],
    assignedSubjects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subject",
      },
    ],
  },
  { timestamps: true }
);

// Index for faster queries
userSchema.index({ role: 1, status: 1 });

const User = mongoose.model("User", userSchema);
export default User;
