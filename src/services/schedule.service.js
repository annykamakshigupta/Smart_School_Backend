import Schedule from "../models/schedule.model.js";

class ScheduleService {
  /**
   * Check for scheduling conflicts
   * Returns an object with conflict status and details
   */
  async checkConflicts(scheduleData, excludeId = null) {
    const {
      teacherId,
      room,
      classId,
      section,
      dayOfWeek,
      startTime,
      endTime,
      academicYear,
    } = scheduleData;

    const conflicts = [];

    // Helper function to check time overlap
    const hasTimeOverlap = (start1, end1, start2, end2) => {
      const [s1h, s1m] = start1.split(":").map(Number);
      const [e1h, e1m] = end1.split(":").map(Number);
      const [s2h, s2m] = start2.split(":").map(Number);
      const [e2h, e2m] = end2.split(":").map(Number);

      const s1 = s1h * 60 + s1m;
      const e1 = e1h * 60 + e1m;
      const s2 = s2h * 60 + s2m;
      const e2 = e2h * 60 + e2m;

      return s1 < e2 && e1 > s2;
    };

    // Build base query
    const baseQuery = {
      dayOfWeek,
      academicYear,
      isActive: true,
    };

    // Exclude current schedule if updating
    if (excludeId) {
      baseQuery._id = { $ne: excludeId };
    }

    // Check for teacher conflicts
    const teacherSchedules = await Schedule.find({
      ...baseQuery,
      teacherId,
    });

    for (const schedule of teacherSchedules) {
      if (
        hasTimeOverlap(startTime, endTime, schedule.startTime, schedule.endTime)
      ) {
        conflicts.push({
          type: "teacher",
          message: `Teacher is already scheduled in ${schedule.room} from ${schedule.startTime} to ${schedule.endTime}`,
          scheduleId: schedule._id,
        });
      }
    }

    // Check for room conflicts
    const roomSchedules = await Schedule.find({
      ...baseQuery,
      room,
    });

    for (const schedule of roomSchedules) {
      if (
        hasTimeOverlap(startTime, endTime, schedule.startTime, schedule.endTime)
      ) {
        conflicts.push({
          type: "room",
          message: `Room ${room} is already booked from ${schedule.startTime} to ${schedule.endTime}`,
          scheduleId: schedule._id,
        });
      }
    }

    // Check for class conflicts (same class can't have multiple subjects at same time)
    const classSchedules = await Schedule.find({
      ...baseQuery,
      classId,
      section,
    });

    for (const schedule of classSchedules) {
      if (
        hasTimeOverlap(startTime, endTime, schedule.startTime, schedule.endTime)
      ) {
        conflicts.push({
          type: "class",
          message: `Class already has a scheduled subject from ${schedule.startTime} to ${schedule.endTime}`,
          scheduleId: schedule._id,
        });
      }
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * Create a new schedule
   */
  async createSchedule(scheduleData) {
    // Check for conflicts
    const conflictCheck = await this.checkConflicts(scheduleData);

    if (conflictCheck.hasConflict) {
      const error = new Error("Schedule conflicts detected");
      error.statusCode = 409;
      error.conflicts = conflictCheck.conflicts;
      throw error;
    }

    const schedule = new Schedule(scheduleData);
    await schedule.save();

    return await Schedule.findById(schedule._id)
      .populate("classId", "name section academicYear")
      .populate("subjectId", "name code")
      .populate("teacherId", "name email");
  }

  /**
   * Get all schedules with optional filters
   */
  async getSchedules(filters = {}) {
    const query = { isActive: true };

    // Apply filters
    if (filters.classId) query.classId = filters.classId;
    if (filters.section) query.section = filters.section;
    if (filters.teacherId) query.teacherId = filters.teacherId;
    if (filters.dayOfWeek) query.dayOfWeek = filters.dayOfWeek;
    if (filters.academicYear) query.academicYear = filters.academicYear;

    const schedules = await Schedule.find(query)
      .populate("classId", "name section academicYear")
      .populate("subjectId", "name code")
      .populate("teacherId", "name email")
      .sort({ dayOfWeek: 1, startTime: 1 });

    return schedules;
  }

  /**
   * Get schedule by ID
   */
  async getScheduleById(scheduleId) {
    const schedule = await Schedule.findById(scheduleId)
      .populate("classId", "name section academicYear")
      .populate("subjectId", "name code")
      .populate("teacherId", "name email");

    if (!schedule) {
      const error = new Error("Schedule not found");
      error.statusCode = 404;
      throw error;
    }

    return schedule;
  }

  /**
   * Update schedule
   */
  async updateSchedule(scheduleId, updateData) {
    const existingSchedule = await Schedule.findById(scheduleId);

    if (!existingSchedule) {
      const error = new Error("Schedule not found");
      error.statusCode = 404;
      throw error;
    }

    // Merge existing data with updates for conflict check
    const scheduleData = {
      classId: updateData.classId || existingSchedule.classId,
      section: updateData.section || existingSchedule.section,
      subjectId: updateData.subjectId || existingSchedule.subjectId,
      teacherId: updateData.teacherId || existingSchedule.teacherId,
      room: updateData.room || existingSchedule.room,
      dayOfWeek: updateData.dayOfWeek || existingSchedule.dayOfWeek,
      startTime: updateData.startTime || existingSchedule.startTime,
      endTime: updateData.endTime || existingSchedule.endTime,
      academicYear: updateData.academicYear || existingSchedule.academicYear,
    };

    // Check for conflicts (excluding current schedule)
    const conflictCheck = await this.checkConflicts(scheduleData, scheduleId);

    if (conflictCheck.hasConflict) {
      const error = new Error("Schedule conflicts detected");
      error.statusCode = 409;
      error.conflicts = conflictCheck.conflicts;
      throw error;
    }

    Object.assign(existingSchedule, updateData);
    await existingSchedule.save();

    return await Schedule.findById(scheduleId)
      .populate("classId", "name section academicYear")
      .populate("subjectId", "name code")
      .populate("teacherId", "name email");
  }

  /**
   * Delete schedule (soft delete)
   */
  async deleteSchedule(scheduleId) {
    const schedule = await Schedule.findById(scheduleId);

    if (!schedule) {
      const error = new Error("Schedule not found");
      error.statusCode = 404;
      throw error;
    }

    schedule.isActive = false;
    await schedule.save();

    return { message: "Schedule deleted successfully" };
  }

  /**
   * Get weekly schedule for a class
   */
  async getWeeklyScheduleForClass(classId, section, academicYear) {
    const schedules = await this.getSchedules({
      classId,
      section,
      academicYear,
    });

    // Organize by day
    const weeklySchedule = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
    };

    schedules.forEach((schedule) => {
      weeklySchedule[schedule.dayOfWeek].push(schedule);
    });

    return weeklySchedule;
  }

  /**
   * Get weekly schedule for a teacher
   */
  async getWeeklyScheduleForTeacher(teacherId, academicYear) {
    const schedules = await this.getSchedules({ teacherId, academicYear });

    // Organize by day
    const weeklySchedule = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
    };

    schedules.forEach((schedule) => {
      weeklySchedule[schedule.dayOfWeek].push(schedule);
    });

    return weeklySchedule;
  }
}

export default new ScheduleService();
