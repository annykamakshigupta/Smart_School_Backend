import Class from "../models/class.model.js";
import Teacher from "../models/teacher.model.js";

class ClassService {
  // Create a new class
  async createClass(classData) {
    try {
      // Check if class already exists
      const existingClass = await Class.findOne({
        name: classData.name,
        section: classData.section,
        academicYear: classData.academicYear,
      });

      if (existingClass) {
        throw new Error(
          "Class with this name, section, and academic year already exists",
        );
      }

      // If classTeacher is provided, validate it's a valid teacher
      if (classData.classTeacher) {
        const teacher = await Teacher.findById(classData.classTeacher);
        if (!teacher) {
          throw new Error("Class teacher must be a valid teacher");
        }
      }

      const newClass = await Class.create(classData);
      return await Class.findById(newClass._id).populate({
        path: "classTeacher",
        select: "employeeCode qualification",
        populate: {
          path: "userId",
          select: "name email phone",
        },
      });
    } catch (error) {
      throw error;
    }
  }

  // Get all classes
  async getAllClasses(filters = {}) {
    try {
      const query = { isActive: true };

      if (filters.academicYear) {
        query.academicYear = filters.academicYear;
      }

      if (filters.name) {
        query.name = filters.name;
      }

      const classes = await Class.find(query)
        .populate({
          path: "classTeacher",
          select: "employeeCode qualification",
          populate: {
            path: "userId",
            select: "name email phone",
          },
        })
        .populate({
          path: "subjects",
          select: "name code",
          populate: {
            path: "assignedTeacher",
            select: "employeeCode",
            populate: {
              path: "userId",
              select: "name email",
            },
          },
        })
        .sort({ name: 1, section: 1 });

      return classes;
    } catch (error) {
      throw error;
    }
  }

  // Get class by ID
  async getClassById(classId) {
    try {
      const classData = await Class.findById(classId)
        .populate({
          path: "classTeacher",
          select: "employeeCode qualification",
          populate: {
            path: "userId",
            select: "name email phone",
          },
        })
        .populate({
          path: "subjects",
          select: "name code",
          populate: {
            path: "assignedTeacher",
            select: "employeeCode",
            populate: {
              path: "userId",
              select: "name email",
            },
          },
        });

      if (!classData) {
        throw new Error("Class not found");
      }

      return classData;
    } catch (error) {
      throw error;
    }
  }

  // Update class
  async updateClass(classId, updateData) {
    try {
      // If updating classTeacher, validate it's a valid teacher
      if (updateData.classTeacher) {
        const teacher = await Teacher.findById(updateData.classTeacher);
        if (!teacher) {
          throw new Error("Class teacher must be a valid teacher");
        }
      }

      // Check for duplicate if name, section, or year is being updated
      if (updateData.name || updateData.section || updateData.academicYear) {
        const currentClass = await Class.findById(classId);
        const checkData = {
          name: updateData.name || currentClass.name,
          section: updateData.section || currentClass.section,
          academicYear: updateData.academicYear || currentClass.academicYear,
        };

        const duplicate = await Class.findOne({
          ...checkData,
          _id: { $ne: classId },
        });

        if (duplicate) {
          throw new Error(
            "Another class with this name, section, and academic year already exists",
          );
        }
      }

      const updatedClass = await Class.findByIdAndUpdate(classId, updateData, {
        new: true,
        runValidators: true,
      })
        .populate({
          path: "classTeacher",
          select: "employeeCode qualification",
          populate: {
            path: "userId",
            select: "name email phone",
          },
        })
        .populate({
          path: "subjects",
          select: "name code",
          populate: {
            path: "assignedTeacher",
            select: "employeeCode",
            populate: {
              path: "userId",
              select: "name email",
            },
          },
        });

      if (!updatedClass) {
        throw new Error("Class not found");
      }

      return updatedClass;
    } catch (error) {
      throw error;
    }
  }

  // Delete class (soft delete)
  async deleteClass(classId) {
    try {
      const classToDelete = await Class.findById(classId);
      if (!classToDelete) {
        throw new Error("Class not found");
      }

      // ...existing code...
      `🗑️  Deleting class: ${classToDelete.name} - ${classToDelete.section}`;

      // ...existing code...
      // ...existing code...

      const deletedClass = await Class.findByIdAndUpdate(
        classId,
        { isActive: false },
        { new: true },
      );

      if (!deletedClass) {
        throw new Error("Class not found");
      }

      // ...existing code...
      // ...existing code...

      return deletedClass;
    } catch (error) {
      console.error(`❌ Error deleting class: ${error.message}`);
      throw error;
    }
  }

  // Assign subjects to class
  async assignSubjects(classId, subjectIds) {
    try {
      const updatedClass = await Class.findByIdAndUpdate(
        classId,
        { $addToSet: { subjects: { $each: subjectIds } } },
        { new: true },
      ).populate("subjects", "name code");

      if (!updatedClass) {
        throw new Error("Class not found");
      }

      return updatedClass;
    } catch (error) {
      throw error;
    }
  }

  // Remove subject from class
  async removeSubject(classId, subjectId) {
    try {
      const updatedClass = await Class.findByIdAndUpdate(
        classId,
        { $pull: { subjects: subjectId } },
        { new: true },
      ).populate("subjects", "name code");

      if (!updatedClass) {
        throw new Error("Class not found");
      }

      return updatedClass;
    } catch (error) {
      throw error;
    }
  }
}

export default new ClassService();
