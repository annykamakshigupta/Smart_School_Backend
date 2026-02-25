/**
 * Analytics Controller
 * Gathers real data from models, sends to Groq AI via ai.service, returns insights
 */

import Student from "../models/student.model.js";
import Attendance from "../models/attendance.model.js";
import Result from "../models/result.model.js";
import Fee from "../models/fee.model.js";
import Class from "../models/class.model.js";
import Subject from "../models/subject.model.js";
import Teacher from "../models/teacher.model.js";
import Parent from "../models/parent.model.js";
import aiService from "../services/ai.service.js";

// Helper — current academic year string
function currentAcademicYear() {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${y + 1}`;
}

// ────────────── ADMIN ──────────────
export const getAdminAnalytics = async (req, res) => {
  try {
    const academicYear = req.query.academicYear || currentAcademicYear();

    // Gather school-wide data in parallel
    const [students, results, attendances, fees, classes, subjects] =
      await Promise.all([
        Student.find({ enrollmentStatus: "active" })
          .populate("classId", "name section")
          .populate("userId", "name email")
          .lean(),
        Result.find({ academicYear })
          .populate("subjectId", "name")
          .populate("classId", "name section")
          .lean(),
        Attendance.find({
          date: {
            $gte: new Date(new Date().setMonth(new Date().getMonth() - 3)),
          },
        }).lean(),
        Fee.find({ academicYear }).lean(),
        Class.find({ isActive: true }).lean(),
        Subject.find({ isActive: true }).lean(),
      ]);

    // Build summary data for AI
    const totalStudents = students.length;
    const totalClasses = classes.length;

    // Class-level aggregation
    const classStats = classes.map((cls) => {
      const classResults = results.filter(
        (r) => String(r.classId?._id || r.classId) === String(cls._id),
      );
      const classAttendance = attendances.filter(
        (a) => String(a.classId) === String(cls._id),
      );
      const avgScore =
        classResults.length > 0
          ? classResults.reduce((s, r) => s + (r.percentage || 0), 0) /
            classResults.length
          : 0;
      const presentCount = classAttendance.filter(
        (a) => a.status === "present" || a.status === "late",
      ).length;
      const avgAttendance =
        classAttendance.length > 0
          ? (presentCount / classAttendance.length) * 100
          : 0;
      return {
        className: `${cls.name} ${cls.section || ""}`.trim(),
        studentCount: students.filter(
          (s) => String(s.classId?._id || s.classId) === String(cls._id),
        ).length,
        avgScore: Math.round(avgScore * 10) / 10,
        avgAttendance: Math.round(avgAttendance * 10) / 10,
      };
    });

    // Subject-level aggregation
    const subjectStats = subjects.map((sub) => {
      const subResults = results.filter(
        (r) => String(r.subjectId?._id || r.subjectId) === String(sub._id),
      );
      const avg =
        subResults.length > 0
          ? subResults.reduce((s, r) => s + (r.percentage || 0), 0) /
            subResults.length
          : 0;
      const failCount = subResults.filter((r) => r.status === "Fail").length;
      return {
        subject: sub.name,
        avgScore: Math.round(avg * 10) / 10,
        failRate:
          subResults.length > 0
            ? Math.round((failCount / subResults.length) * 100)
            : 0,
        totalExams: subResults.length,
      };
    });

    // Fee aggregation
    const totalFeeExpected = fees.reduce((s, f) => s + (f.totalAmount || 0), 0);
    const totalFeeCollected = fees.reduce((s, f) => s + (f.amountPaid || 0), 0);
    const overdueFees = fees.filter(
      (f) => f.paymentStatus === "overdue",
    ).length;

    // Overall attendance
    const totalPresent = attendances.filter(
      (a) => a.status === "present" || a.status === "late",
    ).length;
    const overallAttendanceRate =
      attendances.length > 0
        ? Math.round((totalPresent / attendances.length) * 100 * 10) / 10
        : 0;

    const payload = {
      academicYear,
      totalStudents,
      totalClasses,
      overallAttendanceRate,
      feeStats: {
        totalExpected: totalFeeExpected,
        totalCollected: totalFeeCollected,
        collectionRate:
          totalFeeExpected > 0
            ? Math.round((totalFeeCollected / totalFeeExpected) * 100)
            : 0,
        overdueCount: overdueFees,
      },
      classStats: classStats.slice(0, 15),
      subjectStats: subjectStats.slice(0, 15),
      recentResultsCount: results.length,
    };

    const insights = await aiService.getAdminInsights(payload);
    res.json({ success: true, data: insights });
  } catch (error) {
    console.error("Admin analytics error:", error);
    res
      .status(500)
      .json({ success: false, message: error.message || "AI analysis failed" });
  }
};

// ────────────── TEACHER ──────────────
export const getTeacherAnalytics = async (req, res) => {
  try {
    const teacherId = req.user._id;
    const academicYear = req.query.academicYear || currentAcademicYear();

    const teacher = await Teacher.findOne({ userId: teacherId })
      .populate("assignedClasses")
      .lean();

    if (!teacher) {
      return res
        .status(404)
        .json({ success: false, message: "Teacher profile not found" });
    }

    const classIds = (teacher.assignedClasses || []).map((c) => c._id);

    const [students, results, attendances] = await Promise.all([
      Student.find({ classId: { $in: classIds }, enrollmentStatus: "active" })
        .populate("userId", "name")
        .populate("classId", "name section")
        .lean(),
      Result.find({ classId: { $in: classIds }, academicYear })
        .populate("subjectId", "name")
        .populate("studentId")
        .lean(),
      Attendance.find({
        classId: { $in: classIds },
        date: {
          $gte: new Date(new Date().setMonth(new Date().getMonth() - 3)),
        },
      }).lean(),
    ]);

    // Per-student summary
    const studentSummaries = students.slice(0, 30).map((s) => {
      const sResults = results.filter(
        (r) => String(r.studentId?._id || r.studentId) === String(s._id),
      );
      const sAttendance = attendances.filter(
        (a) => String(a.studentId) === String(s._id),
      );
      const avgScore =
        sResults.length > 0
          ? sResults.reduce((sum, r) => sum + (r.percentage || 0), 0) /
            sResults.length
          : 0;
      const present = sAttendance.filter(
        (a) => a.status === "present" || a.status === "late",
      ).length;
      const attendanceRate =
        sAttendance.length > 0
          ? Math.round((present / sAttendance.length) * 100)
          : 0;
      return {
        name: s.userId?.name || "Unknown",
        class: `${s.classId?.name || ""} ${s.classId?.section || ""}`.trim(),
        avgScore: Math.round(avgScore * 10) / 10,
        attendance: attendanceRate,
        totalExams: sResults.length,
      };
    });

    // Subject difficulty
    const subjectMap = {};
    results.forEach((r) => {
      const sName = r.subjectId?.name || "Unknown";
      if (!subjectMap[sName])
        subjectMap[sName] = { scores: [], fails: 0, total: 0 };
      subjectMap[sName].scores.push(r.percentage || 0);
      subjectMap[sName].total++;
      if (r.status === "Fail") subjectMap[sName].fails++;
    });

    const subjectDifficulty = Object.entries(subjectMap).map(
      ([name, data]) => ({
        subject: name,
        avgScore:
          Math.round(
            (data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 10,
          ) / 10,
        failCount: data.fails,
        totalStudents: data.total,
      }),
    );

    const payload = {
      teacherName: req.user.name,
      totalStudents: students.length,
      classCount: classIds.length,
      studentSummaries,
      subjectDifficulty,
    };

    const insights = await aiService.getTeacherInsights(payload);
    res.json({ success: true, data: insights });
  } catch (error) {
    console.error("Teacher analytics error:", error);
    res
      .status(500)
      .json({ success: false, message: error.message || "AI analysis failed" });
  }
};

// ────────────── STUDENT ──────────────
export const getStudentAnalytics = async (req, res) => {
  try {
    const userId = req.user._id;
    const academicYear = req.query.academicYear || currentAcademicYear();

    const student = await Student.findOne({ userId })
      .populate("classId", "name section")
      .populate("userId", "name")
      .lean();

    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student profile not found" });
    }

    const [results, attendances] = await Promise.all([
      Result.find({ studentId: student._id, academicYear })
        .populate("subjectId", "name")
        .lean(),
      Attendance.find({
        studentId: student._id,
        date: {
          $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)),
        },
      })
        .populate("subjectId", "name")
        .lean(),
    ]);

    // Subject-wise performance
    const subjectPerf = {};
    results.forEach((r) => {
      const sName = r.subjectId?.name || "Unknown";
      if (!subjectPerf[sName]) subjectPerf[sName] = [];
      subjectPerf[sName].push({
        examType: r.examType,
        percentage: r.percentage || 0,
        grade: r.grade,
        status: r.status,
      });
    });

    const subjectSummary = Object.entries(subjectPerf).map(([name, exams]) => ({
      subject: name,
      avgScore:
        Math.round(
          (exams.reduce((s, e) => s + e.percentage, 0) / exams.length) * 10,
        ) / 10,
      exams: exams.length,
      latestGrade: exams[exams.length - 1]?.grade || "N/A",
    }));

    // Attendance summary
    const totalClasses = attendances.length;
    const present = attendances.filter(
      (a) => a.status === "present" || a.status === "late",
    ).length;
    const attendanceRate =
      totalClasses > 0 ? Math.round((present / totalClasses) * 100) : 0;

    const payload = {
      studentName: student.userId?.name || "Student",
      class:
        `${student.classId?.name || ""} ${student.classId?.section || ""}`.trim(),
      academicYear,
      subjectSummary,
      overallAvg:
        subjectSummary.length > 0
          ? Math.round(
              (subjectSummary.reduce((s, sub) => s + sub.avgScore, 0) /
                subjectSummary.length) *
                10,
            ) / 10
          : 0,
      attendanceRate,
      totalExams: results.length,
    };

    const insights = await aiService.getStudentInsights(payload);
    res.json({ success: true, data: insights });
  } catch (error) {
    console.error("Student analytics error:", error);
    res
      .status(500)
      .json({ success: false, message: error.message || "AI analysis failed" });
  }
};

// ────────────── PARENT ──────────────
export const getParentAnalytics = async (req, res) => {
  try {
    const userId = req.user._id;
    const { studentId } = req.query;
    const academicYear = req.query.academicYear || currentAcademicYear();

    const parent = await Parent.findOne({ userId }).lean();
    if (!parent) {
      return res
        .status(404)
        .json({ success: false, message: "Parent profile not found" });
    }

    // Find children
    let children;
    if (studentId) {
      children = await Student.find({
        _id: studentId,
        parentId: parent._id,
        enrollmentStatus: "active",
      })
        .populate("classId", "name section")
        .populate("userId", "name")
        .lean();
    } else {
      children = await Student.find({
        parentId: parent._id,
        enrollmentStatus: "active",
      })
        .populate("classId", "name section")
        .populate("userId", "name")
        .lean();
    }

    if (!children.length) {
      return res.json({
        success: true,
        data: { summary: "No active children found for analysis." },
      });
    }

    const childIds = children.map((c) => c._id);

    const [results, attendances] = await Promise.all([
      Result.find({ studentId: { $in: childIds }, academicYear })
        .populate("subjectId", "name")
        .lean(),
      Attendance.find({
        studentId: { $in: childIds },
        date: {
          $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)),
        },
      }).lean(),
    ]);

    // Per-child summary
    const childData = children.map((child) => {
      const cResults = results.filter(
        (r) => String(r.studentId) === String(child._id),
      );
      const cAtt = attendances.filter(
        (a) => String(a.studentId) === String(child._id),
      );
      const avgScore =
        cResults.length > 0
          ? cResults.reduce((s, r) => s + (r.percentage || 0), 0) /
            cResults.length
          : 0;
      const present = cAtt.filter(
        (a) => a.status === "present" || a.status === "late",
      ).length;
      const attRate =
        cAtt.length > 0 ? Math.round((present / cAtt.length) * 100) : 0;

      // Subject breakdown
      const subjectMap = {};
      cResults.forEach((r) => {
        const sName = r.subjectId?.name || "Unknown";
        if (!subjectMap[sName]) subjectMap[sName] = [];
        subjectMap[sName].push(r.percentage || 0);
      });

      const subjects = Object.entries(subjectMap).map(([name, scores]) => ({
        subject: name,
        avgScore:
          Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) /
          10,
      }));

      return {
        name: child.userId?.name || "Child",
        class:
          `${child.classId?.name || ""} ${child.classId?.section || ""}`.trim(),
        avgScore: Math.round(avgScore * 10) / 10,
        attendanceRate: attRate,
        totalExams: cResults.length,
        subjects,
      };
    });

    const payload = {
      parentName: req.user.name,
      academicYear,
      children: childData,
    };

    const insights = await aiService.getParentInsights(payload);
    res.json({ success: true, data: insights });
  } catch (error) {
    console.error("Parent analytics error:", error);
    res
      .status(500)
      .json({ success: false, message: error.message || "AI analysis failed" });
  }
};
