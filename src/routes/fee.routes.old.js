import express from "express";
import Fee from "../models/fee.model.js";
import Student from "../models/student.model.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

// Protect all routes
router.use(authenticate);

/**
 * Create a fee record
 * POST /api/fees
 * Access: Admin only
 */
router.post("/", authorize(["admin"]), async (req, res) => {
  try {
    const {
      studentId,
      feeType,
      description,
      amount,
      discount,
      fine,
      dueDate,
      academicYear,
      period,
      remarks,
    } = req.body;

    // Validate required fields
    if (!studentId || !feeType || !amount || !dueDate || !academicYear) {
      return res.status(400).json({
        success: false,
        message:
          "Required fields: studentId, feeType, amount, dueDate, academicYear",
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

    const fee = new Fee({
      studentId,
      feeType,
      description,
      amount,
      discount: discount || 0,
      fine: fine || 0,
      dueDate,
      academicYear,
      period,
      remarks,
    });

    await fee.save();

    res.status(201).json({
      success: true,
      message: "Fee record created successfully",
      data: fee,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating fee record",
      error: error.message,
    });
  }
});

/**
 * Bulk create fees (e.g., for all students in a class)
 * POST /api/fees/bulk
 * Access: Admin only
 */
router.post("/bulk", authorize(["admin"]), async (req, res) => {
  try {
    const {
      classId,
      feeType,
      amount,
      dueDate,
      academicYear,
      description,
      period,
    } = req.body;

    if (!classId || !feeType || !amount || !dueDate || !academicYear) {
      return res.status(400).json({
        success: false,
        message:
          "Required fields: classId, feeType, amount, dueDate, academicYear",
      });
    }

    // Get all active students in the class
    const students = await Student.find({
      classId,
      enrollmentStatus: "active",
    });

    const savedFees = [];
    const errors = [];

    for (const student of students) {
      try {
        // Check if fee already exists
        const existingFee = await Fee.findOne({
          studentId: student._id,
          feeType,
          academicYear,
          period: period || null,
        });

        if (existingFee) {
          errors.push({
            studentId: student._id,
            error: "Fee already exists",
          });
          continue;
        }

        const fee = new Fee({
          studentId: student._id,
          feeType,
          description,
          amount,
          dueDate,
          academicYear,
          period,
        });

        await fee.save();
        savedFees.push(fee);
      } catch (error) {
        errors.push({
          studentId: student._id,
          error: error.message,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: "Fees created",
      data: {
        saved: savedFees.length,
        errors: errors.length,
        totalStudents: students.length,
        failedRecords: errors,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating fees",
      error: error.message,
    });
  }
});

/**
 * Get all fees with filters
 * GET /api/fees
 * Access: Admin only
 */
router.get("/", authorize(["admin"]), async (req, res) => {
  try {
    const {
      studentId,
      classId,
      feeType,
      paymentStatus,
      academicYear,
      page = 1,
      limit = 50,
    } = req.query;

    const query = {};
    if (studentId) query.studentId = studentId;
    if (feeType) query.feeType = feeType;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (academicYear) query.academicYear = academicYear;

    // If classId is provided, get all students in that class first
    if (classId) {
      const students = await Student.find({ classId }).select("_id");
      query.studentId = { $in: students.map((s) => s._id) };
    }

    const skip = (page - 1) * limit;
    const total = await Fee.countDocuments(query);

    const fees = await Fee.find(query)
      .populate({
        path: "studentId",
        populate: [
          { path: "userId", select: "name email phone" },
          { path: "classId", select: "name section" },
        ],
      })
      .populate("collectedBy", "name")
      .sort({ dueDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Calculate summary
    const totalAmount = fees.reduce((sum, f) => sum + f.totalAmount, 0);
    const totalCollected = fees.reduce((sum, f) => sum + f.amountPaid, 0);
    const totalPending = fees.reduce((sum, f) => sum + f.balanceDue, 0);

    res.status(200).json({
      success: true,
      count: fees.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: fees,
      summary: {
        totalAmount,
        totalCollected,
        totalPending,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching fees",
      error: error.message,
    });
  }
});

/**
 * Get fees for a student
 * GET /api/fees/student/:studentId
 * Access: Admin, Student (own), Parent (children)
 */
router.get("/student/:studentId", async (req, res) => {
  try {
    const { studentId } = req.params;
    const { academicYear, paymentStatus } = req.query;
    const user = req.user;

    // Access control
    if (user.role === "student") {
      const studentRecord = await Student.findOne({ userId: user._id });
      if (!studentRecord || studentRecord._id.toString() !== studentId) {
        return res.status(403).json({
          success: false,
          message: "You can only view your own fees",
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
          message: "You can only view your children's fees",
        });
      }
    }

    const query = { studentId };
    if (academicYear) query.academicYear = academicYear;
    if (paymentStatus) query.paymentStatus = paymentStatus;

    const fees = await Fee.find(query)
      .populate({
        path: "studentId",
        populate: [
          { path: "userId", select: "name email" },
          { path: "classId", select: "name section" },
        ],
      })
      .sort({ dueDate: -1 });

    // Calculate summary
    const totalAmount = fees.reduce((sum, f) => sum + f.totalAmount, 0);
    const totalPaid = fees.reduce((sum, f) => sum + f.amountPaid, 0);
    const totalPending = fees.reduce((sum, f) => sum + f.balanceDue, 0);

    res.status(200).json({
      success: true,
      count: fees.length,
      data: fees,
      summary: {
        totalAmount,
        totalPaid,
        totalPending,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching fees",
      error: error.message,
    });
  }
});

/**
 * Get my fees (for logged-in student)
 * GET /api/fees/my
 * Access: Student only
 */
router.get("/my", authorize(["student"]), async (req, res) => {
  try {
    const user = req.user;
    const { academicYear, paymentStatus } = req.query;

    const studentRecord = await Student.findOne({ userId: user._id });
    if (!studentRecord) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const query = { studentId: studentRecord._id };
    if (academicYear) query.academicYear = academicYear;
    if (paymentStatus) query.paymentStatus = paymentStatus;

    const fees = await Fee.find(query).sort({ dueDate: -1 });

    // Calculate summary
    const totalAmount = fees.reduce((sum, f) => sum + f.totalAmount, 0);
    const totalPaid = fees.reduce((sum, f) => sum + f.amountPaid, 0);
    const totalPending = fees.reduce((sum, f) => sum + f.balanceDue, 0);

    res.status(200).json({
      success: true,
      count: fees.length,
      data: fees,
      summary: {
        totalAmount,
        totalPaid,
        totalPending,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching fees",
      error: error.message,
    });
  }
});

/**
 * Record fee payment
 * POST /api/fees/:id/pay
 * Access: Admin only
 */
router.post("/:id/pay", authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { amountPaid, paymentMethod, transactionRef, remarks } = req.body;
    const user = req.user;

    if (!amountPaid || amountPaid <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid payment amount is required",
      });
    }

    const fee = await Fee.findById(id);
    if (!fee) {
      return res.status(404).json({
        success: false,
        message: "Fee record not found",
      });
    }

    // Update payment details
    fee.amountPaid += amountPaid;
    fee.paidDate = new Date();
    fee.paymentMethod = paymentMethod || fee.paymentMethod;
    fee.transactionRef = transactionRef || fee.transactionRef;
    fee.collectedBy = user._id;
    if (remarks) fee.remarks = remarks;

    // Generate receipt number if fully paid
    if (fee.amountPaid >= fee.totalAmount && !fee.receiptNumber) {
      const year = new Date().getFullYear().toString().slice(-2);
      const count = await Fee.countDocuments({ receiptNumber: { $ne: null } });
      fee.receiptNumber = `RCP${year}${(count + 1).toString().padStart(6, "0")}`;
    }

    await fee.save();

    res.status(200).json({
      success: true,
      message: "Payment recorded successfully",
      data: fee,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error recording payment",
      error: error.message,
    });
  }
});

/**
 * Update fee record
 * PUT /api/fees/:id
 * Access: Admin only
 */
router.put("/:id", authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, discount, fine, dueDate, remarks, description } = req.body;

    const fee = await Fee.findById(id);
    if (!fee) {
      return res.status(404).json({
        success: false,
        message: "Fee record not found",
      });
    }

    if (amount !== undefined) fee.amount = amount;
    if (discount !== undefined) fee.discount = discount;
    if (fine !== undefined) fee.fine = fine;
    if (dueDate) fee.dueDate = dueDate;
    if (remarks !== undefined) fee.remarks = remarks;
    if (description !== undefined) fee.description = description;

    await fee.save();

    res.status(200).json({
      success: true,
      message: "Fee record updated successfully",
      data: fee,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating fee record",
      error: error.message,
    });
  }
});

/**
 * Delete fee record
 * DELETE /api/fees/:id
 * Access: Admin only
 */
router.delete("/:id", authorize(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;

    const fee = await Fee.findByIdAndDelete(id);
    if (!fee) {
      return res.status(404).json({
        success: false,
        message: "Fee record not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Fee record deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting fee record",
      error: error.message,
    });
  }
});

/**
 * Get fee statistics
 * GET /api/fees/stats
 * Access: Admin only
 */
router.get("/stats/summary", authorize(["admin"]), async (req, res) => {
  try {
    const { academicYear, classId } = req.query;

    const matchQuery = {};
    if (academicYear) matchQuery.academicYear = academicYear;

    if (classId) {
      const students = await Student.find({ classId }).select("_id");
      matchQuery.studentId = { $in: students.map((s) => s._id) };
    }

    const [stats] = await Fee.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$totalAmount" },
          totalCollected: { $sum: "$amountPaid" },
          totalPending: { $sum: "$balanceDue" },
          paidCount: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] },
          },
          unpaidCount: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "unpaid"] }, 1, 0] },
          },
          partialCount: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "partial"] }, 1, 0] },
          },
          overdueCount: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "overdue"] }, 1, 0] },
          },
          totalRecords: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: stats || {
        totalAmount: 0,
        totalCollected: 0,
        totalPending: 0,
        paidCount: 0,
        unpaidCount: 0,
        partialCount: 0,
        overdueCount: 0,
        totalRecords: 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching fee statistics",
      error: error.message,
    });
  }
});

export default router;
