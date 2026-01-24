import Assignment from "../models/assignment.model.js";
import Submission from "../models/submission.model.js";
import Class from "../models/class.model.js";
import Subject from "../models/subject.model.js";

class AssignmentService {
  // Create new assignment
  async createAssignment(assignmentData) {
    try {
      // Validate class exists
      const classExists = await Class.findById(assignmentData.class);
      if (!classExists) {
        throw new Error("Class not found");
      }

      // Validate subject exists
      const subjectExists = await Subject.findById(assignmentData.subject);
      if (!subjectExists) {
        throw new Error("Subject not found");
      }

      // Validate due date is in future
      if (new Date(assignmentData.dueDate) <= new Date()) {
        throw new Error("Due date must be in the future");
      }

      const assignment = await Assignment.create(assignmentData);

      return await Assignment.findById(assignment._id)
        .populate("teacher", "name email")
        .populate("subject", "name code")
        .populate("class", "name section academicYear");
    } catch (error) {
      throw error;
    }
  }

  // Get all assignments with filters (for teacher)
  async getTeacherAssignments(teacherId, filters = {}) {
    try {
      const query = { teacher: teacherId, isActive: true };

      // Apply filters
      if (filters.status) {
        query.status = filters.status;
      }

      if (filters.class) {
        query.class = filters.class;
      }

      if (filters.subject) {
        query.subject = filters.subject;
      }

      if (filters.dateFrom || filters.dateTo) {
        query.dueDate = {};
        if (filters.dateFrom) {
          query.dueDate.$gte = new Date(filters.dateFrom);
        }
        if (filters.dateTo) {
          query.dueDate.$lte = new Date(filters.dateTo);
        }
      }

      // Search by title
      if (filters.search) {
        query.title = { $regex: filters.search, $options: "i" };
      }

      const page = parseInt(filters.page) || 1;
      const limit = parseInt(filters.limit) || 10;
      const skip = (page - 1) * limit;

      const assignments = await Assignment.find(query)
        .populate("teacher", "name email")
        .populate("subject", "name code")
        .populate("class", "name section academicYear")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Assignment.countDocuments(query);

      // Get submission counts for each assignment
      const assignmentsWithStats = await Promise.all(
        assignments.map(async (assignment) => {
          const totalSubmissions = await Submission.countDocuments({
            assignment: assignment._id,
          });
          const gradedSubmissions = await Submission.countDocuments({
            assignment: assignment._id,
            status: "graded",
          });

          return {
            ...assignment.toObject(),
            submissionStats: {
              total: totalSubmissions,
              graded: gradedSubmissions,
              pending: totalSubmissions - gradedSubmissions,
            },
          };
        }),
      );

      return {
        assignments: assignmentsWithStats,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw error;
    }
  }

  // Get student assignments
  async getStudentAssignments(studentId, filters = {}) {
    try {
      // First, get student's class
      const Student = (await import("../models/student.model.js")).default;
      const student = await Student.findOne({ userId: studentId }).populate(
        "classId",
      );

      if (!student) {
        throw new Error("Student profile not found");
      }

      const query = {
        class: student.classId._id,
        status: "published",
        isActive: true,
      };

      // Apply filters
      if (filters.subject) {
        query.subject = filters.subject;
      }

      if (filters.search) {
        query.title = { $regex: filters.search, $options: "i" };
      }

      const page = parseInt(filters.page) || 1;
      const limit = parseInt(filters.limit) || 10;
      const skip = (page - 1) * limit;

      const assignments = await Assignment.find(query)
        .populate("teacher", "name email")
        .populate("subject", "name code")
        .populate("class", "name section")
        .sort({ dueDate: 1 })
        .skip(skip)
        .limit(limit);

      const total = await Assignment.countDocuments(query);

      // Get submission status for each assignment
      const assignmentsWithSubmission = await Promise.all(
        assignments.map(async (assignment) => {
          const submission = await Submission.findOne({
            assignment: assignment._id,
            student: studentId,
          });

          return {
            ...assignment.toObject(),
            mySubmission: submission || null,
            submissionStatus: submission
              ? submission.status
              : assignment.dueDate < new Date()
                ? "overdue"
                : "pending",
          };
        }),
      );

      return {
        assignments: assignmentsWithSubmission,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw error;
    }
  }

  // Get assignment by ID
  async getAssignmentById(assignmentId, userId = null, role = null) {
    try {
      const assignment = await Assignment.findById(assignmentId)
        .populate("teacher", "name email")
        .populate("subject", "name code")
        .populate("class", "name section academicYear");

      if (!assignment) {
        throw new Error("Assignment not found");
      }

      // If student, include their submission
      if (role === "student" && userId) {
        const submission = await Submission.findOne({
          assignment: assignmentId,
          student: userId,
        });

        return {
          ...assignment.toObject(),
          mySubmission: submission || null,
        };
      }

      // If teacher, include submission stats
      if (role === "teacher") {
        const totalSubmissions = await Submission.countDocuments({
          assignment: assignmentId,
        });
        const gradedSubmissions = await Submission.countDocuments({
          assignment: assignmentId,
          status: "graded",
        });

        return {
          ...assignment.toObject(),
          submissionStats: {
            total: totalSubmissions,
            graded: gradedSubmissions,
            pending: totalSubmissions - gradedSubmissions,
          },
        };
      }

      return assignment;
    } catch (error) {
      throw error;
    }
  }

  // Update assignment
  async updateAssignment(assignmentId, updateData, teacherId) {
    try {
      const assignment = await Assignment.findOne({
        _id: assignmentId,
        teacher: teacherId,
      });

      if (!assignment) {
        throw new Error("Assignment not found or unauthorized");
      }

      // Validate due date if being updated
      if (updateData.dueDate && new Date(updateData.dueDate) <= new Date()) {
        throw new Error("Due date must be in the future");
      }

      const updatedAssignment = await Assignment.findByIdAndUpdate(
        assignmentId,
        updateData,
        { new: true, runValidators: true },
      )
        .populate("teacher", "name email")
        .populate("subject", "name code")
        .populate("class", "name section academicYear");

      return updatedAssignment;
    } catch (error) {
      throw error;
    }
  }

  // Delete assignment (soft delete)
  async deleteAssignment(assignmentId, teacherId) {
    try {
      const assignment = await Assignment.findOne({
        _id: assignmentId,
        teacher: teacherId,
      });

      if (!assignment) {
        throw new Error("Assignment not found or unauthorized");
      }

      // Check if there are submissions
      const submissionCount = await Submission.countDocuments({
        assignment: assignmentId,
      });

      if (submissionCount > 0) {
        // Soft delete if submissions exist
        assignment.isActive = false;
        await assignment.save();
        return {
          message: "Assignment deactivated (has submissions)",
          deleted: false,
        };
      } else {
        // Hard delete if no submissions
        await Assignment.findByIdAndDelete(assignmentId);
        return { message: "Assignment deleted permanently", deleted: true };
      }
    } catch (error) {
      throw error;
    }
  }

  // Get assignment analytics
  async getAssignmentAnalytics(teacherId, filters = {}) {
    try {
      const query = { teacher: teacherId, isActive: true };

      if (filters.academicYear) {
        // Get classes for this academic year
        const classes = await Class.find({
          academicYear: filters.academicYear,
        });
        const classIds = classes.map((c) => c._id);
        query.class = { $in: classIds };
      }

      const totalAssignments = await Assignment.countDocuments(query);
      const publishedAssignments = await Assignment.countDocuments({
        ...query,
        status: "published",
      });
      const draftAssignments = await Assignment.countDocuments({
        ...query,
        status: "draft",
      });

      // Get all published assignments for submission stats
      const assignments = await Assignment.find({
        ...query,
        status: "published",
      });

      let totalSubmissions = 0;
      let gradedSubmissions = 0;
      let totalMarks = 0;
      let obtainedMarks = 0;

      for (const assignment of assignments) {
        const submissions = await Submission.find({
          assignment: assignment._id,
          status: "graded",
        });

        totalSubmissions += submissions.length;
        gradedSubmissions += submissions.length;

        submissions.forEach((sub) => {
          totalMarks += assignment.totalMarks;
          obtainedMarks += sub.marksObtained || 0;
        });
      }

      const averageMarks =
        gradedSubmissions > 0 ? (obtainedMarks / totalMarks) * 100 : 0;

      return {
        totalAssignments,
        publishedAssignments,
        draftAssignments,
        totalSubmissions,
        gradedSubmissions,
        pendingGrading: totalSubmissions - gradedSubmissions,
        averageMarksPercentage: averageMarks.toFixed(2),
      };
    } catch (error) {
      throw error;
    }
  }
}

export default new AssignmentService();
