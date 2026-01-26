import Student from "../models/student.model.js";
import Parent from "../models/parent.model.js";
import Teacher from "../models/teacher.model.js";
import Admin from "../models/admin.model.js";

/**
 * Get role profile for a user
 * Uses the User → profileId → Role Profile pattern
 */
export const getRoleProfile = async (user, populateOptions = {}) => {
  if (!user.profileId) {
    return null;
  }

  let roleProfile = null;

  switch (user.role) {
    case "student":
      roleProfile = await Student.findById(user.profileId)
        .populate(populateOptions.classId !== false ? "classId" : "")
        .populate(populateOptions.parentId !== false ? "parentId" : "");
      break;

    case "parent":
      roleProfile = await Parent.findById(user.profileId).populate(
        populateOptions.children !== false
          ? {
              path: "children",
              populate: [
                { path: "userId", select: "name email phone" },
                { path: "classId", select: "name section" },
              ],
            }
          : "",
      );
      break;

    case "teacher":
      roleProfile = await Teacher.findById(user.profileId)
        .populate(
          populateOptions.assignedClasses !== false ? "assignedClasses" : "",
        )
        .populate(
          populateOptions.assignedSubjects !== false ? "assignedSubjects" : "",
        );
      break;

    case "admin":
      roleProfile = await Admin.findById(user.profileId);
      break;
  }

  return roleProfile;
};

/**
 * Get profile ID directly from user
 * This is the primary access pattern: User.profileId
 */
export const getProfileId = (user) => {
  return user.profileId;
};
