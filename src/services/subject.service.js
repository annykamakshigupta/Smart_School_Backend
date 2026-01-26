import Subject from "../models/subject.model.js";
import Teacher from "../models/teacher.model.js";
import Class from "../models/class.model.js";

class SubjectService {
  // Create a new subject
  async createSubject(subjectData) {
    try {
      // Normalize subject code
      if (subjectData.code) {
        subjectData.code = subjectData.code.trim().toUpperCase();
      }

      // Check if subject code already exists (check both active and inactive)
      const existingSubject = await Subject.findOne({ code: subjectData.code });
      if (existingSubject) {
        throw new Error("Subject with this code already exists");
      }

      // Validate teacher if provided
      if (subjectData.assignedTeacher) {
        const teacher = await Teacher.findById(subjectData.assignedTeacher);
        if (!teacher) {
          throw new Error("Assigned teacher must be a valid teacher");
        }
      }

      // Validate class if provided
      if (subjectData.classId) {
        const classExists = await Class.findById(subjectData.classId);
        if (!classExists) {
          throw new Error("Class not found");
        }
      }

      const newSubject = await Subject.create(subjectData);

      // If classId is provided, add this subject to the class
      if (subjectData.classId) {
        await Class.findByIdAndUpdate(subjectData.classId, {
          $addToSet: { subjects: newSubject._id },
        });
      }

      return await Subject.findById(newSubject._id)
        .populate({
          path: "assignedTeacher",
          select: "employeeCode qualification",
          populate: {
            path: "userId",
            select: "name email phone",
          },
        })
        .populate("classId", "name section");
    } catch (error) {
      throw error;
    }
  }

  // Get all subjects
  async getAllSubjects(filters = {}) {
    try {
      const query = {};

      // Only filter by isActive if explicitly provided, otherwise return all
      if (filters.isActive !== undefined) {
        query.isActive = filters.isActive;
      } else {
        // Default: show only active subjects
        query.isActive = true;
      }

      if (filters.academicYear) {
        query.academicYear = filters.academicYear;
      }

      if (filters.classId) {
        query.classId = filters.classId;
      }

      if (filters.teacherId) {
        query.assignedTeacher = filters.teacherId;
      }

      // If showAll flag is passed, remove the isActive filter to get all subjects
      if (filters.showAll === true || filters.showAll === "true") {
        delete query.isActive;
      }

      const subjects = await Subject.find(query)
        .populate({
          path: "assignedTeacher",
          select: "employeeCode qualification",
          populate: {
            path: "userId",
            select: "name email phone",
          },
        })
        .populate("classId", "name section")
        .sort({ name: 1 });

      return subjects;
    } catch (error) {
      throw error;
    }
  }

  // Get subject by ID
  async getSubjectById(subjectId) {
    try {
      const subject = await Subject.findById(subjectId)
        .populate({
          path: "assignedTeacher",
          select: "employeeCode qualification",
          populate: {
            path: "userId",
            select: "name email phone",
          },
        })
        .populate("classId", "name section academicYear");

      if (!subject) {
        throw new Error("Subject not found");
      }

      return subject;
    } catch (error) {
      throw error;
    }
  }

  // Update subject
  async updateSubject(subjectId, updateData) {
    try {
      // Validate teacher if being updated
      if (updateData.assignedTeacher) {
        const teacher = await Teacher.findById(updateData.assignedTeacher);
        if (!teacher) {
          throw new Error("Assigned teacher must be a valid teacher");
        }
      }

      // Validate class if being updated
      if (updateData.classId) {
        const classExists = await Class.findById(updateData.classId);
        if (!classExists) {
          throw new Error("Class not found");
        }
      }

      // Normalize and check for duplicate code if being updated
      if (updateData.code) {
        updateData.code = updateData.code.trim().toUpperCase();

        const duplicate = await Subject.findOne({
          code: updateData.code,
          _id: { $ne: subjectId },
        });

        if (duplicate) {
          throw new Error("Another subject with this code already exists");
        }
      }

      const currentSubject = await Subject.findById(subjectId);
      if (!currentSubject) {
        throw new Error("Subject not found");
      }

      // If classId is changing, update both old and new classes
      if (
        updateData.classId &&
        updateData.classId !== currentSubject.classId?.toString()
      ) {
        // Remove from old class
        if (currentSubject.classId) {
          await Class.findByIdAndUpdate(currentSubject.classId, {
            $pull: { subjects: subjectId },
          });
        }

        // Add to new class
        await Class.findByIdAndUpdate(updateData.classId, {
          $addToSet: { subjects: subjectId },
        });
      }

      const updatedSubject = await Subject.findByIdAndUpdate(
        subjectId,
        updateData,
        { new: true, runValidators: true },
      )
        .populate({
          path: "assignedTeacher",
          select: "employeeCode qualification",
          populate: {
            path: "userId",
            select: "name email phone",
          },
        })
        .populate("classId", "name section");

      return updatedSubject;
    } catch (error) {
      throw error;
    }
  }

  // Delete subject
  // Delete subject (HARD delete)
  async deleteSubject(subjectId) {
    try {
      const subject = await Subject.findById(subjectId);
      if (!subject) {
        throw new Error("Subject not found");
      }

      // Remove subject from class
      if (subject.classId) {
        await Class.findByIdAndUpdate(subject.classId, {
          $pull: { subjects: subjectId },
        });
      }

      // 🔥 Permanently delete
      await Subject.findByIdAndDelete(subjectId);

      return { message: "Subject permanently deleted" };
    } catch (error) {
      console.error(`❌ Error deleting subject: ${error.message}`);
      throw error;
    }
  }

  // Assign teacher to subject
  async assignTeacher(subjectId, teacherId) {
    try {
      // Validate teacher
      const teacher = await Teacher.findById(teacherId);
      if (!teacher) {
        throw new Error("Must assign a valid teacher");
      }

      const updatedSubject = await Subject.findByIdAndUpdate(
        subjectId,
        { assignedTeacher: teacherId },
        { new: true },
      ).populate({
        path: "assignedTeacher",
        select: "employeeCode qualification",
        populate: {
          path: "userId",
          select: "name email phone",
        },
      });

      if (!updatedSubject) {
        throw new Error("Subject not found");
      }

      return updatedSubject;
    } catch (error) {
      throw error;
    }
  }
}

export default new SubjectService();
