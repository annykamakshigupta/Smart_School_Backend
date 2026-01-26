import express from "express";
import {
  createFee,
  createBulkFees,
  getAllFees,
  getFeesByStudent,
  getMyFees,
  recordPayment,
  updateFee,
  deleteFee,
  getFeeStats,
} from "../controllers/fee.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

// Protect all routes
router.use(authenticate);

// Create a fee (Admin only)
router.post("/", authorize(["admin"]), createFee);

// Create bulk fees (Admin only)
router.post("/bulk", authorize(["admin"]), createBulkFees);

// Get all fees (Admin only)
router.get("/", authorize(["admin"]), getAllFees);

// Get fee statistics (Admin only)
router.get("/stats/summary", authorize(["admin"]), getFeeStats);

// Get my fees (Student only)
router.get("/my", authorize(["student"]), getMyFees);

// Get fees by student (Admin, Student-own, Parent-children)
router.get("/student/:studentId", getFeesByStudent);

// Record payment (Admin only)
router.post("/:id/pay", authorize(["admin"]), recordPayment);

// Update a fee (Admin only)
router.put("/:id", authorize(["admin"]), updateFee);

// Delete a fee (Admin only)
router.delete("/:id", authorize(["admin"]), deleteFee);

export default router;
