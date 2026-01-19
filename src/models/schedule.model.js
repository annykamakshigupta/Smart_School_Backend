import mongoose from "mongoose";

const scheduleSchema = new mongoose.Schema(
  {
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: [true, "Class is required"],
      index: true,
    },
    section: {
      type: String,
      required: [true, "Section is required"],
      trim: true,
      uppercase: true,
      index: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: [true, "Subject is required"],
      index: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Teacher is required"],
      index: true,
    },
    room: {
      type: String,
      required: [true, "Room is required"],
      trim: true,
      index: true,
    },
    dayOfWeek: {
      type: String,
      required: [true, "Day of week is required"],
      enum: {
        values: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        message: "{VALUE} is not a valid day of week",
      },
      index: true,
    },
    startTime: {
      type: String,
      required: [true, "Start time is required"],
      validate: {
        validator: function (v) {
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: (props) => `${props.value} is not a valid time format (HH:MM)`,
      },
    },
    endTime: {
      type: String,
      required: [true, "End time is required"],
      validate: {
        validator: function (v) {
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: (props) => `${props.value} is not a valid time format (HH:MM)`,
      },
    },
    academicYear: {
      type: String,
      required: [true, "Academic year is required"],
      default: () => {
        const currentYear = new Date().getFullYear();
        return `${currentYear}-${currentYear + 1}`;
      },
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Compound indexes for efficient queries
scheduleSchema.index({ classId: 1, section: 1, dayOfWeek: 1, academicYear: 1 });
scheduleSchema.index({ teacherId: 1, dayOfWeek: 1, academicYear: 1 });
scheduleSchema.index({ room: 1, dayOfWeek: 1, academicYear: 1 });

// Validate that end time is after start time
scheduleSchema.pre("validate", function (req, res) {
  if (this.startTime && this.endTime) {
    const [startHour, startMin] = this.startTime.split(":").map(Number);
    const [endHour, endMin] = this.endTime.split(":").map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (endMinutes <= startMinutes) {
      this.invalidate("endTime", "End time must be after start time");
    }
  }
});

const Schedule = mongoose.model("Schedule", scheduleSchema);

export default Schedule;
