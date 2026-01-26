import Fee from "../models/fee.model.js";
import Student from "../models/student.model.js";
import Parent from "../models/parent.model.js";

/**
 * Create a new fee entry
 * @route POST /api/fees
 * @access Admin
 */
export const createFee = async (req, res) => {
  try {
    const {
      studentId,
      feeType,
      amount,
      discount,
      fine,
      dueDate,
      academicYear,
      period,
      description,
    } = req.body;

    // Validate student
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Check for duplicate fee
    const existingFee = await Fee.findOne({
      studentId,
      feeType,
      academicYear: academicYear || student.academicYear,
      period,
    });

    if (existingFee) {
      return res.status(409).json({
        success: false,
        message: "Fee entry already exists for this student and period",
      });
    }

    const fee = await Fee.create({
      studentId,
      feeType,
      amount,
      discount: discount || 0,
      fine: fine || 0,
      dueDate,
      academicYear: academicYear || student.academicYear,
      period,
      description,
    });

    const populatedFee = await Fee.findById(fee._id).populate({
      path: "studentId",
      select: "admissionNumber rollNumber section",
      populate: {
        path: "userId",
        select: "name email",
      },
    });

    res.status(201).json({
      success: true,
      message: "Fee created successfully",
      data: populatedFee,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create fee",
    });
  }
};

/**
 * Create bulk fee entries
 * @route POST /api/fees/bulk
 * @access Admin
 */
export const createBulkFees = async (req, res) => {
  try {
    const {
      studentIds,
      feeType,
      amount,
      discount,
      dueDate,
      academicYear,
      period,
      description,
    } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Student IDs array is required",
      });
    }

    const createdFees = [];
    const errors = [];

    for (const studentId of studentIds) {
      try {
        // Check for duplicate
        const existing = await Fee.findOne({
          studentId,
          feeType,
          academicYear,
          period,
        });

        if (existing) {
          errors.push({
            studentId,
            message: "Fee entry already exists",
          });
          continue;
        }

        const newFee = await Fee.create({
          studentId,
          feeType,
          amount,
          discount: discount || 0,
          dueDate,
          academicYear,
          period,
          description,
        });

        createdFees.push(newFee);
      } catch (err) {
        errors.push({
          studentId,
          message: err.message,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `Created ${createdFees.length} fee entries`,
      data: {
        created: createdFees.length,
        errors: errors.length,
        errorDetails: errors,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create bulk fees",
    });
  }
};

/**
 * Get all fees with filters
 * @route GET /api/fees
 * @access Admin
 */
export const getAllFees = async (req, res) => {
  try {
    const { feeType, paymentStatus, academicYear, period, classId } = req.query;

    const query = {};
    if (feeType) query.feeType = feeType;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (academicYear) query.academicYear = academicYear;
    if (period) query.period = period;

    let fees = await Fee.find(query)
      .populate({
        path: "studentId",
        select: "admissionNumber rollNumber section classId",
        populate: [
          { path: "userId", select: "name email phone" },
          { path: "classId", select: "name section" },
        ],
      })
      .populate({
        path: "collectedBy",
        select: "employeeCode",
        populate: {
          path: "userId",
          select: "name",
        },
      })
      .sort({ createdAt: -1 });

    // Filter by class if provided
    if (classId) {
      fees = fees.filter(
        (fee) => fee.studentId?.classId?._id?.toString() === classId,
      );
    }

    res.status(200).json({
      success: true,
      count: fees.length,
      data: fees,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch fees",
    });
  }
};

/**
 * Get fees by student
 * @route GET /api/fees/student/:studentId
 * @access Admin, Student (own), Parent (children)
 */
export const getFeesByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { feeType, paymentStatus, academicYear } = req.query;

    // Authorization check
    if (req.user.role === "student") {
      if (!req.user.profileId || req.user.profileId.toString() !== studentId) {
        return res.status(403).json({
          success: false,
          message: "You can only view your own fees",
        });
      }
    } else if (req.user.role === "parent") {
      const parent = await Parent.findById(req.user.profileId);
      if (!parent || !parent.children.some((c) => c.toString() === studentId)) {
        return res.status(403).json({
          success: false,
          message: "You can only view your children's fees",
        });
      }
    }

    const query = { studentId };
    if (feeType) query.feeType = feeType;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (academicYear) query.academicYear = academicYear;

    const fees = await Fee.find(query)
      .populate({
        path: "studentId",
        select: "admissionNumber rollNumber section",
        populate: {
          path: "userId",
          select: "name email",
        },
      })
      .sort({ dueDate: -1 });

    // Calculate summary
    const summary = {
      totalAmount: fees.reduce((sum, f) => sum + f.totalAmount, 0),
      totalPaid: fees.reduce((sum, f) => sum + f.amountPaid, 0),
      totalBalance: fees.reduce((sum, f) => sum + f.balanceDue, 0),
      pendingCount: fees.filter((f) => f.paymentStatus === "pending").length,
      overdueCount: fees.filter((f) => f.paymentStatus === "overdue").length,
    };

    res.status(200).json({
      success: true,
      count: fees.length,
      summary,
      data: fees,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch fees",
    });
  }
};

/**
 * Get my fees (for logged-in student)
 * @route GET /api/fees/my
 * @access Student
 */
export const getMyFees = async (req, res) => {
  try {
    if (!req.user.profileId) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const { feeType, paymentStatus, academicYear } = req.query;

    const query = { studentId: req.user.profileId };
    if (feeType) query.feeType = feeType;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (academicYear) query.academicYear = academicYear;

    const fees = await Fee.find(query).sort({ dueDate: -1 });

    // Calculate summary
    const summary = {
      totalAmount: fees.reduce((sum, f) => sum + f.totalAmount, 0),
      totalPaid: fees.reduce((sum, f) => sum + f.amountPaid, 0),
      totalBalance: fees.reduce((sum, f) => sum + f.balanceDue, 0),
      pendingCount: fees.filter((f) => f.paymentStatus === "pending").length,
      overdueCount: fees.filter((f) => f.paymentStatus === "overdue").length,
    };

    res.status(200).json({
      success: true,
      count: fees.length,
      summary,
      data: fees,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch fees",
    });
  }
};

/**
 * Record payment for a fee
 * @route POST /api/fees/:id/pay
 * @access Admin
 */
export const recordPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amountPaid, paymentMethod, transactionRef } = req.body;

    const fee = await Fee.findById(id);
    if (!fee) {
      return res.status(404).json({
        success: false,
        message: "Fee not found",
      });
    }

    if (amountPaid <= 0) {
      return res.status(400).json({
        success: false,
        message: "Payment amount must be greater than 0",
      });
    }

    if (amountPaid > fee.balanceDue) {
      return res.status(400).json({
        success: false,
        message: `Payment amount cannot exceed balance due (${fee.balanceDue})`,
      });
    }

    // Update fee with payment
    fee.amountPaid += amountPaid;
    fee.balanceDue = fee.totalAmount - fee.amountPaid;
    fee.paymentMethod = paymentMethod || "cash";
    fee.transactionRef = transactionRef;
    fee.paidDate = new Date();

    // Update payment status
    if (fee.balanceDue <= 0) {
      fee.paymentStatus = "paid";
      fee.receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    } else {
      fee.paymentStatus = "partial";
    }

    await fee.save();

    const populatedFee = await Fee.findById(id).populate({
      path: "studentId",
      select: "admissionNumber rollNumber section",
      populate: {
        path: "userId",
        select: "name email",
      },
    });

    res.status(200).json({
      success: true,
      message: "Payment recorded successfully",
      data: populatedFee,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to record payment",
    });
  }
};

/**
 * Update a fee
 * @route PUT /api/fees/:id
 * @access Admin
 */
export const updateFee = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, discount, fine, dueDate, description } = req.body;

    const fee = await Fee.findById(id);
    if (!fee) {
      return res.status(404).json({
        success: false,
        message: "Fee not found",
      });
    }

    // Only allow updates if not fully paid
    if (fee.paymentStatus === "paid") {
      return res.status(400).json({
        success: false,
        message: "Cannot update a fully paid fee",
      });
    }

    // Update fields
    if (amount !== undefined) fee.amount = amount;
    if (discount !== undefined) fee.discount = discount;
    if (fine !== undefined) fee.fine = fine;
    if (dueDate !== undefined) fee.dueDate = dueDate;
    if (description !== undefined) fee.description = description;

    // Recalculate balances
    fee.totalAmount = fee.amount - fee.discount + fee.fine;
    fee.balanceDue = fee.totalAmount - fee.amountPaid;

    await fee.save();

    const populatedFee = await Fee.findById(id).populate({
      path: "studentId",
      select: "admissionNumber rollNumber section",
      populate: {
        path: "userId",
        select: "name email",
      },
    });

    res.status(200).json({
      success: true,
      message: "Fee updated successfully",
      data: populatedFee,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update fee",
    });
  }
};

/**
 * Delete a fee
 * @route DELETE /api/fees/:id
 * @access Admin
 */
export const deleteFee = async (req, res) => {
  try {
    const { id } = req.params;

    const fee = await Fee.findById(id);
    if (!fee) {
      return res.status(404).json({
        success: false,
        message: "Fee not found",
      });
    }

    // Only allow deletion if no payment has been made
    if (fee.amountPaid > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete a fee with recorded payments",
      });
    }

    await Fee.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Fee deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete fee",
    });
  }
};

/**
 * Get fee statistics summary
 * @route GET /api/fees/stats/summary
 * @access Admin
 */
export const getFeeStats = async (req, res) => {
  try {
    const { academicYear, classId } = req.query;

    const matchQuery = {};
    if (academicYear) matchQuery.academicYear = academicYear;

    // Get aggregated stats
    const stats = await Fee.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: "students",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: "$student" },
      ...(classId
        ? [
            {
              $match: {
                "student.classId": {
                  $eq: require("mongoose").Types.ObjectId(classId),
                },
              },
            },
          ]
        : []),
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$totalAmount" },
          totalCollected: { $sum: "$amountPaid" },
          totalPending: { $sum: "$balanceDue" },
          totalFees: { $sum: 1 },
          paidCount: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] },
          },
          partialCount: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "partial"] }, 1, 0] },
          },
          pendingCount: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "pending"] }, 1, 0] },
          },
          overdueCount: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "overdue"] }, 1, 0] },
          },
        },
      },
    ]);

    // Get stats by fee type
    const statsByType = await Fee.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$feeType",
          totalAmount: { $sum: "$totalAmount" },
          totalCollected: { $sum: "$amountPaid" },
          totalPending: { $sum: "$balanceDue" },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        overall: stats[0] || {
          totalAmount: 0,
          totalCollected: 0,
          totalPending: 0,
          totalFees: 0,
          paidCount: 0,
          partialCount: 0,
          pendingCount: 0,
          overdueCount: 0,
        },
        byFeeType: statsByType,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch fee statistics",
    });
  }
};
