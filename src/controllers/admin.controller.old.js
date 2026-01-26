import User from "../models/user.model.js";
import Student from "../models/student.model.js";
import Parent from "../models/parent.model.js";
import bcrypt from "bcryptjs";

/**
 * Admin Controller
 * Handles all admin-only user management operations
 */
class AdminController {
  // ============ USER MANAGEMENT ============

  /**
   * Create a new user (admin only)
   */
  async createUser(req, res) {
    try {
      const { name, email, password, role, phone, status } = req.body;

      // Validate required fields
      if (!name || !email || !password || !role || !phone) {
        return res.status(400).json({
          success: false,
          message:
            "All fields are required: name, email, password, role, phone",
        });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "User with this email already exists",
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = new User({
        name,
        email,
        password: hashedPassword,
        role,
        phone,
        status: status || "active",
      });

      await user.save();

      // If role is parent, create parent profile
      if (role === "parent") {
        await Parent.create({ userId: user._id, children: [] });
      }

      res.status(201).json({
        success: true,
        message: "User created successfully",
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          status: user.status,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error creating user",
        error: error.message,
      });
    }
  }

  /**
   * Get all users with optional filters
   */
  async getAllUsers(req, res) {
    try {
      const { role, status, search, page = 1, limit = 50 } = req.query;

      const query = {};
      if (role) query.role = role;
      if (status) query.status = status;
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }

      const skip = (page - 1) * limit;
      const total = await User.countDocuments(query);
      const users = await User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      res.status(200).json({
        success: true,
        count: users.length,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        data: users,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching users",
        error: error.message,
      });
    }
  }

  /**
   * Get users by role
   */
  async getUsersByRole(req, res) {
    try {
      const { role } = req.params;

      if (!["admin", "teacher", "student", "parent"].includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role specified",
        });
      }

      const users = await User.find({ role, status: "active" }).select(
        "_id name email phone",
      );

      res.status(200).json({
        success: true,
        count: users.length,
        data: users,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching users by role",
        error: error.message,
      });
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(req, res) {
    try {
      const { id } = req.params;

      const user = await User.findById(id).select("-password");
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Get additional info based on role
      let additionalInfo = {};
      if (user.role === "student") {
        const student = await Student.findOne({ userId: id })
          .populate("classId", "name section")
          .populate("parentId", "name email phone");
        additionalInfo = { studentProfile: student };
      } else if (user.role === "parent") {
        const parent = await Parent.findOne({ userId: id }).populate({
          path: "children",
          populate: [
            { path: "userId", select: "name email" },
            { path: "classId", select: "name section" },
          ],
        });
        additionalInfo = { parentProfile: parent };
      }

      res.status(200).json({
        success: true,
        data: { ...user.toObject(), ...additionalInfo },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching user",
        error: error.message,
      });
    }
  }

  /**
   * Update user
   */
  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { name, email, phone, status, role } = req.body;

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Check email uniqueness if email is being changed
      if (email && email !== user.email) {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return res.status(409).json({
            success: false,
            message: "Email already in use",
          });
        }
      }

      // Update fields
      if (name) user.name = name;
      if (email) user.email = email;
      if (phone) user.phone = phone;
      if (status) user.status = status;
      // Role change is restricted - only update if explicitly allowed
      if (role && role !== user.role) {
        // Handle role change implications
        user.role = role;
      }

      await user.save();

      res.status(200).json({
        success: true,
        message: "User updated successfully",
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          status: user.status,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error updating user",
        error: error.message,
      });
    }
  }

  /**
   * Deactivate/Suspend user
   */
  async deactivateUser(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body; // 'suspended' or 'inactive'

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      user.status = status || "suspended";
      await user.save();

      res.status(200).json({
        success: true,
        message: `User ${status || "suspended"} successfully`,
        data: { id: user._id, status: user.status },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error deactivating user",
        error: error.message,
      });
    }
  }

  /**
   * Reset user password
   */
  async resetUserPassword(req, res) {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters",
        });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
      await user.save();

      res.status(200).json({
        success: true,
        message: "Password reset successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error resetting password",
        error: error.message,
      });
    }
  }

  /**
   * Delete user (soft delete by setting status to inactive)
   */
  async deleteUser(req, res) {
    try {
      const { id } = req.params;

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Soft delete
      user.status = "inactive";
      await user.save();

      res.status(200).json({
        success: true,
        message: "User deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error deleting user",
        error: error.message,
      });
    }
  }

  // ============ STUDENT MANAGEMENT ============

  /**
   * Create student with class assignment
   */
  async createStudentWithClassAssignment(req, res) {
    try {
      const {
        name,
        email,
        password,
        phone,
        classId,
        section,
        rollNumber,
        parentId,
        academicYear,
      } = req.body;

      // Validate required fields
      if (
        !name ||
        !email ||
        !password ||
        !phone ||
        !classId ||
        !section ||
        !rollNumber ||
        !academicYear
      ) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields for student enrollment",
        });
      }

      // Check if user email already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "User with this email already exists",
        });
      }

      // Check for duplicate roll number in class
      const existingRoll = await Student.findOne({
        classId,
        rollNumber,
        academicYear,
      });
      if (existingRoll) {
        return res.status(409).json({
          success: false,
          message: "Roll number already exists in this class",
        });
      }

      // Create user account
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User({
        name,
        email,
        password: hashedPassword,
        role: "student",
        phone,
        status: "active",
      });
      await user.save();

      // Create student profile
      const student = new Student({
        userId: user._id,
        classId,
        section,
        rollNumber,
        parentId: parentId || null,
        academicYear,
      });
      await student.save();

      // If parent assigned, update parent's children array
      if (parentId) {
        await Parent.findOneAndUpdate(
          { userId: parentId },
          { $addToSet: { children: student._id } },
        );
      }

      res.status(201).json({
        success: true,
        message: "Student enrolled successfully",
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
          student: student,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error enrolling student",
        error: error.message,
      });
    }
  }

  /**
   * Get all students with class info
   */
  async getAllStudents(req, res) {
    try {
      const { search } = req.query;

      // Fetch users with student role - ONLY from User model
      let studentUsers = await User.find({
        role: "student",
        status: "active",
      }).populate("parentId", "name email phone");

      // Apply search filter
      if (search) {
        studentUsers = studentUsers.filter((s) =>
          s.name?.toLowerCase().includes(search.toLowerCase()),
        );
      }

      // Build student objects
      const students = studentUsers.map((user) => ({
        _id: user._id,
        userId: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          status: user.status,
        },
        classId: null,
        section: null,
        rollNumber: null,
        parentId: user.parentId || null,
        academicYear: null,
      }));

      res.status(200).json({
        success: true,
        count: students.length,
        data: students,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching students",
        error: error.message,
      });
    }
  }

  /**
   * Get students by class
   */
  async getStudentsByClass(req, res) {
    try {
      const { classId } = req.params;

      const students = await Student.find({ classId })
        .populate("userId", "name email phone status")
        .populate("parentId", "name email phone")
        .sort({ rollNumber: 1 });

      res.status(200).json({
        success: true,
        count: students.length,
        data: students,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching students",
        error: error.message,
      });
    }
  }

  /**
   * Get student profile by user ID
   */
  async getStudentProfileByUserId(req, res) {
    try {
      const { userId } = req.params;

      const student = await Student.findOne({ userId })
        .populate("userId", "name email phone status")
        .populate("classId", "name section academicYear subjects")
        .populate("parentId", "name email phone");

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found",
        });
      }

      res.status(200).json({
        success: true,
        data: student,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching student profile",
        error: error.message,
      });
    }
  }

  /**
   * Update student info (class assignment, roll number, etc.)
   */
  async updateStudent(req, res) {
    try {
      const { id } = req.params;
      const { classId, section, rollNumber, parentId, academicYear } = req.body;

      const student = await Student.findById(id);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student not found",
        });
      }

      // Check roll number uniqueness if changing
      if (rollNumber && rollNumber !== student.rollNumber) {
        const existingRoll = await Student.findOne({
          classId: classId || student.classId,
          rollNumber,
          academicYear: academicYear || student.academicYear,
          _id: { $ne: id },
        });
        if (existingRoll) {
          return res.status(409).json({
            success: false,
            message: "Roll number already exists in this class",
          });
        }
      }

      // Handle parent change
      if (parentId !== undefined && parentId !== student.parentId?.toString()) {
        // Remove from old parent
        if (student.parentId) {
          await Parent.findOneAndUpdate(
            { userId: student.parentId },
            { $pull: { children: student._id } },
          );
        }
        // Add to new parent
        if (parentId) {
          await Parent.findOneAndUpdate(
            { userId: parentId },
            { $addToSet: { children: student._id } },
          );
        }
      }

      // Update fields
      if (classId) student.classId = classId;
      if (section) student.section = section;
      if (rollNumber) student.rollNumber = rollNumber;
      if (parentId !== undefined) student.parentId = parentId || null;
      if (academicYear) student.academicYear = academicYear;

      await student.save();

      const updatedStudent = await Student.findById(id)
        .populate("userId", "name email phone")
        .populate("classId", "name section")
        .populate("parentId", "name email phone");

      res.status(200).json({
        success: true,
        message: "Student updated successfully",
        data: updatedStudent,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error updating student",
        error: error.message,
      });
    }
  }

  /**
   * Assign parent to student
   */
  async assignParentToStudent(req, res) {
    try {
      const { studentId, parentId } = req.body;

      const student = await Student.findById(studentId);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student not found",
        });
      }

      const parent = await Parent.findOne({ userId: parentId });
      if (!parent) {
        return res.status(404).json({
          success: false,
          message: "Parent not found",
        });
      }

      // Remove from old parent if exists
      if (student.parentId) {
        await Parent.findOneAndUpdate(
          { userId: student.parentId },
          { $pull: { children: student._id } },
        );
      }

      // Assign new parent
      student.parentId = parentId;
      await student.save();

      // Add student to parent's children
      await Parent.findOneAndUpdate(
        { userId: parentId },
        { $addToSet: { children: student._id } },
      );

      res.status(200).json({
        success: true,
        message: "Parent assigned successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error assigning parent",
        error: error.message,
      });
    }
  }

  /**
   * Change student class (mid-session transfer)
   */
  async changeStudentClass(req, res) {
    try {
      const { studentId, newClassId, newSection, newRollNumber } = req.body;

      const student = await Student.findById(studentId);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student not found",
        });
      }

      // Check roll number uniqueness in new class
      const existingRoll = await Student.findOne({
        classId: newClassId,
        rollNumber: newRollNumber,
        academicYear: student.academicYear,
        _id: { $ne: studentId },
      });
      if (existingRoll) {
        return res.status(409).json({
          success: false,
          message: "Roll number already exists in the new class",
        });
      }

      student.classId = newClassId;
      student.section = newSection || student.section;
      student.rollNumber = newRollNumber;
      await student.save();

      const updatedStudent = await Student.findById(studentId)
        .populate("userId", "name email phone")
        .populate("classId", "name section");

      res.status(200).json({
        success: true,
        message: "Student class changed successfully",
        data: updatedStudent,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error changing student class",
        error: error.message,
      });
    }
  }

  // ============ PARENT MANAGEMENT ============

  /**
   * Get all parents
   */
  async getAllParents(req, res) {
    try {
      // Fetch all users with parent role - ONLY from User model
      const parentUsers = await User.find({ role: "parent", status: "active" });

      // Fetch all student users - ONLY from User model
      const allStudents = await User.find({
        role: "student",
        status: "active",
      });

      // Build parent objects with their children
      const parents = parentUsers.map((parentUser) => {
        // Find all students where parentId matches this parent's user ID
        const children = allStudents.filter(
          (student) =>
            student.parentId &&
            student.parentId.toString() === parentUser._id.toString(),
        );

        return {
          _id: parentUser._id,
          userId: {
            _id: parentUser._id,
            name: parentUser.name,
            email: parentUser.email,
            phone: parentUser.phone,
            status: parentUser.status,
          },
          children: children.map((child) => ({
            _id: child._id,
            userId: {
              _id: child._id,
              name: child.name,
              email: child.email,
            },
            classId: null,
            section: null,
            rollNumber: null,
          })),
        };
      });

      res.status(200).json({
        success: true,
        count: parents.length,
        data: parents,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching parents",
        error: error.message,
      });
    }
  }

  /**
   * Link child to parent
   */
  async linkChildToParent(req, res) {
    try {
      const { parentId, studentId } = req.body;

      // Verify parent user exists
      const parentUser = await User.findById(parentId);
      if (!parentUser || parentUser.role !== "parent") {
        return res.status(404).json({
          success: false,
          message: "Parent user not found",
        });
      }

      // Verify student user exists
      const studentUser = await User.findById(studentId);
      if (!studentUser || studentUser.role !== "student") {
        return res.status(404).json({
          success: false,
          message: "Student user not found",
        });
      }

      // Update student's parentId in User model
      studentUser.parentId = parentId;
      await studentUser.save();

      res.status(200).json({
        success: true,
        message: "Child linked to parent successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error linking child to parent",
        error: error.message,
      });
    }
  }

  /**
   * Unlink child from parent
   */
  async unlinkChildFromParent(req, res) {
    try {
      const { parentId, studentId } = req.body;

      // Find student user and remove parentId
      const studentUser = await User.findById(studentId);
      if (studentUser && studentUser.role === "student") {
        studentUser.parentId = null;
        await studentUser.save();
      }

      res.status(200).json({
        success: true,
        message: "Child unlinked from parent successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error unlinking child from parent",
        error: error.message,
      });
    }
  }

  /**
   * Get children by parent ID
   */
  async getChildrenByParentId(req, res) {
    try {
      const { parentId } = req.params;

      const parent = await Parent.findOne({ userId: parentId }).populate({
        path: "children",
        populate: [
          { path: "userId", select: "name email phone" },
          { path: "classId", select: "name section" },
        ],
      });

      if (!parent) {
        return res.status(404).json({
          success: false,
          message: "Parent not found",
        });
      }

      res.status(200).json({
        success: true,
        count: parent.children.length,
        data: parent.children,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching children",
        error: error.message,
      });
    }
  }

  // ============ CLASS TEACHER ASSIGNMENT ============

  /**
   * Assign class teacher
   */
  async assignClassTeacher(req, res) {
    try {
      const { classId, teacherId } = req.body;

      const Class = (await import("../models/class.model.js")).default;

      const classDoc = await Class.findById(classId);
      if (!classDoc) {
        return res.status(404).json({
          success: false,
          message: "Class not found",
        });
      }

      const teacher = await User.findOne({ _id: teacherId, role: "teacher" });
      if (!teacher) {
        return res.status(404).json({
          success: false,
          message: "Teacher not found",
        });
      }

      // Remove class from old teacher's assignedClasses if exists
      if (
        classDoc.classTeacher &&
        classDoc.classTeacher.toString() !== teacherId
      ) {
        await User.findByIdAndUpdate(classDoc.classTeacher, {
          $pull: { assignedClasses: classId },
        });
      }

      classDoc.classTeacher = teacherId;
      await classDoc.save();

      // Add class to new teacher's assigned classes
      await User.findByIdAndUpdate(teacherId, {
        $addToSet: { assignedClasses: classId },
      });

      const updatedClass = await Class.findById(classId).populate(
        "classTeacher",
        "name email phone",
      );

      res.status(200).json({
        success: true,
        message: "Class teacher assigned successfully",
        data: updatedClass,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error assigning class teacher",
        error: error.message,
      });
    }
  }

  /**
   * Remove class teacher
   */
  async removeClassTeacher(req, res) {
    try {
      const { classId } = req.body;

      const Class = (await import("../models/class.model.js")).default;

      const classDoc = await Class.findById(classId);
      if (!classDoc) {
        return res.status(404).json({
          success: false,
          message: "Class not found",
        });
      }

      // Remove class from teacher's assignedClasses
      if (classDoc.classTeacher) {
        await User.findByIdAndUpdate(classDoc.classTeacher, {
          $pull: { assignedClasses: classId },
        });
      }

      classDoc.classTeacher = null;
      await classDoc.save();

      res.status(200).json({
        success: true,
        message: "Class teacher removed successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error removing class teacher",
        error: error.message,
      });
    }
  }

  /**
   * Get all classes with teacher info (for admin assignment page)
   */
  async getAllClassesWithTeachers(req, res) {
    try {
      const Class = (await import("../models/class.model.js")).default;

      const classes = await Class.find({ isActive: true })
        .populate("classTeacher", "name email phone")
        .populate("subjects", "name code")
        .sort({ name: 1, section: 1 });

      res.status(200).json({
        success: true,
        count: classes.length,
        data: classes,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching classes",
        error: error.message,
      });
    }
  }

  // ============ TEACHER SUBJECT ASSIGNMENT ============

  /**
   * Assign teacher to subject
   */
  async assignTeacherToSubject(req, res) {
    try {
      const { subjectId, teacherId } = req.body;

      const Subject = (await import("../models/subject.model.js")).default;

      const subject = await Subject.findById(subjectId);
      if (!subject) {
        return res.status(404).json({
          success: false,
          message: "Subject not found",
        });
      }

      const teacher = await User.findOne({ _id: teacherId, role: "teacher" });
      if (!teacher) {
        return res.status(404).json({
          success: false,
          message: "Teacher not found",
        });
      }

      subject.assignedTeacher = teacherId;
      await subject.save();

      // Add subject to teacher's assigned subjects
      await User.findByIdAndUpdate(teacherId, {
        $addToSet: { assignedSubjects: subjectId },
      });

      res.status(200).json({
        success: true,
        message: "Teacher assigned to subject successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error assigning teacher to subject",
        error: error.message,
      });
    }
  }

  /**
   * Get teacher's assigned classes and subjects
   */
  async getTeacherAssignments(req, res) {
    try {
      const { teacherId } = req.params;

      const teacher = await User.findById(teacherId)
        .populate("assignedClasses", "name section academicYear")
        .populate({
          path: "assignedSubjects",
          populate: { path: "classId", select: "name section" },
        });

      if (!teacher || teacher.role !== "teacher") {
        return res.status(404).json({
          success: false,
          message: "Teacher not found",
        });
      }

      res.status(200).json({
        success: true,
        data: {
          teacher: {
            id: teacher._id,
            name: teacher.name,
            email: teacher.email,
          },
          assignedClasses: teacher.assignedClasses,
          assignedSubjects: teacher.assignedSubjects,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching teacher assignments",
        error: error.message,
      });
    }
  }

  // ============ DASHBOARD DATA ============

  /**
   * Get parent dashboard data (for logged-in parent)
   */
  async getParentDashboardData(req, res) {
    try {
      const { parentId } = req.params;

      const parent = await Parent.findOne({ userId: parentId }).populate({
        path: "children",
        populate: [
          { path: "userId", select: "name email phone status" },
          {
            path: "classId",
            select: "name section academicYear classTeacher subjects",
            populate: [
              { path: "classTeacher", select: "name email phone" },
              { path: "subjects", select: "name code" },
            ],
          },
        ],
      });

      if (!parent) {
        return res.status(404).json({
          success: false,
          message: "Parent not found",
        });
      }

      // Get user info
      const userInfo = await User.findById(parentId).select(
        "name email phone status",
      );

      res.status(200).json({
        success: true,
        data: {
          parent: userInfo,
          parentProfile: parent,
          children: parent.children,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching parent dashboard data",
        error: error.message,
      });
    }
  }

  /**
   * Get student dashboard data (for logged-in student)
   */
  async getStudentDashboardData(req, res) {
    try {
      const { studentId } = req.params;

      const student = await Student.findOne({ userId: studentId })
        .populate("userId", "name email phone status")
        .populate({
          path: "classId",
          populate: [
            { path: "classTeacher", select: "name email phone" },
            { path: "subjects", select: "name code assignedTeacher" },
          ],
        })
        .populate("parentId", "name email phone");

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student not found",
        });
      }

      // Get parent profile with more details
      let parentInfo = null;
      if (student.parentId) {
        const parentProfile = await Parent.findOne({
          userId: student.parentId,
        }).populate("userId", "name email phone");
        parentInfo = parentProfile;
      }

      res.status(200).json({
        success: true,
        data: {
          student,
          classInfo: student.classId,
          classTeacher: student.classId?.classTeacher,
          parentInfo,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching student dashboard data",
        error: error.message,
      });
    }
  }

  /**
   * Get teacher dashboard data (for logged-in teacher)
   */
  async getTeacherDashboardData(req, res) {
    try {
      const { teacherId } = req.params;
      const Class = (await import("../models/class.model.js")).default;
      const Subject = (await import("../models/subject.model.js")).default;

      const teacher = await User.findById(teacherId)
        .select("-password")
        .populate("assignedClasses", "name section academicYear")
        .populate({
          path: "assignedSubjects",
          populate: { path: "classId", select: "name section" },
        });

      if (!teacher || teacher.role !== "teacher") {
        return res.status(404).json({
          success: false,
          message: "Teacher not found",
        });
      }

      // Get classes where this teacher is class teacher
      const classTeacherOf = await Class.find({
        classTeacher: teacherId,
      }).select("name section academicYear");

      // Get student count for assigned classes
      let totalStudents = 0;
      if (teacher.assignedClasses && teacher.assignedClasses.length > 0) {
        const classIds = teacher.assignedClasses.map((c) => c._id);
        totalStudents = await Student.countDocuments({
          classId: { $in: classIds },
        });
      }

      res.status(200).json({
        success: true,
        data: {
          teacher: {
            id: teacher._id,
            name: teacher.name,
            email: teacher.email,
            phone: teacher.phone,
          },
          assignedClasses: teacher.assignedClasses,
          assignedSubjects: teacher.assignedSubjects,
          classTeacherOf,
          totalStudents,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching teacher dashboard data",
        error: error.message,
      });
    }
  }

  /**
   * Get dashboard stats for admin
   */
  async getDashboardStats(req, res) {
    try {
      const Class = (await import("../models/class.model.js")).default;
      const Subject = (await import("../models/subject.model.js")).default;

      const [
        totalUsers,
        totalStudents,
        totalTeachers,
        totalParents,
        totalClasses,
        totalSubjects,
        activeUsers,
        suspendedUsers,
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: "student" }),
        User.countDocuments({ role: "teacher" }),
        User.countDocuments({ role: "parent" }),
        Class.countDocuments({ isActive: true }),
        Subject.countDocuments({ isActive: true }),
        User.countDocuments({ status: "active" }),
        User.countDocuments({ status: "suspended" }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          totalUsers,
          totalStudents,
          totalTeachers,
          totalParents,
          totalClasses,
          totalSubjects,
          activeUsers,
          suspendedUsers,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching dashboard stats",
        error: error.message,
      });
    }
  }
}

export default new AdminController();
