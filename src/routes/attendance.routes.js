import express from "express";
import {
  markAttendance,
  updateAttendance,
  getAttendanceByClassAndDate,
  getAttendanceByStudent,
  getAttendanceForChild,
  getStudentsForAttendance,
  getAttendanceSummary,
  deleteAttendance,
} from "../controllers/attendance.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

// Mark attendance (Admin, Teacher)
router.post(
  "/mark",
  authenticate,
  authorize(["admin", "teacher"]),
  markAttendance
);

// Update attendance (Admin, Teacher)
router.put(
  "/:id",
  authenticate,
  authorize(["admin", "teacher"]),
  updateAttendance
);

// Delete attendance (Admin only)
router.delete("/:id", authenticate, authorize(["admin"]), deleteAttendance);

// Get attendance by class and date (Admin, Teacher)
router.get(
  "/class",
  authenticate,
  authorize(["admin", "teacher"]),
  getAttendanceByClassAndDate
);

// Get students for attendance marking (Admin, Teacher)
router.get(
  "/students",
  authenticate,
  authorize(["admin", "teacher"]),
  getStudentsForAttendance
);

// Get attendance summary/statistics (Admin, Teacher)
router.get(
  "/summary",
  authenticate,
  authorize(["admin", "teacher"]),
  getAttendanceSummary
);

// Get attendance for student (Student - own only, Admin)
router.get(
  "/student",
  authenticate,
  authorize(["student", "admin"]),
  getAttendanceByStudent
);

// Get attendance for child (Parent)
router.get(
  "/child",
  authenticate,
  authorize(["parent"]),
  getAttendanceForChild
);

export default router;
