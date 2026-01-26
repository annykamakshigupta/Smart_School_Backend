import User from "../models/user.model.js";
import Student from "../models/student.model.js";
import Parent from "../models/parent.model.js";
import Teacher from "../models/teacher.model.js";
import Admin from "../models/admin.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

/**
 * Generate unique admission number for students
 */
const generateAdmissionNumber = async () => {
  const year = new Date().getFullYear().toString().slice(-2);
  const count = await Student.countDocuments();
  return `ADM${year}${(count + 1).toString().padStart(5, "0")}`;
};

/**
 * Generate unique employee code for teachers
 */
const generateEmployeeCode = async () => {
  const year = new Date().getFullYear().toString().slice(-2);
  const count = await Teacher.countDocuments();
  return `EMP${year}${(count + 1).toString().padStart(4, "0")}`;
};

/**
 * User Signup
 * Creates user and corresponding role-specific profile
 */
export const signup = async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role || !phone) {
      return res.status(400).json({
        success: false,
        message: "All fields are required: name, email, password, role, phone",
      });
    }

    // Validate role
    if (!["student", "parent", "teacher", "admin"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role specified",
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

    // Create user first (without profileId)
    const user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      phone,
      status: "active",
    });
    await user.save();

    // Create role-specific profile based on role
    let roleProfile = null;
    let profileModel = null;

    switch (role) {
      case "student":
        const admissionNumber = await generateAdmissionNumber();
        roleProfile = await Student.create({
          userId: user._id,
          admissionNumber,
          academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
        });
        profileModel = "Student";
        break;

      case "parent":
        roleProfile = await Parent.create({
          userId: user._id,
          children: [],
        });
        profileModel = "Parent";
        break;

      case "teacher":
        const employeeCode = await generateEmployeeCode();
        roleProfile = await Teacher.create({
          userId: user._id,
          employeeCode,
        });
        profileModel = "Teacher";
        break;

      case "admin":
        roleProfile = await Admin.create({
          userId: user._id,
          adminLevel: "normal",
        });
        profileModel = "Admin";
        break;
    }

    // Update user with profileId and profileModel (establishing 1-to-1 link)
    user.profileId = roleProfile._id;
    user.profileModel = profileModel;
    await user.save();

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: user.toPublicJSON(),
        roleProfile,
      },
    });
  } catch (err) {
    // Rollback user creation if role profile fails
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

/**
 * User Login
 * Authenticates user and fetches role-specific data
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check account status
    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: `Account is ${user.status}. Please contact administrator.`,
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role, profileId: user.profileId },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    // Fetch role-specific profile using profileId from User model
    let roleProfile = null;

    if (user.profileId) {
      switch (user.role) {
        case "student":
          roleProfile = await Student.findById(user.profileId)
            .populate("classId", "name section academicYear")
            .populate("parentId");
          break;
        case "parent":
          roleProfile = await Parent.findById(user.profileId).populate({
            path: "children",
            populate: [
              { path: "userId", select: "name email phone" },
              { path: "classId", select: "name section" },
            ],
          });
          break;
        case "teacher":
          roleProfile = await Teacher.findById(user.profileId)
            .populate("assignedClasses", "name section")
            .populate("assignedSubjects", "name code");
          break;
        case "admin":
          roleProfile = await Admin.findById(user.profileId);
          break;
      }
    }

    res.json({
      success: true,
      token,
      user: user.toPublicJSON(),
      roleProfile,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

/**
 * Get users by role
 */
export const getUsersByRole = async (req, res) => {
  try {
    const { role } = req.query;

    const query = { status: "active" };
    if (role) {
      query.role = role;
    }

    const users = await User.find(query).select("_id name email role phone");

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching users",
      error: error.message,
    });
  }
};

/**
 * Get current authenticated user with role profile
 */
export const getCurrentUser = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const user = req.user;

    // Fetch role-specific profile using profileId
    let roleProfile = null;

    if (user.profileId) {
      switch (user.role) {
        case "student":
          roleProfile = await Student.findById(user.profileId)
            .populate("classId", "name section academicYear")
            .populate({
              path: "parentId",
              populate: { path: "userId", select: "name email phone" },
            });
          break;
        case "parent":
          roleProfile = await Parent.findById(user.profileId).populate({
            path: "children",
            populate: [
              { path: "userId", select: "name email phone" },
              { path: "classId", select: "name section" },
            ],
          });
          break;
        case "teacher":
          roleProfile = await Teacher.findById(user.profileId)
            .populate("assignedClasses", "name section academicYear")
            .populate({
              path: "assignedSubjects",
              populate: { path: "classId", select: "name section" },
            });
          break;
        case "admin":
          roleProfile = await Admin.findById(user.profileId);
          break;
      }
    }

    return res.status(200).json({
      success: true,
      user: user.toPublicJSON
        ? user.toPublicJSON()
        : {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            profileId: user.profileId,
            profileModel: user.profileModel,
            phone: user.phone,
            status: user.status,
          },
      roleProfile,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to get current user",
      error: error.message,
    });
  }
};
