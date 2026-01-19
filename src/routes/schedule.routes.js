import express from "express";
import * as scheduleController from "../controllers/schedule.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Admin only routes
router.post("/", authorize("admin"), scheduleController.createSchedule);

router.put("/:id", authorize("admin"), scheduleController.updateSchedule);

router.delete("/:id", authorize("admin"), scheduleController.deleteSchedule);

// Routes accessible to all authenticated users
router.get("/", scheduleController.getSchedules);

router.get("/:id", scheduleController.getScheduleById);

// Get weekly schedule for a class
router.get(
  "/class/:classId/section/:section",
  scheduleController.getWeeklyScheduleForClass,
);

// Get weekly schedule for a teacher
router.get(
  "/teacher/:teacherId",
  authorize(["admin", "teacher"]),
  scheduleController.getWeeklyScheduleForTeacher,
);

export default router;
