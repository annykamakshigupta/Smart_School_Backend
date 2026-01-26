import Attendance from "../models/attendance.model.js";
import User from "../models/user.model.js";
import Class from "../models/class.model.js";
import Subject from "../models/subject.model.js";
import Schedule from "../models/schedule.model.js";
import mongoose from "mongoose";

/**
 * Mark attendance for students
 * POST /api/attendance/mark
 * Access: Admin, Teacher
 */
export const markAttendance = async (req, res) => {
  try {
    const { classId, subjectId, date, attendanceRecords } = req.body;
    const user = req.user;

    // Validate required fields
    if (
      !classId ||
      !subjectId ||
      !date ||
      !attendanceRecords ||
      !Array.isArray(attendanceRecords)
    ) {
      return res.status(400).json({
        success: false,
        message: "Class, subject, date, and attendance records are required",
      });
    }

    // Verify class exists
    const classDoc = await Class.findById(classId);
    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    // Verify subject exists
    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found",
      });
    }

    // If teacher, verify they are assigned to this class/subject
    if (user.role === "teacher") {
      const schedule = await Schedule.findOne({
        classId: classId,
        subjectId: subjectId,
        teacherId: user._id,
      });

      if (!schedule) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to teach this subject in this class",
        });
      }
    }

    // Validate date (cannot mark future attendance)
    const attendanceDate = new Date(date);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (attendanceDate > today) {
      return res.status(400).json({
        success: false,
        message: "Cannot mark attendance for future dates",
      });
    }

    // Get teacher ID (for teacher role, use their own ID)
    let teacherId;
    if (user.role === "teacher") {
      teacherId = user._id;
    } else {
      // For admin, get the assigned teacher for this class/subject
      const schedule = await Schedule.findOne({
        classId: classId,
        subjectId: subjectId,
      });
      teacherId = schedule ? schedule.teacherId : user._id;
    }

    const savedRecords = [];
    const errors = [];

    // Process each attendance record
    for (const record of attendanceRecords) {
      const { studentId, status, remarks } = record;

      try {
        // Verify student exists and has student role
        const student = await User.findById(studentId);
        if (!student || student.role !== "student") {
          errors.push({
            studentId,
            message: "Invalid student",
          });
          continue;
        }

        // Check if attendance already exists for this student/subject/date
        const existingAttendance = await Attendance.findOne({
          student: studentId,
          subject: subjectId,
          date: attendanceDate,
        });

        if (existingAttendance) {
          // Update existing attendance
          existingAttendance.status = status;
          existingAttendance.remarks = remarks || existingAttendance.remarks;
          existingAttendance.markedBy = user._id;
          existingAttendance.markedByRole = user.role;
          existingAttendance.class = classId;
          existingAttendance.teacher = teacherId;

          await existingAttendance.save();
          savedRecords.push(existingAttendance);
        } else {
          // Create new attendance record
          const attendance = new Attendance({
            student: studentId,
            class: classId,
            subject: subjectId,
            teacher: teacherId,
            date: attendanceDate,
            status,
            remarks,
            markedBy: user._id,
            markedByRole: user.role,
          });

          await attendance.save();
          savedRecords.push(attendance);
        }
      } catch (error) {
        errors.push({
          studentId,
          message: error.message,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: "Attendance marked successfully",
      data: {
        saved: savedRecords.length,
        errors: errors.length,
        records: savedRecords,
        failedRecords: errors,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error marking attendance",
      error: error.message,
    });
  }
};

/**
 * Update attendance record
 * PUT /api/attendance/:id
 * Access: Admin, Teacher (own class only)
 */
export const updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;
    const user = req.user;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const attendance = await Attendance.findById(id);
    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found",
      });
    }

    // If teacher, verify they are the assigned teacher
    if (user.role === "teacher") {
      const schedule = await Schedule.findOne({
        classId: attendance.class,
        subjectId: attendance.subject,
        teacherId: user._id,
      });

      if (!schedule) {
        return res.status(403).json({
          success: false,
          message: "You can only update attendance for your assigned classes",
        });
      }
    }

    attendance.status = status;
    if (remarks !== undefined) {
      attendance.remarks = remarks;
    }
    attendance.markedBy = user._id;
    attendance.markedByRole = user.role;

    await attendance.save();

    const populatedAttendance = await Attendance.findById(attendance._id)
      .populate("student", "name email")
      .populate("class", "name section")
      .populate("subject", "name")
      .populate("teacher", "name")
      .populate("markedBy", "name");

    res.status(200).json({
      success: true,
      message: "Attendance updated successfully",
      data: populatedAttendance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating attendance",
      error: error.message,
    });
  }
};

/**
 * Get attendance by class and date
 * GET /api/attendance/class?classId=xxx&subjectId=xxx&date=xxx
 * Access: Admin, Teacher
 */
export const getAttendanceByClassAndDate = async (req, res) => {
  try {
    const { classId, subjectId, date, startDate, endDate } = req.query;
    const user = req.user;

    if (!classId) {
      return res.status(400).json({
        success: false,
        message: "Class ID is required",
      });
    }

    // Build query
    const query = { class: classId };

    if (subjectId) {
      query.subject = subjectId;
    }

    // If teacher, verify they teach this class
    if (user.role === "teacher") {
      const scheduleQuery = { classId, teacherId: user._id };
      if (subjectId) {
        scheduleQuery.subjectId = subjectId;
      }

      const schedule = await Schedule.findOne(scheduleQuery);
      if (!schedule) {
        return res.status(403).json({
          success: false,
          message: "You can only view attendance for your assigned classes",
        });
      }
    }

    // Handle date filtering
    if (date) {
      const searchDate = new Date(date);
      searchDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(searchDate);
      nextDay.setDate(nextDay.getDate() + 1);

      query.date = {
        $gte: searchDate,
        $lt: nextDay,
      };
    } else if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const attendance = await Attendance.find(query)
      .populate("student", "name email")
      .populate("class", "name section")
      .populate("subject", "name")
      .populate("teacher", "name")
      .populate("markedBy", "name role")
      .sort({ date: -1, student: 1 });

    res.status(200).json({
      success: true,
      count: attendance.length,
      data: attendance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching attendance",
      error: error.message,
    });
  }
};

/**
 * Get attendance for a specific student
 * GET /api/attendance/student?studentId=xxx&startDate=xxx&endDate=xxx
 * Access: Student (own only), Admin
 */
export const getAttendanceByStudent = async (req, res) => {
  try {
    const { studentId, startDate, endDate, subjectId } = req.query;
    const user = req.user;

    let targetStudentId;

    // Students can only view their own attendance
    if (user.role === "student") {
      targetStudentId = user._id;
    } else if (user.role === "admin") {
      if (!studentId) {
        return res.status(400).json({
          success: false,
          message: "Student ID is required",
        });
      }
      targetStudentId = studentId;
    } else {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const query = { student: targetStudentId };

    // Add date range filter
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // Add subject filter
    if (subjectId) {
      query.subject = subjectId;
    }

    const attendance = await Attendance.find(query)
      .populate("student", "name email")
      .populate("class", "name section")
      .populate("subject", "name")
      .populate("teacher", "name")
      .sort({ date: -1 });

    // Calculate statistics
    const totalClasses = attendance.length;
    const presentCount = attendance.filter(
      (a) => a.status === "present"
    ).length;
    const absentCount = attendance.filter((a) => a.status === "absent").length;
    const lateCount = attendance.filter((a) => a.status === "late").length;
    const attendancePercentage =
      totalClasses > 0
        ? (((presentCount + lateCount) / totalClasses) * 100).toFixed(2)
        : 0;

    res.status(200).json({
      success: true,
      count: attendance.length,
      data: attendance,
      statistics: {
        totalClasses,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        attendancePercentage: parseFloat(attendancePercentage),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching attendance",
      error: error.message,
    });
  }
};

/**
 * Get attendance for parent's child
 * GET /api/attendance/child?childId=xxx&startDate=xxx&endDate=xxx
 * Access: Parent
 */
export const getAttendanceForChild = async (req, res) => {
  try {
    const { childId, startDate, endDate, subjectId } = req.query;
    const user = req.user;

    if (user.role !== "parent") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only parents can access this endpoint",
      });
    }

    if (!childId) {
      return res.status(400).json({
        success: false,
        message: "Child ID is required",
      });
    }

    // Verify the child exists and is a student
    const child = await User.findById(childId);
    if (!child || child.role !== "student") {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const query = { student: childId };

    // Add date range filter
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // Add subject filter
    if (subjectId) {
      query.subject = subjectId;
    }

    const attendance = await Attendance.find(query)
      .populate("student", "name email")
      .populate("class", "name section")
      .populate("subject", "name")
      .populate("teacher", "name")
      .sort({ date: -1 });

    // Calculate statistics
    const totalClasses = attendance.length;
    const presentCount = attendance.filter(
      (a) => a.status === "present"
    ).length;
    const absentCount = attendance.filter((a) => a.status === "absent").length;
    const lateCount = attendance.filter((a) => a.status === "late").length;
    const attendancePercentage =
      totalClasses > 0
        ? (((presentCount + lateCount) / totalClasses) * 100).toFixed(2)
        : 0;

    res.status(200).json({
      success: true,
      count: attendance.length,
      data: attendance,
      statistics: {
        totalClasses,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        attendancePercentage: parseFloat(attendancePercentage),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching attendance",
      error: error.message,
    });
  }
};

/**
 * Get students for a class (for attendance marking)
 * GET /api/attendance/students?classId=xxx
 * Access: Admin, Teacher
 */
export const getStudentsForAttendance = async (req, res) => {
  try {
    const { classId, subjectId, date } = req.query;
    const user = req.user;

    if (!classId) {
      return res.status(400).json({
        success: false,
        message: "Class ID is required",
      });
    }

    // If teacher, verify assignment
    if (user.role === "teacher" && subjectId) {
      const schedule = await Schedule.findOne({
        classId,
        subjectId,
        teacherId: user._id,
      });

      if (!schedule) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to this class/subject",
        });
      }
    }

    // Get all students (in a real app, you'd have a student-class mapping)
    // For now, we'll get students who have been marked for this class
    const students = await User.find({ role: "student" }).select(
      "name email _id"
    );

    // If date and subject provided, get existing attendance
    let attendanceMap = {};
    if (date && subjectId) {
      const searchDate = new Date(date);
      searchDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(searchDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const existingAttendance = await Attendance.find({
        class: classId,
        subject: subjectId,
        date: {
          $gte: searchDate,
          $lt: nextDay,
        },
      });

      existingAttendance.forEach((att) => {
        attendanceMap[att.student.toString()] = {
          id: att._id,
          status: att.status,
          remarks: att.remarks,
        };
      });
    }

    // Merge students with attendance status
    const studentsWithAttendance = students.map((student) => ({
      _id: student._id,
      name: student.name,
      email: student.email,
      attendance: attendanceMap[student._id.toString()] || null,
    }));

    res.status(200).json({
      success: true,
      count: studentsWithAttendance.length,
      data: studentsWithAttendance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching students",
      error: error.message,
    });
  }
};

/**
 * Get attendance summary/statistics
 * GET /api/attendance/summary
 * Access: Admin, Teacher
 */
export const getAttendanceSummary = async (req, res) => {
  try {
    const { classId, subjectId, studentId, startDate, endDate } = req.query;
    const user = req.user;

    const query = {};

    if (classId) query.class = classId;
    if (subjectId) query.subject = subjectId;
    if (studentId) query.student = studentId;

    // Teacher can only see their own classes
    if (user.role === "teacher") {
      query.teacher = user._id;
    }

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const attendance = await Attendance.find(query);

    const summary = {
      totalRecords: attendance.length,
      present: attendance.filter((a) => a.status === "present").length,
      absent: attendance.filter((a) => a.status === "absent").length,
      late: attendance.filter((a) => a.status === "late").length,
    };

    summary.attendanceRate =
      summary.totalRecords > 0
        ? (
            ((summary.present + summary.late) / summary.totalRecords) *
            100
          ).toFixed(2)
        : 0;

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching attendance summary",
      error: error.message,
    });
  }
};

/**
 * Delete attendance record
 * DELETE /api/attendance/:id
 * Access: Admin only
 */
export const deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    const attendance = await Attendance.findByIdAndDelete(id);

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Attendance record deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting attendance",
      error: error.message,
    });
  }
};
