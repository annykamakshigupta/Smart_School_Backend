import scheduleService from "../services/schedule.service.js";

/**
 * Create a new schedule entry
 * @route POST /api/schedules
 * @access Admin only
 */
export const createSchedule = async (req, res) => {
  try {
    const schedule = await scheduleService.createSchedule(req.body);

    res.status(201).json({
      success: true,
      message: "Schedule created successfully",
      data: schedule,
    });
  } catch (error) {
    if (error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
        conflicts: error.conflicts,
      });
    }

    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to create schedule",
    });
  }
};

/**
 * Get all schedules with optional filters
 * @route GET /api/schedules
 * @access All authenticated users (filtered by role)
 */
export const getSchedules = async (req, res) => {
  try {
    const filters = {};
    const userRole = req.user.role;

    // Apply role-based filtering
    if (userRole === "teacher") {
      filters.teacherId = req.user._id;
    } else if (userRole === "student") {
      // Assuming student has classId and section in their profile
      filters.classId = req.user.classId;
      filters.section = req.user.section;
    } else if (userRole === "parent") {
      // Parents should see their children's schedules
      // This would require additional logic to fetch children's class info
      // For now, we'll allow query params
    }

    // Allow query parameters for additional filtering
    if (req.query.classId) filters.classId = req.query.classId;
    if (req.query.section) filters.section = req.query.section;
    if (req.query.teacherId && userRole === "admin")
      filters.teacherId = req.query.teacherId;
    if (req.query.dayOfWeek) filters.dayOfWeek = req.query.dayOfWeek;
    if (req.query.academicYear) filters.academicYear = req.query.academicYear;

    const schedules = await scheduleService.getSchedules(filters);

    res.status(200).json({
      success: true,
      count: schedules.length,
      data: schedules,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch schedules",
    });
  }
};

/**
 * Get a single schedule by ID
 * @route GET /api/schedules/:id
 * @access All authenticated users
 */
export const getScheduleById = async (req, res) => {
  try {
    const schedule = await scheduleService.getScheduleById(req.params.id);

    res.status(200).json({
      success: true,
      data: schedule,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch schedule",
    });
  }
};

/**
 * Update a schedule
 * @route PUT /api/schedules/:id
 * @access Admin only
 */
export const updateSchedule = async (req, res) => {
  try {
    const schedule = await scheduleService.updateSchedule(
      req.params.id,
      req.body
    );

    res.status(200).json({
      success: true,
      message: "Schedule updated successfully",
      data: schedule,
    });
  } catch (error) {
    if (error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
        conflicts: error.conflicts,
      });
    }

    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to update schedule",
    });
  }
};

/**
 * Delete a schedule
 * @route DELETE /api/schedules/:id
 * @access Admin only
 */
export const deleteSchedule = async (req, res) => {
  try {
    const result = await scheduleService.deleteSchedule(req.params.id);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to delete schedule",
    });
  }
};

/**
 * Get weekly schedule for a class
 * @route GET /api/schedules/class/:classId/section/:section
 * @access All authenticated users
 */
export const getWeeklyScheduleForClass = async (req, res) => {
  try {
    const { classId, section } = req.params;
    const academicYear =
      req.query.academicYear ||
      new Date().getFullYear() + "-" + (new Date().getFullYear() + 1);

    const weeklySchedule = await scheduleService.getWeeklyScheduleForClass(
      classId,
      section,
      academicYear
    );

    res.status(200).json({
      success: true,
      data: weeklySchedule,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch weekly schedule",
    });
  }
};

/**
 * Get weekly schedule for a teacher
 * @route GET /api/schedules/teacher/:teacherId
 * @access Teachers and Admin
 */
export const getWeeklyScheduleForTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const academicYear =
      req.query.academicYear ||
      new Date().getFullYear() + "-" + (new Date().getFullYear() + 1);

    // Only allow teachers to view their own schedule (unless admin)
    if (req.user.role === "teacher" && req.user._id.toString() !== teacherId) {
      return res.status(403).json({
        success: false,
        message: "You can only view your own schedule",
      });
    }

    const weeklySchedule = await scheduleService.getWeeklyScheduleForTeacher(
      teacherId,
      academicYear
    );

    res.status(200).json({
      success: true,
      data: weeklySchedule,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch weekly schedule",
    });
  }
};
