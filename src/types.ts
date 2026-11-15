export type UserRole = 'director' | 'supervisor' | 'staff';
export type VisibilityLevel = 'public' | 'restricted';
export type EmployeeStatus = 'active' | 'on_leave' | 'mission' | 'suspended';
export type EmployeeShift = 'morning' | 'evening' | 'night' | 'on_call';
export type DecisionType = 'promotion' | 'transfer' | 'commendation' | 'directive' | 'suspension';

export type AuditAction =
  | 'create_employee'
  | 'update_employee'
  | 'delete_employee'
  | 'promote_employee'
  | 'create_department'
  | 'delete_department'
  | 'create_rank'
  | 'update_rank'
  | 'delete_rank'
  | 'issue_decision'
  | 'grant_admin'
  | 'revoke_admin'
  | 'seed_registry'
  | 'discord_sync'
  | 'update_discord_mapping';

export type AuditTargetType =
  | 'employee'
  | 'department'
  | 'rank'
  | 'decision'
  | 'admin'
  | 'system'
  | 'discord';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  employeeCode?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface AdminRecord {
  uid: string;
  email: string;
  displayName: string;
  rankTitle: string;
  grantedBy: string;
  createdAt: unknown;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  sector: string;
  headName: string;
  headCode: string;
  facility: string;
  visibility: VisibilityLevel;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  rank: string;
  rankLevel: number;
  departmentId: string;
  departmentName: string;
  specialization: string;
  facility: string;
  status: EmployeeStatus;
  shift: EmployeeShift;
  extension: string;
  hireDate: string;
  visibility: VisibilityLevel;
  notes: string;
  discordId?: string;
  discordUsername?: string;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface DiscordRoleMapping {
  id: string;
  guildId: string;
  discordRoleId: string;
  discordRoleName: string;
  rank: string;
  rankLevel: number;
  departmentId: string;
  departmentName: string;
  autoSync: boolean;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface DirectorDecision {
  id: string;
  decisionNumber: string;
  title: string;
  type: DecisionType;
  targetEmployeeId: string;
  targetEmployeeName: string;
  targetEmployeeCode: string;
  previousRank: string;
  newRank: string;
  effectiveDate: string;
  summary: string;
  issuedBy: string;
  issuedByName: string;
  createdAt: unknown;
}

export interface RankTierConfig {
  id: string;
  level: number;
  title: string;
  category: string;
  codeRange: string;
  authorityScope: string;
  discordRoleId?: string;
  visibility: VisibilityLevel;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface AuditLog {
  id: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  targetName: string;
  targetCode: string;
  details: string;
  actorUid: string;
  actorName: string;
  createdAt: unknown;
}

export interface DiscordSessionUser {
  id: string;
  username: string;
  globalName: string;
  serverNick?: string | null;
  displayName?: string;
  avatarUrl: string | null;
  guildId: string | null;
  guildName?: string | null;
  roleIds: string[];
  roleNames?: DiscordGuildRole[];
  isDirector?: boolean;
  isAdmin?: boolean;
  canManageVisibleRoles?: boolean;
  verifiedAt: string;
}

export interface DiscordGuildRole {
  id: string;
  name: string;
  colorHex: string;
  position: number;
  isAdminRole?: boolean;
}

export interface DiscordGuildMember {
  id: string;
  username: string;
  displayName: string;
  nick: string | null;
  avatarUrl?: string | null;
  roles: string[];
  roleObjects?: DiscordGuildRole[];
  joinedAt: string;
}

export interface VisibleDiscordRoleConfig {
  roleId: string;
  departmentName?: string;
}

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: 'على رأس العمل',
  on_leave: 'إجازة رسمية',
  mission: 'مهمة ميدانية',
  suspended: 'موقوف عن العمل',
};

export const EMPLOYEE_SHIFT_LABELS: Record<EmployeeShift, string> = {
  morning: 'الفترة الصباحية',
  evening: 'الفترة المسائية',
  night: 'المناوبة الليلية',
  on_call: 'جاهزية واستدعاء',
};

export const DECISION_TYPE_LABELS: Record<DecisionType, string> = {
  promotion: 'قرار ترقية',
  transfer: 'قرار نقل وتكليف',
  commendation: 'خطاب شكر وتقدير',
  directive: 'توجيه إداري',
  suspension: 'إيقاف احترازي',
};

export const VALIDATION_PATTERNS = {
  id: /^[a-zA-Z0-9_-]+$/,
  employeeCode: /^MOH-[A-Z0-9-]+$/,
  deptCode: /^[A-Z0-9-]+$/,
  decisionNumber: /^DEC-[0-9]{4}-[0-9]+$/,
  extension: /^[0-9-]+$/,
  date: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
  numericId: /^[0-9]+$/,
};

export function createSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
}

export function sanitizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}
