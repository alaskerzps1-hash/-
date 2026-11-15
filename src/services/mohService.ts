import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  AuditAction,
  AuditTargetType,
  createSafeId,
  DecisionType,
  Employee,
  EmployeeShift,
  EmployeeStatus,
  sanitizeCode,
  VisibilityLevel,
} from '../types';

interface ActorContext {
  uid: string;
  name: string;
}

function buildAuditEntry(
  action: AuditAction,
  targetType: AuditTargetType,
  targetId: string,
  targetName: string,
  targetCode: string,
  details: string,
  actor: ActorContext
) {
  const logId = createSafeId('log');
  return {
    id: logId,
    action,
    targetType,
    targetId: targetId.slice(0, 64),
    targetName: targetName.slice(0, 140),
    targetCode: targetCode.slice(0, 32),
    details: details.slice(0, 500),
    actorUid: actor.uid,
    actorName: actor.name.slice(0, 120) || 'مدير النظام',
    createdAt: serverTimestamp(),
  };
}

export interface SaveEmployeeInput {
  id?: string;
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
}

export async function saveEmployeeRecord(
  input: SaveEmployeeInput,
  actor: ActorContext
): Promise<string> {
  const isEdit = Boolean(input.id);
  const empId = input.id || createSafeId('emp');
  const normalizedCode = sanitizeCode(input.employeeCode);
  const code = normalizedCode.startsWith('MOH-') ? normalizedCode : `MOH-${normalizedCode}`;
  const cleanExt = input.extension.replace(/[^0-9-]/g, '').slice(0, 16) || '1000';
  const cleanDiscordId = input.discordId?.replace(/[^0-9]/g, '').slice(0, 40);
  const cleanDiscordUsername = input.discordUsername?.trim().slice(0, 100);

  const payload: Record<string, unknown> = {
    fullName: input.fullName.trim().slice(0, 120),
    employeeCode: code.slice(0, 24),
    rank: input.rank.trim().slice(0, 80),
    rankLevel: Math.min(50, Math.max(1, Math.round(Number(input.rankLevel) || 10))),
    departmentId: input.departmentId,
    departmentName: input.departmentName.trim().slice(0, 120),
    specialization: input.specialization.trim().slice(0, 120),
    facility: input.facility.trim().slice(0, 120),
    status: input.status,
    shift: input.shift,
    extension: cleanExt,
    hireDate: input.hireDate,
    visibility: input.visibility,
    notes: input.notes.trim().slice(0, 600),
    updatedAt: serverTimestamp(),
  };

  if (cleanDiscordId) {
    payload.discordId = cleanDiscordId;
  }
  if (cleanDiscordUsername) {
    payload.discordUsername = cleanDiscordUsername;
  }

  const batch = writeBatch(db);
  const empRef = doc(db, 'employees', empId);

  if (isEdit) {
    batch.update(empRef, payload);
  } else {
    batch.set(empRef, {
      id: empId,
      ...payload,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
    });
  }

  const audit = buildAuditEntry(
    isEdit ? 'update_employee' : 'create_employee',
    'employee',
    empId,
    String(payload.fullName),
    String(payload.employeeCode),
    isEdit
      ? `تحديث بيانات الموظف ${payload.fullName} (${payload.rank})`
      : `إضافة موظف جديد: ${payload.fullName} برتبة ${payload.rank}`,
    actor
  );
  batch.set(doc(db, 'auditLogs', audit.id), audit);

  try {
    await batch.commit();
    return empId;
  } catch (error) {
    handleFirestoreError(
      error,
      isEdit ? OperationType.UPDATE : OperationType.CREATE,
      `employees/${empId}`
    );
  }
}

export async function deleteEmployeeRecord(
  employee: Employee,
  actor: ActorContext
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'employees', employee.id));

  const audit = buildAuditEntry(
    'delete_employee',
    'employee',
    employee.id,
    employee.fullName,
    employee.employeeCode,
    `حذف سجل الموظف ${employee.fullName} من الدليل الوظيفي`,
    actor
  );
  batch.set(doc(db, 'auditLogs', audit.id), audit);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `employees/${employee.id}`);
  }
}

export interface IssueDecisionInput {
  decisionNumber: string;
  title: string;
  type: DecisionType;
  targetEmployee: Employee;
  newRank: string;
  newRankLevel?: number;
  newDepartmentId?: string;
  newDepartmentName?: string;
  effectiveDate: string;
  summary: string;
}

export async function issueDirectorDecision(
  input: IssueDecisionInput,
  actor: ActorContext
): Promise<string> {
  const decisionId = createSafeId('dec');
  const batch = writeBatch(db);

  batch.set(doc(db, 'directorDecisions', decisionId), {
    id: decisionId,
    decisionNumber: input.decisionNumber.trim().toUpperCase().slice(0, 32),
    title: input.title.trim().slice(0, 160),
    type: input.type,
    targetEmployeeId: input.targetEmployee.id,
    targetEmployeeName: input.targetEmployee.fullName.slice(0, 120),
    targetEmployeeCode: input.targetEmployee.employeeCode.slice(0, 24),
    previousRank: input.targetEmployee.rank.slice(0, 80),
    newRank: input.newRank.trim().slice(0, 80),
    effectiveDate: input.effectiveDate,
    summary: input.summary.trim().slice(0, 800),
    issuedBy: actor.uid,
    issuedByName: actor.name.slice(0, 120),
    createdAt: serverTimestamp(),
  });

  if (input.type === 'promotion' || input.type === 'transfer' || input.type === 'suspension') {
    const empUpdates: Record<string, unknown> = {
      rank: input.newRank.trim().slice(0, 80),
      updatedAt: serverTimestamp(),
    };
    if (typeof input.newRankLevel === 'number') {
      empUpdates.rankLevel = Math.min(50, Math.max(1, Math.round(input.newRankLevel)));
    }
    if (input.newDepartmentId && input.newDepartmentName) {
      empUpdates.departmentId = input.newDepartmentId;
      empUpdates.departmentName = input.newDepartmentName.slice(0, 120);
    }
    if (input.type === 'suspension') {
      empUpdates.status = 'suspended';
    }
    batch.update(doc(db, 'employees', input.targetEmployee.id), empUpdates);
  }

  const audit = buildAuditEntry(
    input.type === 'promotion' ? 'promote_employee' : 'issue_decision',
    'decision',
    decisionId,
    input.title.trim().slice(0, 140),
    input.decisionNumber.trim().toUpperCase().slice(0, 32),
    `إصدار قرار إداري (${input.decisionNumber}) للموظف ${input.targetEmployee.fullName}: ${input.targetEmployee.rank} -> ${input.newRank}`,
    actor
  );
  batch.set(doc(db, 'auditLogs', audit.id), audit);

  try {
    await batch.commit();
    return decisionId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `directorDecisions/${decisionId}`);
  }
}

export interface SaveDepartmentInput {
  id?: string;
  code: string;
  name: string;
  sector: string;
  headName: string;
  headCode: string;
  facility: string;
  visibility: VisibilityLevel;
}

export async function saveDepartmentRecord(
  input: SaveDepartmentInput,
  actor: ActorContext
): Promise<string> {
  const isEdit = Boolean(input.id);
  const deptId = input.id || createSafeId('dept');
  const code = sanitizeCode(input.code).slice(0, 24) || 'MOH-DEPT';

  const payload = {
    code,
    name: input.name.trim().slice(0, 120),
    sector: input.sector.trim().slice(0, 100),
    headName: input.headName.trim().slice(0, 120),
    headCode: sanitizeCode(input.headCode).slice(0, 32) || 'MOH-000',
    facility: input.facility.trim().slice(0, 120),
    visibility: input.visibility,
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  if (isEdit) {
    batch.update(doc(db, 'departments', deptId), payload);
  } else {
    batch.set(doc(db, 'departments', deptId), {
      id: deptId,
      ...payload,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
    });
  }

  const audit = buildAuditEntry(
    'create_department',
    'department',
    deptId,
    payload.name,
    payload.code,
    isEdit ? `تعديل بيانات القسم ${payload.name}` : `إنشاء قسم إداري جديد: ${payload.name}`,
    actor
  );
  batch.set(doc(db, 'auditLogs', audit.id), audit);

  try {
    await batch.commit();
    return deptId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `departments/${deptId}`);
  }
}

export async function deleteDepartmentRecord(
  deptId: string,
  deptName: string,
  deptCode: string,
  actor: ActorContext
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'departments', deptId));
  const audit = buildAuditEntry(
    'delete_department',
    'department',
    deptId,
    deptName,
    deptCode,
    `حذف القسم ${deptName} (${deptCode})`,
    actor
  );
  batch.set(doc(db, 'auditLogs', audit.id), audit);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `departments/${deptId}`);
  }
}

export interface SaveRankTierInput {
  id?: string;
  level: number;
  title: string;
  category: string;
  codeRange: string;
  authorityScope: string;
  discordRoleId?: string;
  visibility: VisibilityLevel;
}

export async function saveRankTierRecord(
  input: SaveRankTierInput,
  actor: ActorContext
): Promise<string> {
  const isEdit = Boolean(input.id);
  const rankId = input.id || createSafeId('rank');
  const cleanDiscordRole = input.discordRoleId?.replace(/[^0-9]/g, '').slice(0, 40) || '';

  const payload: Record<string, unknown> = {
    level: Math.min(50, Math.max(1, Math.round(Number(input.level) || 10))),
    title: input.title.trim().slice(0, 80),
    category: input.category.trim().slice(0, 80),
    codeRange: input.codeRange.trim().slice(0, 60),
    authorityScope: input.authorityScope.trim().slice(0, 300),
    visibility: input.visibility,
    updatedAt: serverTimestamp(),
  };

  if (cleanDiscordRole) {
    payload.discordRoleId = cleanDiscordRole;
  }

  const batch = writeBatch(db);
  if (isEdit) {
    batch.update(doc(db, 'ranks', rankId), payload);
  } else {
    batch.set(doc(db, 'ranks', rankId), {
      id: rankId,
      ...payload,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
    });
  }

  const audit = buildAuditEntry(
    isEdit ? 'update_rank' : 'create_rank',
    'rank',
    rankId,
    String(payload.title),
    `LVL-${payload.level}`,
    isEdit
      ? `تحديث الرتبة الوظيفية ${payload.title} (المستوى ${payload.level})`
      : `إضافة رتبة وظيفية جديدة: ${payload.title} (المستوى ${payload.level})`,
    actor
  );
  batch.set(doc(db, 'auditLogs', audit.id), audit);

  try {
    await batch.commit();
    return rankId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `ranks/${rankId}`);
  }
}

export async function deleteRankTierRecord(
  rankId: string,
  title: string,
  level: number,
  actor: ActorContext
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'ranks', rankId));
  const audit = buildAuditEntry(
    'delete_rank',
    'rank',
    rankId,
    title,
    `LVL-${level}`,
    `حذف الرتبة الوظيفية ${title} من سلم الرتب`,
    actor
  );
  batch.set(doc(db, 'auditLogs', audit.id), audit);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `ranks/${rankId}`);
  }
}

export interface SaveDiscordMappingInput {
  id?: string;
  guildId: string;
  discordRoleId: string;
  discordRoleName: string;
  rank: string;
  rankLevel: number;
  departmentId: string;
  departmentName: string;
  autoSync: boolean;
}

export async function saveDiscordMappingRecord(
  input: SaveDiscordMappingInput,
  actor: ActorContext
): Promise<string> {
  const isEdit = Boolean(input.id);
  const mappingId = input.id || createSafeId('map');

  const payload = {
    guildId: input.guildId.replace(/[^0-9]/g, '').slice(0, 40),
    discordRoleId: input.discordRoleId.replace(/[^0-9]/g, '').slice(0, 40),
    discordRoleName: input.discordRoleName.trim().slice(0, 120),
    rank: input.rank.trim().slice(0, 80),
    rankLevel: Math.min(50, Math.max(1, Math.round(Number(input.rankLevel) || 10))),
    departmentId: input.departmentId,
    departmentName: input.departmentName.trim().slice(0, 120),
    autoSync: Boolean(input.autoSync),
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  if (isEdit) {
    const { guildId: _g, discordRoleId: _r, ...updateFields } = payload;
    batch.update(doc(db, 'discordMappings', mappingId), updateFields);
  } else {
    batch.set(doc(db, 'discordMappings', mappingId), {
      id: mappingId,
      ...payload,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
    });
  }

  const audit = buildAuditEntry(
    'update_discord_mapping',
    'discord',
    mappingId,
    payload.discordRoleName,
    payload.discordRoleId,
    `ربط رتبة ديسكورد "${payload.discordRoleName}" برتبة "${payload.rank}" في قسم "${payload.departmentName}"`,
    actor
  );
  batch.set(doc(db, 'auditLogs', audit.id), audit);

  try {
    await batch.commit();
    return mappingId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `discordMappings/${mappingId}`);
  }
}

export async function deleteDiscordMappingRecord(
  mappingId: string,
  roleName: string,
  actor: ActorContext
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'discordMappings', mappingId));
    const audit = buildAuditEntry(
      'update_discord_mapping',
      'discord',
      mappingId,
      roleName,
      mappingId,
      `إلغاء ربط رتبة ديسكورد "${roleName}"`,
      actor
    );
    await setDoc(doc(db, 'auditLogs', audit.id), audit);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `discordMappings/${mappingId}`);
  }
}

export async function grantDirectorAccess(
  targetUid: string,
  email: string,
  displayName: string,
  rankTitle: string,
  actor: ActorContext
): Promise<void> {
  const cleanUid = targetUid.trim();
  const batch = writeBatch(db);
  batch.set(doc(db, 'admins', cleanUid), {
    uid: cleanUid,
    email: email.trim().slice(0, 200),
    displayName: displayName.trim().slice(0, 120),
    rankTitle: rankTitle.trim().slice(0, 80),
    grantedBy: actor.uid,
    createdAt: serverTimestamp(),
  });

  const audit = buildAuditEntry(
    'grant_admin',
    'admin',
    cleanUid,
    displayName.trim(),
    cleanUid.slice(0, 12),
    `منح صلاحيات الإدارة العامة للمستخدم ${displayName} (${email})`,
    actor
  );
  batch.set(doc(db, 'auditLogs', audit.id), audit);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `admins/${cleanUid}`);
  }
}

export async function revokeDirectorAccess(
  targetUid: string,
  displayName: string,
  actor: ActorContext
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'admins', targetUid));

  const audit = buildAuditEntry(
    'revoke_admin',
    'admin',
    targetUid,
    displayName,
    targetUid.slice(0, 12),
    `سحب صلاحيات الإدارة العامة من ${displayName}`,
    actor
  );
  batch.set(doc(db, 'auditLogs', audit.id), audit);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `admins/${targetUid}`);
  }
}

export async function updateOwnProfile(
  uid: string,
  displayName: string,
  employeeCode: string
): Promise<void> {
  const cleanCode = sanitizeCode(employeeCode).slice(0, 32);
  const payload: Record<string, unknown> = {
    displayName: displayName.trim().slice(0, 120),
    updatedAt: serverTimestamp(),
  };
  if (cleanCode) {
    payload.employeeCode = cleanCode;
  }
  try {
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function logDiscordSyncAudit(
  syncedCount: number,
  guildName: string,
  guildId: string,
  actor: ActorContext
): Promise<void> {
  const audit = buildAuditEntry(
    'discord_sync',
    'discord',
    guildId,
    guildName,
    guildId,
    `مزامنة أعضاء سيرفر ديسكورد (${guildName}) وتحديث ${syncedCount} سجل موظف`,
    actor
  );
  try {
    await setDoc(doc(db, 'auditLogs', audit.id), audit);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `auditLogs/${audit.id}`);
  }
}
