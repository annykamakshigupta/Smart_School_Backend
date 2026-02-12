import Exam from "../models/exam.model.js";
import ExamSubject from "../models/examSubject.model.js";
import Result from "../models/result.model.js";
import Student from "../models/student.model.js";
import Subject from "../models/subject.model.js";
import Class from "../models/class.model.js";
import Schedule from "../models/schedule.model.js";

class ExamResultService {
  async createExam(data) {
    const exam = await Exam.create(data);
    return Exam.findById(exam._id)
      .populate("classes", "name section academicYear")
      .populate("createdBy", "name");
  }

  async getAllExams(filters = {}) {
    const query = {};
    if (filters.academicYear) query.academicYear = filters.academicYear;
    if (filters.examType) query.examType = filters.examType;
    if (filters.status) query.status = filters.status;
    if (filters.classId) query.classes = filters.classId;

    return Exam.find(query)
      .populate("classes", "name section academicYear")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });
  }

  async getExamById(id) {
    return Exam.findById(id)
      .populate("classes", "name section academicYear")
      .populate("createdBy", "name");
  }

  async updateExam(id, data) {
    const exam = await Exam.findByIdAndUpdate(id, data, { new: true })
      .populate("classes", "name section academicYear")
      .populate("createdBy", "name");
    return exam;
  }

  async deleteExam(id) {
    await ExamSubject.deleteMany({ examId: id });
    await Result.deleteMany({ examId: id });
    return Exam.findByIdAndDelete(id);
  }

  async addExamSubjects(examId, subjects) {
    const created = [];
    for (const sub of subjects) {
      const es = await ExamSubject.create({ examId, ...sub });
      created.push(es);
    }
    return ExamSubject.find({ examId })
      .populate("subjectId", "name code")
      .populate("classId", "name section");
  }

  async getExamSubjects(examId, classId, teacherId = null) {
    const query = { examId };
    if (classId) query.classId = classId;

    // Teacher should only see subjects they actually teach in that class.
    if (teacherId) {
      const scheduleQuery = { teacherId, isActive: true };
      if (classId) scheduleQuery.classId = classId;

      const schedules = await Schedule.find(scheduleQuery)
        .select("classId subjectId")
        .lean();

      const pairs = schedules
        .filter((s) => s.classId && s.subjectId)
        .map((s) => ({ classId: s.classId, subjectId: s.subjectId }));

      if (!pairs.length) {
        return [];
      }

      query.$or = pairs;
    }

    return ExamSubject.find(query)
      .populate("subjectId", "name code")
      .populate("classId", "name section")
      .populate({
        path: "submittedBy",
        select: "employeeCode",
        populate: { path: "userId", select: "name" },
      });
  }

  async updateExamSubject(id, data) {
    return ExamSubject.findByIdAndUpdate(id, data, { new: true })
      .populate("subjectId", "name code")
      .populate("classId", "name section");
  }

  async enterMarks(examId, examSubjectId, marks, teacherId) {
    const examSubject = await ExamSubject.findById(examSubjectId);
    if (!examSubject) throw new Error("Exam subject not found");

    // If a teacher is submitting, ensure they are assigned to this class+subject
    if (teacherId) {
      const schedule = await Schedule.findOne({
        teacherId,
        classId: examSubject.classId,
        subjectId: examSubject.subjectId,
        isActive: true,
      }).select("_id");

      if (!schedule) {
        throw new Error(
          "You are not assigned to teach this subject in this class",
        );
      }
    }

    if (examSubject.marksEntryStatus === "approved") {
      throw new Error("Marks already approved, cannot modify");
    }

    const results = [];
    const errors = [];

    for (const m of marks) {
      try {
        let result = await Result.findOne({
          examId,
          studentId: m.studentId,
          subjectId: examSubject.subjectId,
          classId: examSubject.classId,
        });

        if (result) {
          if (result.isPublished) {
            errors.push({
              studentId: m.studentId,
              message: "Result published, cannot modify",
            });
            continue;
          }
          result.marksObtained = m.marksObtained;
          result.remarks = m.remarks || result.remarks;
          await result.save();
        } else {
          const exam = await Exam.findById(examId);
          result = await Result.create({
            examId,
            studentId: m.studentId,
            subjectId: examSubject.subjectId,
            classId: examSubject.classId,
            examType: exam.examType,
            examName: exam.name,
            marksObtained: m.marksObtained,
            maxMarks: examSubject.maxMarks,
            passingMarks: examSubject.passingMarks,
            academicYear: exam.academicYear,
            enteredBy: teacherId,
            remarks: m.remarks || null,
          });
        }
        results.push(result);
      } catch (err) {
        errors.push({ studentId: m.studentId, message: err.message });
      }
    }

    examSubject.marksEntryStatus = "draft";
    if (teacherId) examSubject.submittedBy = teacherId;
    await examSubject.save();

    return { results, errors };
  }

  async submitMarksForApproval(examSubjectId, teacherId) {
    const es = await ExamSubject.findById(examSubjectId);
    if (!es) throw new Error("Exam subject not found");

    if (teacherId) {
      const schedule = await Schedule.findOne({
        teacherId,
        classId: es.classId,
        subjectId: es.subjectId,
        isActive: true,
      }).select("_id");

      if (!schedule) {
        throw new Error(
          "You are not assigned to teach this subject in this class",
        );
      }
    }

    es.marksEntryStatus = "submitted";
    es.submittedBy = teacherId;
    es.submittedAt = new Date();
    await es.save();
    return es;
  }

  async approveMarks(examSubjectId, adminUserId) {
    const es = await ExamSubject.findById(examSubjectId);
    if (!es) throw new Error("Exam subject not found");
    if (es.marksEntryStatus !== "submitted") {
      throw new Error("Marks must be submitted before approval");
    }
    es.marksEntryStatus = "approved";
    es.approvedBy = adminUserId;
    es.approvedAt = new Date();
    await es.save();
    return es;
  }

  async rejectMarks(examSubjectId) {
    const es = await ExamSubject.findById(examSubjectId);
    if (!es) throw new Error("Exam subject not found");
    es.marksEntryStatus = "draft";
    es.approvedBy = null;
    es.approvedAt = null;
    await es.save();
    return es;
  }

  async publishExamResults(examId, classId) {
    const query = { examId };
    if (classId) query.classId = classId;
    const now = new Date();
    const result = await Result.updateMany(query, {
      isPublished: true,
      publishedAt: now,
    });
    return result;
  }

  async unpublishExamResults(examId, classId) {
    const query = { examId };
    if (classId) query.classId = classId;
    const result = await Result.updateMany(query, {
      isPublished: false,
      publishedAt: null,
    });
    return result;
  }

  async getExamResults(examId, classId, subjectId) {
    const query = { examId };
    if (classId) query.classId = classId;
    if (subjectId) query.subjectId = subjectId;

    return Result.find(query)
      .populate({
        path: "studentId",
        select: "admissionNumber rollNumber section",
        populate: { path: "userId", select: "name email" },
      })
      .populate("subjectId", "name code")
      .populate("classId", "name section")
      .sort({ "studentId.rollNumber": 1 });
  }

  async getStudentExamResults(studentId, examId) {
    const query = { studentId };
    if (examId) query.examId = examId;

    return Result.find(query)
      .populate("subjectId", "name code")
      .populate("classId", "name section")
      .populate("examId", "name examType startDate endDate")
      .sort({ createdAt: -1 });
  }

  async getClassAnalytics(examId, classId) {
    const results = await Result.find({ examId, classId })
      .populate("subjectId", "name code")
      .populate({
        path: "studentId",
        select: "rollNumber",
        populate: { path: "userId", select: "name" },
      });

    if (!results.length) return null;

    const subjectMap = {};
    const studentMap = {};

    for (const r of results) {
      const subKey = r.subjectId?._id?.toString();
      if (!subjectMap[subKey]) {
        subjectMap[subKey] = {
          subject: r.subjectId,
          totalStudents: 0,
          totalMarks: 0,
          maxMarks: r.maxMarks,
          passCount: 0,
          failCount: 0,
          highest: 0,
          lowest: r.maxMarks,
          grades: {},
        };
      }
      const s = subjectMap[subKey];
      s.totalStudents++;
      s.totalMarks += r.marksObtained;
      if (r.isPassed) s.passCount++;
      else s.failCount++;
      if (r.marksObtained > s.highest) s.highest = r.marksObtained;
      if (r.marksObtained < s.lowest) s.lowest = r.marksObtained;
      s.grades[r.grade] = (s.grades[r.grade] || 0) + 1;

      const stuKey = r.studentId?._id?.toString();
      if (!studentMap[stuKey]) {
        studentMap[stuKey] = {
          student: r.studentId,
          totalMarks: 0,
          totalMaxMarks: 0,
          subjects: 0,
          allPassed: true,
        };
      }
      const st = studentMap[stuKey];
      st.totalMarks += r.marksObtained;
      st.totalMaxMarks += r.maxMarks;
      st.subjects++;
      if (!r.isPassed) st.allPassed = false;
    }

    const subjectAnalytics = Object.values(subjectMap).map((s) => ({
      ...s,
      average: (s.totalMarks / s.totalStudents).toFixed(2),
      passPercentage: ((s.passCount / s.totalStudents) * 100).toFixed(1),
    }));

    const studentRanking = Object.values(studentMap)
      .map((st) => ({
        ...st,
        percentage: ((st.totalMarks / st.totalMaxMarks) * 100).toFixed(2),
        overallGrade: getGrade((st.totalMarks / st.totalMaxMarks) * 100),
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .map((st, i) => ({ ...st, rank: i + 1 }));

    const allPercentages = studentRanking.map((s) => parseFloat(s.percentage));
    const overallAvg =
      allPercentages.reduce((a, b) => a + b, 0) / allPercentages.length;

    return {
      subjectAnalytics,
      studentRanking,
      overview: {
        totalStudents: studentRanking.length,
        overallAverage: overallAvg.toFixed(2),
        highestPercentage: Math.max(...allPercentages).toFixed(2),
        lowestPercentage: Math.min(...allPercentages).toFixed(2),
        passCount: studentRanking.filter((s) => s.allPassed).length,
        failCount: studentRanking.filter((s) => !s.allPassed).length,
      },
    };
  }

  async getApprovalQueue() {
    return ExamSubject.find({ marksEntryStatus: "submitted" })
      .populate("examId", "name examType academicYear")
      .populate("subjectId", "name code")
      .populate("classId", "name section")
      .populate({
        path: "submittedBy",
        select: "employeeCode",
        populate: { path: "userId", select: "name" },
      })
      .sort({ submittedAt: -1 });
  }

  async getReportCardData(studentId, examId) {
    const student = await Student.findById(studentId)
      .populate("userId", "name email phone")
      .populate("classId", "name section academicYear");

    if (!student) throw new Error("Student not found");

    const query = { studentId, isPublished: true };
    if (examId) query.examId = examId;

    const results = await Result.find(query)
      .populate("subjectId", "name code credits")
      .populate("examId", "name examType")
      .sort({ "subjectId.name": 1 });

    if (!results.length) return { student, results: [], summary: null };

    const totalMarks = results.reduce((s, r) => s + r.marksObtained, 0);
    const totalMaxMarks = results.reduce((s, r) => s + r.maxMarks, 0);
    const overallPercentage = (totalMarks / totalMaxMarks) * 100;
    const allPassed = results.every((r) => r.isPassed);

    return {
      student,
      results,
      summary: {
        totalMarks,
        totalMaxMarks,
        overallPercentage: overallPercentage.toFixed(2),
        overallGrade: getGrade(overallPercentage),
        totalSubjects: results.length,
        passedSubjects: results.filter((r) => r.isPassed).length,
        failedSubjects: results.filter((r) => !r.isPassed).length,
        result: allPassed ? "PASS" : "FAIL",
      },
    };
  }
}

function getGrade(pct) {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C+";
  if (pct >= 40) return "C";
  if (pct >= 33) return "D";
  return "F";
}

export default new ExamResultService();
