import { SetMetadata } from '@nestjs/common';

export const DEPARTMENT_ONLY_KEY = 'admin_department_only';

// Marks a route where the functional role IS the control, so SUPER clearance
// does not stand in for it. Use sparingly — this is the only way an action
// becomes genuinely unavailable to a super admin.
export const DepartmentOnly = () => SetMetadata(DEPARTMENT_ONLY_KEY, true);