import Subject from "../models/subject.model.js";
import Teacher from "../models/teacher.model.js";
import Class from "../models/class.model.js";
import {
  normalizeOptionalObjectId,
  resolveTeacherProfile,
} from "../utils/profileHelper.js";

class SubjectService {
  // Create a new subject
  async createSubject(subjectData) {
    try {
      const data = { ...subjectData };

      // Normalize subject code
      if (data.code) {
        data.code = data.code.trim().toUpperCase();
      }

      // Normalize optional ObjectId inputs (avoid "Cast to ObjectId failed" when UI sends "")
      data.assignedTeacher = normalizeOptionalObjectId(data.assignedTeacher);
      data.classId = normalizeOptionalObjectId(data.classId);

      if (data.assignedTeacher === undefined) {
        delete data.assignedTeacher;
      }
      if (data.classId === undefined) {
        delete data.classId;
      }

      // Check if subject code already exists (check both active and inactive)
      const existingSubject = await Subject.findOne({ code: data.code });
      if (existingSubject) {
        throw new Error("Subject with this code already exists");
      }

      // Validate teacher if provided
      if (data.assignedTeacher) {
        const teacher = await resolveTeacherProfile(data.assignedTeacher);
        if (!teacher) {
          throw new Error("Assigned teacher must be a valid teacher");
        }

        // Always store Teacher profile _id
        data.assignedTeacher = teacher._id;
      }

      // Validate class if provided
      if (data.classId) {
        const classExists = await Class.findById(data.classId);
        if (!classExists) {
          throw new Error("Class not found");
        }
      }

      const newSubject = await Subject.create(data);

      // If classId is provided, add this subject to the class
      if (data.classId) {
        await Class.findByIdAndUpdate(data.classId, {
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
        const teacher = await resolveTeacherProfile(filters.teacherId);
        query.assignedTeacher = teacher ? teacher._id : filters.teacherId;
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
      const data = { ...updateData };

      data.assignedTeacher = normalizeOptionalObjectId(data.assignedTeacher);
      data.classId = normalizeOptionalObjectId(data.classId);

      if (data.assignedTeacher === undefined) {
        delete data.assignedTeacher;
      }
      if (data.classId === undefined) {
        delete data.classId;
      }

      // Validate teacher if being updated
      if (data.assignedTeacher) {
        const teacher = await resolveTeacherProfile(data.assignedTeacher);
        if (!teacher) {
          throw new Error("Assigned teacher must be a valid teacher");
        }

        data.assignedTeacher = teacher._id;
      }

      // Validate class if being updated
      if (data.classId) {
        const classExists = await Class.findById(data.classId);
        if (!classExists) {
          throw new Error("Class not found");
        }
      }

      // Normalize and check for duplicate code if being updated
      if (data.code) {
        data.code = data.code.trim().toUpperCase();

        const duplicate = await Subject.findOne({
          code: data.code,
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
      if (data.classId && data.classId !== currentSubject.classId?.toString()) {
        // Remove from old class
        if (currentSubject.classId) {
          await Class.findByIdAndUpdate(currentSubject.classId, {
            $pull: { subjects: subjectId },
          });
        }

        // Add to new class
        await Class.findByIdAndUpdate(data.classId, {
          $addToSet: { subjects: subjectId },
        });
      }

      const updatedSubject = await Subject.findByIdAndUpdate(subjectId, data, {
        new: true,
        runValidators: true,
      })
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
      if (!teacherId) {
        throw new Error("Must assign a valid teacher");
      }

      // Validate teacher
      const teacher = await resolveTeacherProfile(teacherId);
      if (!teacher) {
        throw new Error("Must assign a valid teacher");
      }

      const updatedSubject = await Subject.findByIdAndUpdate(
        subjectId,
        { assignedTeacher: teacher._id },
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
