import express from "express";
import {
  login,
  signup,
  getUsersByRole,
  getCurrentUser,
} from "../controllers/user.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();
router.post("/login", login);
router.post("/signup", signup);
router.post("/logout", authenticate, (req, res) => {
  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

// Get current authenticated user
router.get("/me", authenticate, getCurrentUser);

// Get users by role (e.g., teachers for dropdown)
router.get("/", authenticate, getUsersByRole);

export default router;
