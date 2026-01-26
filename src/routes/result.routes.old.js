import express from "express";
import Result from "../models/result.model.js";
import Student from "../models/student.model.js";
import Teacher from "../models/teacher.model.js";
import Subject from "../models/subject.model.js";
import Class from "../models/class.model.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

// Protect all routes
router.use(authenticate);

/**
 * Create a result/marks entry
 * POST /api/results
 * Access: Admin, Teacher
 */
router.post("/", authorize(["admin", "teacher"]), async (req, res) => {
  try {
    const {
      studentId,
      subjectId,
      classId,
      examType,
      examName,
      marksObtained,
      maxMarks,
      academicYear,
      remarks,
    } = req.body;
    const user = req.user;

    // Validate required fields
    if (
      !studentId ||
      !subjectId ||
      !classId ||
      !examType ||
      marksObtained === undefined ||
      !maxMarks ||
      !academicYear
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Required fields: studentId, subjectId, classId, examType, marksObtained, maxMarks, academicYear",
      });
    }

    // Verify student exists
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Get teacher record if user is teacher
    let teacherRecord = null;
    if (user.role === "teacher") {
      teacherRecord = await Teacher.findOne({ userId: user._id });
      if (!teacherRecord) {
        return res.status(403).json({
          success: false,
          message: "Teacher profile not found",
        });
      }

      // Verify teacher is assigned to this subject
      const subject = await Subject.findById(subjectId);
      if (
        !subject ||
        subject.assignedTeacher?.toString() !== teacherRecord._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to this subject",
        });
      }
    }

    // Check for existing result
    const existingResult = await Result.findOne({
      studentId,
      subjectId,
      examType,
      academicYear,
    });

    if (existingResult) {
      return res.status(409).json({
        success: false,
        message:
          "Result already exists for this student, subject, and exam type",
      });
    }

    const result = new Result({
      studentId,
      subjectId,
      classId,
      examType,
      examName,
      marksObtained,
      maxMarks,
      academicYear,
      remarks,
      enteredBy: teacherRecord?._id || null,
    });

    await result.save();

    res.status(201).json({
      success: true,
      message: "Result created successfully",
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating result",
      error: error.message,
    });
  }
});

/**
 * Bulk create results
 * POST /api/results/bulk
 * Access: Admin, Teacher
 */
router.post("/bulk", authorize(["admin", "teacher"]), async (req, res) => {
  try {
    const { results } = req.body;
    const user = req.user;

    if (!results || !Array.isArray(results) || results.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Results array is required",
      });
    }

    let teacherRecord = null;
    if (user.role === "teacher") {
      teacherRecord = await Teacher.findOne({ userId: user._id });
    }

    const savedResults = [];
    const errors = [];

    for (const resultData of results) {
      try {
        const result = new Result({
          ...resultData,
          enteredBy: teacherRecord?._id || null,
        });
        await result.save();
        savedResults.push(result);
      } catch (error) {
        errors.push({
          data: resultData,
          error: error.message,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: "Results processed",
      data: {
        saved: savedResults.length,
        errors: errors.length,
        savedResults,
        failedResults: errors,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating results",
      error: error.message,
    });
  }
});

/**
 * Get results by class and exam type
 * GET /api/results/class/:classId
 * Access: Admin, Teacher
 */
router.get(
  "/class/:classId",
  authorize(["admin", "teacher"]),
  async (req, res) => {
    try {
      const { classId } = req.params;
      const { examType, subjectId, academicYear, isPublished } = req.query;

      const query = { classId };
      if (examType) query.examType = examType;
      if (subjectId) query.subjectId = subjectId;
      if (academicYear) query.academicYear = academicYear;
      if (isPublished !== undefined) query.isPublished = isPublished === "true";

      const results = await Result.find(query)
        .populate({
          path: "studentId",
          populate: { path: "userId", select: "name email" },
        })
        .populate("subjectId", "name code")
        .populate("classId", "name section")
        .populate({
          path: "enteredBy",
          populate: { path: "userId", select: "name" },
        })
        .sort({ "studentId.rollNumber": 1 });

      res.status(200).json({
        success: true,
        count: results.length,
        data: results,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching results",
        error: error.message,
      });
    }
  },
);

/**
 * Get results for a student
 * GET /api/results/student/:studentId
 * Access: Admin, Teacher, Student (own), Parent (children)
 */
router.get("/student/:studentId", async (req, res) => {
  try {
    const { studentId } = req.params;
    const { examType, academicYear } = req.query;
    const user = req.user;

    // Access control
    if (user.role === "student") {
      const studentRecord = await Student.findOne({ userId: user._id });
      if (!studentRecord || studentRecord._id.toString() !== studentId) {
        return res.status(403).json({
          success: false,
          message: "You can only view your own results",
        });
      }
    } else if (user.role === "parent") {
      const Parent = (await import("../models/parent.model.js")).default;
      const parentRecord = await Parent.findOne({ userId: user._id });
      if (
        !parentRecord ||
        !parentRecord.children.some((id) => id.toString() === studentId)
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only view your children's results",
        });
      }
    }

    const query = { studentId, isPublished: true };
    if (examType) query.examType = examType;
    if (academicYear) query.academicYear = academicYear;

    // Admin and teacher can see unpublished results
    if (user.role === "admin" || user.role === "teacher") {
      delete query.isPublished;
    }

    const results = await Result.find(query)
      .populate("subjectId", "name code")
      .populate("classId", "name section")
      .sort({ examType: 1, subjectId: 1 });

    // Calculate aggregate statistics
    const totalMarks = results.reduce((sum, r) => sum + r.marksObtained, 0);
    const maxTotalMarks = results.reduce((sum, r) => sum + r.maxMarks, 0);
    const overallPercentage =
      maxTotalMarks > 0 ? ((totalMarks / maxTotalMarks) * 100).toFixed(2) : 0;

    res.status(200).json({
      success: true,
      count: results.length,
      data: results,
      summary: {
        totalMarks,
        maxTotalMarks,
        overallPercentage: parseFloat(overallPercentage),
        subjectCount: results.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching results",
      error: error.message,
    });
  }
});

/**
 * Get my results (for logged-in student)
 * GET /api/results/my
 * Access: Student only
 */
router.get("/my", authorize(["student"]), async (req, res) => {
  try {
    const user = req.user;
    const { examType, academicYear } = req.query;

    const studentRecord = await Student.findOne({ userId: user._id });
    if (!studentRecord) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const query = { studentId: studentRecord._id, isPublished: true };
    if (examType) query.examType = examType;
    if (academicYear) query.academicYear = academicYear;

    const results = await Result.find(query)
      .populate("subjectId", "name code")
      .populate("classId", "name section")
      .sort({ examType: 1, subjectId: 1 });

    // Calculate aggregate statistics
    const totalMarks = results.reduce((sum, r) => sum + r.marksObtained, 0);
    const maxTotalMarks = results.reduce((sum, r) => sum + r.maxMarks, 0);
    const overallPercentage =
      maxTotalMarks > 0 ? ((totalMarks / maxTotalMarks) * 100).toFixed(2) : 0;

    res.status(200).json({
      success: true,
      count: results.length,
      data: results,
      summary: {
        totalMarks,
        maxTotalMarks,
        overallPercentage: parseFloat(overallPercentage),
        subjectCount: results.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching results",
      error: error.message,
    });
  }
});

/**
 * Update a result
 * PUT /api/results/:id
 * Access: Admin, Teacher
 */
router.put("/:id", authorize(["admin", "teacher"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { marksObtained, remarks, isPublished } = req.body;

    const result = await Result.findById(id);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Result not found",
      });
    }

    if (marksObtained !== undefined) result.marksObtained = marksObtained;
    if (remarks !== undefined) result.remarks = remarks;
    if (isPublished !== undefined) {
      result.isPublished = isPublished;
      if (isPublished) result.publishedAt = new Date();
    }

    await result.save();

    res.status(200).json({
      success: true,
      message: "Result updated successfully",
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating result",
      error: error.message,
    });
  }
});

/**
 * Publish results for a class/exam
 * POST /api/results/publish
 * Access: Admin only
 */
router.post("/publish", authorize(["admin"]), async (req, res) => {
  try {
    const { classId, examType, academicYear } = req.body;

    if (!classId || !examType || !academicYear) {
      return res.status(400).json({
        success: false,
        message: "classId, examType, and academicYear are required",
      });
    }

    const updateResult = await Result.updateMany(
      { classId, examType, academicYear, isPublished: false },
      { $set: { isPublished: true, publishedAt: new Date() } },
    );

    res.status(200).json({
      success: true,
      message: "Results published successfully",
      data: {
        modifiedCount: updateResult.modifiedCount,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error publishing results",
      error: error.message,
    });
  }
});

/**
 * Delete a result
 * DELETE /api/results/:id
 * Access: Admin only
 */
router.delete("/:id", authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await Result.findByIdAndDelete(id);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Result not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Result deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting result",
      error: error.message,
    });
  }
});

export default router;
