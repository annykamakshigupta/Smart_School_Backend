import express from "express";
import adminController from "../controllers/admin.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

// All admin routes require authentication + admin role
router.use(authenticate);
router.use(authorize(["admin"]));

// ============ USER MANAGEMENT ============
router.get("/users", adminController.getAllUsers);
router.post("/users", adminController.createUser);
router.get("/users/role/:role", adminController.getUsersByRole);
router.get("/users/:id", adminController.getUserById);
router.put("/users/:id", adminController.updateUser);
router.patch("/users/:id/status", adminController.deactivateUser);
router.post("/users/:id/reset-password", adminController.resetUserPassword);
router.delete("/users/:id", adminController.deleteUser);

// ============ STUDENT MANAGEMENT ============
router.get("/students", adminController.getAllStudents);
router.post("/students", adminController.createStudentWithClassAssignment);
router.get("/students/class/:classId", adminController.getStudentsByClass);
router.get("/students/user/:userId", adminController.getStudentProfileByUserId);
router.put("/students/:id", adminController.updateStudent);
router.post("/students/assign-parent", adminController.assignParentToStudent);
router.post("/students/change-class", adminController.changeStudentClass);

// ============ PARENT MANAGEMENT ============
router.get("/parents", adminController.getAllParents);
router.get(
  "/parents/:parentId/children",
  adminController.getChildrenByParentId
);
router.post("/parents/link-child", adminController.linkChildToParent);
router.post("/parents/unlink-child", adminController.unlinkChildFromParent);

// ============ CLASS & SUBJECT ASSIGNMENTS ============
router.post("/classes/assign-teacher", adminController.assignClassTeacher);
router.post("/subjects/assign-teacher", adminController.assignTeacherToSubject);
router.get(
  "/teachers/:teacherId/assignments",
  adminController.getTeacherAssignments
);

// ============ DASHBOARD ============
router.get("/dashboard/stats", adminController.getDashboardStats);

export default router;
