import React, { useEffect, useMemo, useState } from 'react';
import {
  Database,
  FileText,
  Link2,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  AdminRecord,
  AuditLog,
  DECISION_TYPE_LABELS,
  DecisionType,
  Department,
  DirectorDecision,
  DiscordGuildMember,
  DiscordGuildRole,
  DiscordRoleMapping,
  Employee,
  EMPLOYEE_SHIFT_LABELS,
  EMPLOYEE_STATUS_LABELS,
  EmployeeShift,
  EmployeeStatus,
  RankTierConfig,
  VisibilityLevel,
} from '../types';
import {
  deleteDiscordMappingRecord,
  deleteEmployeeRecord,
  grantDirectorAccess,
  issueDirectorDecision,
  logDiscordSyncAudit,
  revokeDirectorAccess,
  saveDiscordMappingRecord,
  saveEmployeeRecord,
} from '../services/mohService';

export type DirectorSubTab = 'staff' | 'decisions' | 'discord' | 'governance';

interface DirectorDashboardProps {
  employees: Employee[];
  departments: Department[];
  ranks: RankTierConfig[];
  decisions: DirectorDecision[];
  discordMappings: DiscordRoleMapping[];
  admins: AdminRecord[];
  auditLogs: AuditLog[];
  actor: { uid: string; name: string; email: string };
  onSeedRegistry: () => Promise<void>;
  preselectedEmployee: Employee | null;
  onClearPreselectedEmployee: () => void;
  discordStatus: {
    oauthConfigured: boolean;
    botConfigured: boolean;
    defaultGuildId: string;
    redirectUri: string;
  };
}

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#071112] dark:text-white';

export const DirectorDashboard: React.FC<DirectorDashboardProps> = ({
  employees,
  departments,
  ranks,
  decisions,
  discordMappings,
  admins,
  auditLogs,
  actor,
  onSeedRegistry,
  preselectedEmployee,
  onClearPreselectedEmployee,
  discordStatus,
}) => {
  const [subTab, setSubTab] = useState<DirectorSubTab>('staff');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Employee Form State
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [fullName, setFullName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('MOH-');
  const [rank, setRank] = useState('');
  const [rankLevel, setRankLevel] = useState(10);
  const [departmentId, setDepartmentId] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [facility, setFacility] = useState('');
  const [status, setStatus] = useState<EmployeeStatus>('active');
  const [shift, setShift] = useState<EmployeeShift>('morning');
  const [extension, setExtension] = useState('1010');
  const [hireDate, setHireDate] = useState(new Date().toISOString().slice(0, 10));
  const [visibility, setVisibility] = useState<VisibilityLevel>('public');
  const [notes, setNotes] = useState('');
  const [discordId, setDiscordId] = useState('');
  const [discordUsername, setDiscordUsername] = useState('');

  // Decision Form State
  const [decEmployeeId, setDecEmployeeId] = useState('');
  const [decNumber, setDecNumber] = useState(`DEC-${new Date().getFullYear()}-101`);
  const [decType, setDecType] = useState<DecisionType>('promotion');
  const [decTitle, setDecTitle] = useState('');
  const [decNewRank, setDecNewRank] = useState('');
  const [decNewRankLevel, setDecNewRankLevel] = useState(5);
  const [decEffectiveDate, setDecEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [decSummary, setDecSummary] = useState('');

  // Discord Bot Sync State
  const [guildIdInput, setGuildIdInput] = useState(discordStatus.defaultGuildId || '');
  const [guildInfo, setGuildInfo] = useState<{ id: string; name: string; memberCount: number } | null>(null);
  const [guildRoles, setGuildRoles] = useState<DiscordGuildRole[]>([]);
  const [guildMembers, setGuildMembers] = useState<DiscordGuildMember[]>([]);
  const [discordWarning, setDiscordWarning] = useState<string | null>(null);
  const [mapRoleId, setMapRoleId] = useState('');
  const [mapRoleName, setMapRoleName] = useState('');
  const [mapRankTitle, setMapRankTitle] = useState('');
  const [mapRankLevel, setMapRankLevel] = useState(10);
  const [mapDeptId, setMapDeptId] = useState('');
  const [mapAutoSync, setMapAutoSync] = useState(true);

  // Admin Grant Form State
  const [adminUid, setAdminUid] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminDisplayName, setAdminDisplayName] = useState('');
  const [adminRankTitle, setAdminRankTitle] = useState('نائب المدير العام');

  useEffect(() => {
    if (!guildIdInput && discordStatus.defaultGuildId) {
      setGuildIdInput(discordStatus.defaultGuildId);
    }
  }, [discordStatus.defaultGuildId, guildIdInput]);

  useEffect(() => {
    if (departments.length > 0 && !departmentId) {
      setDepartmentId(departments[0].id);
      setFacility(departments[0].facility);
    }
    if (departments.length > 0 && !mapDeptId) {
      setMapDeptId(departments[0].id);
    }
  }, [departments, departmentId, mapDeptId]);

  useEffect(() => {
    if (ranks.length > 0 && !rank) {
      const sorted = [...ranks].sort((a, b) => a.level - b.level);
      setRank(sorted[0].title);
      setRankLevel(sorted[0].level);
      setMapRankTitle(sorted[0].title);
      setMapRankLevel(sorted[0].level);
      setDecNewRank(sorted[0].title);
      setDecNewRankLevel(sorted[0].level);
    }
  }, [ranks, rank]);

  useEffect(() => {
    if (employees.length > 0 && !decEmployeeId) {
      setDecEmployeeId(employees[0].id);
    }
  }, [employees, decEmployeeId]);

  useEffect(() => {
    if (preselectedEmployee) {
      setSubTab('staff');
      loadEmployeeIntoForm(preselectedEmployee);
      onClearPreselectedEmployee();
    }
  }, [preselectedEmployee, onClearPreselectedEmployee]);

  const sortedRanks = useMemo(
    () => [...ranks].sort((a, b) => a.level - b.level),
    [ranks]
  );

  const loadEmployeeIntoForm = (emp: Employee) => {
    setEditingId(emp.id);
    setFullName(emp.fullName);
    setEmployeeCode(emp.employeeCode);
    setRank(emp.rank);
    setRankLevel(emp.rankLevel);
    setDepartmentId(emp.departmentId);
    setSpecialization(emp.specialization);
    setFacility(emp.facility);
    setStatus(emp.status);
    setShift(emp.shift);
    setExtension(emp.extension);
    setHireDate(emp.hireDate);
    setVisibility(emp.visibility);
    setNotes(emp.notes);
    setDiscordId(emp.discordId || '');
    setDiscordUsername(emp.discordUsername || '');
    setFeedback(null);
    setErrorMsg(null);
  };

  const resetEmployeeForm = () => {
    setEditingId(undefined);
    setFullName('');
    setEmployeeCode('MOH-');
    if (sortedRanks[0]) {
      setRank(sortedRanks[0].title);
      setRankLevel(sortedRanks[0].level);
    }
    if (departments[0]) {
      setDepartmentId(departments[0].id);
      setFacility(departments[0].facility);
    }
    setSpecialization('');
    setStatus('active');
    setShift('morning');
    setExtension('1010');
    setHireDate(new Date().toISOString().slice(0, 10));
    setVisibility('public');
    setNotes('');
    setDiscordId('');
    setDiscordUsername('');
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const dept = departments.find((d) => d.id === departmentId);
    if (!dept) {
      setErrorMsg('يرجى اختيار قسم إداري أولاً (أو تهيئة الأقسام).');
      return;
    }
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await saveEmployeeRecord(
        {
          id: editingId,
          employeeCode,
          fullName,
          rank: rank || 'طبيب أخصائي',
          rankLevel,
          departmentId: dept.id,
          departmentName: dept.name,
          specialization,
          facility: facility || dept.facility,
          status,
          shift,
          extension,
          hireDate,
          visibility,
          notes,
          discordId: discordId || undefined,
          discordUsername: discordUsername || undefined,
        },
        { uid: actor.uid, name: actor.name }
      );
      setFeedback(editingId ? 'تم تحديث سجل الموظف واعتماده.' : 'تم تسجيل الموظف الجديد في الدليل.');
      resetEmployeeForm();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ سجل الموظف.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteEmployee = async (emp: Employee) => {
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await deleteEmployeeRecord(emp, { uid: actor.uid, name: actor.name });
      if (editingId === emp.id) resetEmployeeForm();
      setFeedback(`تم حذف سجل الموظف ${emp.fullName}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر حذف الموظف.');
    } finally {
      setBusy(false);
    }
  };

  const handleIssueDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmp = employees.find((item) => item.id === decEmployeeId);
    if (!targetEmp) {
      setErrorMsg('يرجى اختيار الموظف المستهدف.');
      return;
    }
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await issueDirectorDecision(
        {
          decisionNumber: decNumber,
          title: decTitle,
          type: decType,
          targetEmployee: targetEmp,
          newRank: decNewRank || targetEmp.rank,
          newRankLevel: decNewRankLevel,
          effectiveDate: decEffectiveDate,
          summary: decSummary,
        },
        { uid: actor.uid, name: actor.name }
      );
      setFeedback(`تم إصدار القرار الإداري رقم ${decNumber} وتحديث سجل الموظف تلقائياً.`);
      setDecTitle('');
      setDecSummary('');
      const nextNum = Math.floor(100 + Math.random() * 899);
      setDecNumber(`DEC-${new Date().getFullYear()}-${nextNum}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر إصدار القرار الإداري.');
    } finally {
      setBusy(false);
    }
  };

  const handleFetchGuildData = async () => {
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    setDiscordWarning(null);
    try {
      const qs = guildIdInput.trim() ? `?guildId=${encodeURIComponent(guildIdInput.trim())}` : '';
      const res = await fetch(`/api/discord/guild-data${qs}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'تعذر جلب بيانات سيرفر ديسكورد.');
      }
      setGuildInfo(data.guild);
      setGuildRoles(data.roles || []);
      setGuildMembers(data.members || []);
      if (data.membersWarning) {
        setDiscordWarning(data.membersWarning);
      }
      if (data.roles?.[0]) {
        setMapRoleId(data.roles[0].id);
        setMapRoleName(data.roles[0].name);
      }
      setFeedback(`تم الاتصال بسيرفر "${data.guild.name}" وجلب ${data.roles.length} رتبة و ${data.members.length} عضو.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل الاتصال بواجهة ديسكورد.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    const dept = departments.find((d) => d.id === mapDeptId);
    if (!dept) {
      setErrorMsg('يرجى اختيار القسم الافتراضي.');
      return;
    }
    const targetGuild = guildInfo?.id || guildIdInput.trim();
    if (!targetGuild || !mapRoleId) {
      setErrorMsg('يرجى تحديد معرف السيرفر ومعرف رتبة ديسكورد.');
      return;
    }
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await saveDiscordMappingRecord(
        {
          guildId: targetGuild,
          discordRoleId: mapRoleId,
          discordRoleName: mapRoleName || `Role-${mapRoleId}`,
          rank: mapRankTitle || 'طبيب أخصائي',
          rankLevel: mapRankLevel,
          departmentId: dept.id,
          departmentName: dept.name,
          autoSync: mapAutoSync,
        },
        { uid: actor.uid, name: actor.name }
      );
      setFeedback('تم حفظ ربط رتبة ديسكورد بالرتبة الوظيفية بنجاح.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر حفظ الربط.');
    } finally {
      setBusy(false);
    }
  };

  const handleSyncMemberToDirectory = async (member: DiscordGuildMember) => {
    const matchedMapping = discordMappings.find((m) => member.roles.includes(m.discordRoleId));
    const fallbackDept = departments[0];
    if (!matchedMapping && !fallbackDept) {
      setErrorMsg('يرجى إضافة قسم واحد على الأقل قبل مزامنة الأعضاء.');
      return;
    }

    const existingEmp = employees.find((e) => e.discordId === member.id);
    const deptId = matchedMapping?.departmentId || existingEmp?.departmentId || fallbackDept.id;
    const deptName = matchedMapping?.departmentName || existingEmp?.departmentName || fallbackDept.name;
    const targetFacility =
      departments.find((d) => d.id === deptId)?.facility || existingEmp?.facility || 'المقر الرئيسي لوزارة الصحة';

    const generatedCode = existingEmp?.employeeCode || `MOH-${member.id.slice(-4)}`;

    setBusy(true);
    setErrorMsg(null);
    try {
      await saveEmployeeRecord(
        {
          id: existingEmp?.id,
          employeeCode: generatedCode,
          fullName: existingEmp?.fullName || member.displayName,
          rank: matchedMapping?.rank || existingEmp?.rank || sortedRanks[sortedRanks.length - 1]?.title || 'طبيب مقيم',
          rankLevel: matchedMapping?.rankLevel || existingEmp?.rankLevel || 18,
          departmentId: deptId,
          departmentName: deptName,
          specialization: existingEmp?.specialization || 'كادر مزامن عبر ديسكورد',
          facility: targetFacility,
          status: existingEmp?.status || 'active',
          shift: existingEmp?.shift || 'morning',
          extension: existingEmp?.extension || member.id.slice(-4),
          hireDate: existingEmp?.hireDate || member.joinedAt.slice(0, 10),
          visibility: existingEmp?.visibility || 'public',
          notes: existingEmp?.notes || 'تمت المزامنة من سيرفر وزارة الصحة في ديسكورد.',
          discordId: member.id,
          discordUsername: member.username,
        },
        { uid: actor.uid, name: actor.name }
      );
      await logDiscordSyncAudit(1, guildInfo?.name || 'Discord Guild', guildInfo?.id || guildIdInput, {
        uid: actor.uid,
        name: actor.name,
      });
      setFeedback(`تمت مزامنة "${member.displayName}" في سجل الموظفين بكود ${generatedCode}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر مزامنة العضو.');
    } finally {
      setBusy(false);
    }
  };

  const handleGrantAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await grantDirectorAccess(adminUid, adminEmail, adminDisplayName, adminRankTitle, {
        uid: actor.uid,
        name: actor.name,
      });
      setFeedback(`تم منح صلاحيات القيادة لـ ${adminDisplayName}.`);
      setAdminUid('');
      setAdminEmail('');
      setAdminDisplayName('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر منح الصلاحية.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-teal-900/50 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white sm:text-3xl">
            لوحة القيادة وإدارة شؤون الموظفين
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
            إدارة ملفات الكوادر، إصدار قرارات الترقية والتكليف، مزامنة رتب ديسكورد، ومراجعة سجل التدقيق الإداري.
          </p>
        </div>

        <button
          type="button"
          onClick={onSeedRegistry}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-teal-900/60 dark:bg-[#0D1B1D] dark:text-slate-100 dark:hover:bg-[#13292B] whitespace-nowrap shrink-0"
        >
          <Database className="h-4 w-4 text-teal-700 dark:text-teal-400" />
          <span>تحديث / تهيئة السجل التأسيسي</span>
        </button>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1.5 w-fit dark:bg-[#0B1718] dark:border dark:border-teal-900/40">
        {(
          [
            { id: 'staff', label: 'شؤون الموظفين', icon: Users },
            { id: 'decisions', label: 'القرارات والترقيات', icon: FileText },
            { id: 'discord', label: 'ربط ديسكورد والمزامنة', icon: Link2 },
            { id: 'governance', label: 'الصلاحيات وسجل التدقيق', icon: Shield },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-white text-slate-950 shadow-xs dark:bg-[#13292B] dark:text-white'
                  : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-xs font-semibold text-teal-900 dark:border-teal-800/60 dark:bg-teal-950/50 dark:text-teal-200">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* TAB 1: STAFF CRUD */}
      {subTab === 'staff' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-teal-900/40 dark:bg-[#0D1B1D]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-teal-950">
              <h2 className="text-base font-bold text-slate-950 dark:text-white">
                {editingId ? 'تعديل ملف موظف' : 'إضافة موظف جديد'}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={resetEmployeeForm}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  إلغاء التعديل
                </button>
              )}
            </div>

            <form onSubmit={handleSaveEmployee} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">الاسم الكامل</label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={120}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">الكود المؤسسي</label>
                  <input
                    type="text"
                    required
                    minLength={4}
                    maxLength={24}
                    placeholder="MOH-205"
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                    className={`${inputCls} font-mono`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">الرتبة الوظيفية</label>
                  {sortedRanks.length > 0 ? (
                    <select
                      value={rank}
                      onChange={(e) => {
                        const selected = sortedRanks.find((r) => r.title === e.target.value);
                        setRank(e.target.value);
                        if (selected) setRankLevel(selected.level);
                      }}
                      className={inputCls}
                    >
                      {sortedRanks.map((r) => (
                        <option key={r.id} value={r.title}>
                          {r.title} (L{r.level})
                        </option>
                      ))}
                      {!sortedRanks.some((r) => r.title === rank) && rank && (
                        <option value={rank}>{rank}</option>
                      )}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      value={rank}
                      onChange={(e) => setRank(e.target.value)}
                      placeholder="استشاري أول"
                      className={inputCls}
                    />
                  )}
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">المستوى (1-50)</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={50}
                    value={rankLevel}
                    onChange={(e) => setRankLevel(Number(e.target.value))}
                    className={`${inputCls} font-mono`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">القسم الإداري</label>
                  <select
                    required
                    value={departmentId}
                    onChange={(e) => {
                      setDepartmentId(e.target.value);
                      const dept = departments.find((d) => d.id === e.target.value);
                      if (dept) setFacility(dept.facility);
                    }}
                    className={inputCls}
                  >
                    {departments.length === 0 && <option value="">لا توجد أقسام</option>}
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">المنشأة</label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={facility}
                    onChange={(e) => setFacility(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">التخصص</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">الحالة</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
                    className={inputCls}
                  >
                    {Object.entries(EMPLOYEE_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">المناوبة</label>
                  <select
                    value={shift}
                    onChange={(e) => setShift(e.target.value as EmployeeShift)}
                    className={inputCls}
                  >
                    {Object.entries(EMPLOYEE_SHIFT_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">التحويلة</label>
                  <input
                    type="text"
                    required
                    maxLength={16}
                    value={extension}
                    onChange={(e) => setExtension(e.target.value.replace(/[^0-9-]/g, ''))}
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">تاريخ المباشرة</label>
                  <input
                    type="date"
                    required
                    value={hireDate}
                    onChange={(e) => setHireDate(e.target.value)}
                    className={`${inputCls} font-mono`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Discord ID</label>
                  <input
                    type="text"
                    maxLength={40}
                    placeholder="اختياري"
                    value={discordId}
                    onChange={(e) => setDiscordId(e.target.value.replace(/[^0-9]/g, ''))}
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">اسم ديسكورد</label>
                  <input
                    type="text"
                    maxLength={100}
                    placeholder="اختياري"
                    value={discordUsername}
                    onChange={(e) => setDiscordUsername(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">نطاق الظهور</label>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as VisibilityLevel)}
                    className={inputCls}
                  >
                    <option value="public">عام في السجل</option>
                    <option value="restricted">مقيد للقيادة</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">ملاحظات إدارية</label>
                <textarea
                  rows={2}
                  maxLength={600}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={inputCls}
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-60"
              >
                {busy ? 'جاري الحفظ...' : editingId ? 'حفظ التعديلات المعتمدة' : 'إضافة الموظف للسجل'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden dark:border-teal-900/40 dark:bg-[#0D1B1D]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-teal-950">
              <h2 className="text-base font-bold text-slate-950 dark:text-white">
                قائمة الموظفين ({employees.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 dark:border-teal-900/50 dark:bg-[#081314] dark:text-slate-300">
                    <th className="px-4 py-2.5">الكود</th>
                    <th className="px-4 py-2.5">الاسم</th>
                    <th className="px-4 py-2.5">الرتبة</th>
                    <th className="px-4 py-2.5">القسم</th>
                    <th className="px-4 py-2.5">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-teal-950">
                  {[...employees]
                    .sort((a, b) => a.rankLevel - b.rankLevel)
                    .map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-[#112325]">
                        <td className="px-4 py-2.5 font-mono font-semibold text-teal-800 dark:text-teal-400 tabular-nums whitespace-nowrap">
                          {emp.employeeCode}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">{emp.fullName}</td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {emp.rank} (L{emp.rankLevel})
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{emp.departmentName}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => loadEmployeeIntoForm(emp)}
                              className="font-semibold text-teal-700 hover:underline dark:text-teal-400"
                            >
                              تعديل
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEmployee(emp)}
                              className="text-rose-700 hover:text-rose-900 dark:text-rose-400"
                              aria-label={`حذف ${emp.fullName}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DIRECTOR DECISIONS */}
      {subTab === 'decisions' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-teal-900/40 dark:bg-[#0D1B1D]">
            <h2 className="border-b border-slate-100 pb-3 text-base font-bold text-slate-950 dark:border-teal-950 dark:text-white">
              إصدار قرار إداري أو ترقية
            </h2>
            <form onSubmit={handleIssueDecision} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">رقم القرار</label>
                  <input
                    type="text"
                    required
                    placeholder="DEC-2026-101"
                    value={decNumber}
                    onChange={(e) => setDecNumber(e.target.value.toUpperCase())}
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">نوع القرار</label>
                  <select
                    value={decType}
                    onChange={(e) => setDecType(e.target.value as DecisionType)}
                    className={inputCls}
                  >
                    {Object.entries(DECISION_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">الموظف المعني</label>
                <select
                  required
                  value={decEmployeeId}
                  onChange={(e) => setDecEmployeeId(e.target.value)}
                  className={inputCls}
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.employeeCode}) — {emp.rank}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">عنوان القرار</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={160}
                  placeholder="ترقية إلى رتبة استشاري أول"
                  value={decTitle}
                  onChange={(e) => setDecTitle(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">الرتبة الجديدة</label>
                  {sortedRanks.length > 0 ? (
                    <select
                      value={decNewRank}
                      onChange={(e) => {
                        const found = sortedRanks.find((r) => r.title === e.target.value);
                        setDecNewRank(e.target.value);
                        if (found) setDecNewRankLevel(found.level);
                      }}
                      className={inputCls}
                    >
                      {sortedRanks.map((r) => (
                        <option key={r.id} value={r.title}>
                          {r.title} (L{r.level})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      value={decNewRank}
                      onChange={(e) => setDecNewRank(e.target.value)}
                      className={inputCls}
                    />
                  )}
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">تاريخ السريان</label>
                  <input
                    type="date"
                    required
                    value={decEffectiveDate}
                    onChange={(e) => setDecEffectiveDate(e.target.value)}
                    className={`${inputCls} font-mono`}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">نص القرار وحيثياته</label>
                <textarea
                  rows={3}
                  required
                  minLength={3}
                  maxLength={800}
                  value={decSummary}
                  onChange={(e) => setDecSummary(e.target.value)}
                  className={inputCls}
                />
              </div>

              <button
                type="submit"
                disabled={busy || employees.length === 0}
                className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-60"
              >
                {busy ? 'جاري الاعتماد...' : 'اعتماد وإصدار القرار رسمياً'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 dark:border-teal-900/40 dark:bg-[#0D1B1D]">
            <h2 className="border-b border-slate-100 pb-3 text-base font-bold text-slate-950 dark:border-teal-950 dark:text-white">
              أرشيف القرارات القيادية ({decisions.length})
            </h2>
            {decisions.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                لم تصدر قرارات إدارية مسجلة حتى الآن.
              </p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100 dark:divide-teal-950">
                {decisions.map((dec) => (
                  <div key={dec.id} className="py-3.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono font-semibold text-teal-800 dark:text-amber-300 tabular-nums">
                        {dec.decisionNumber} · {DECISION_TYPE_LABELS[dec.type]}
                      </span>
                      <span className="font-mono tabular-nums">{dec.effectiveDate}</span>
                    </div>
                    <h3 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{dec.title}</h3>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      الموظف: {dec.targetEmployeeName} ({dec.targetEmployeeCode}) · من{' '}
                      {dec.previousRank} إلى <span className="font-semibold text-slate-900 dark:text-teal-300">{dec.newRank}</span>
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{dec.summary}</p>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                      صدر بتوقيع: {dec.issuedByName}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: DISCORD BOT & ROLE MAPPING */}
      {subTab === 'discord' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-teal-900/40 dark:bg-[#0D1B1D]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex-1 max-w-md">
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  معرف سيرفر ديسكورد (Guild ID)
                </label>
                <input
                  type="text"
                  placeholder="1234567890123456789"
                  value={guildIdInput}
                  onChange={(e) => setGuildIdInput(e.target.value.replace(/[^0-9]/g, ''))}
                  className={`${inputCls} font-mono text-xs`}
                />
              </div>
              <button
                type="button"
                onClick={handleFetchGuildData}
                disabled={busy || !discordStatus.botConfigured}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
                <span>جلب الرتب والأعضاء من البوت</span>
              </button>
            </div>

            {!discordStatus.botConfigured && (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
                ملاحظة: رمز البوت <span className="font-mono">DISCORD_BOT_TOKEN</span> غير مضبوط في الأسرار حالياً، لذا سيبقى جلب الرتب والأعضاء المباشر متاحاً فور إضافته في إعدادات البيئة.
              </p>
            )}
            {discordWarning && (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">{discordWarning}</p>
            )}
            {guildInfo && (
              <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                السيرفر المتصل: <span className="font-semibold text-slate-900 dark:text-white">{guildInfo.name}</span> · عدد الأعضاء التقديري:{' '}
                <span className="font-mono tabular-nums">{guildInfo.memberCount}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-teal-900/40 dark:bg-[#0D1B1D]">
              <h2 className="border-b border-slate-100 pb-3 text-base font-bold text-slate-950 dark:border-teal-950 dark:text-white">
                ربط رتب ديسكورد برتب الوزارة
              </h2>
              <form onSubmit={handleSaveMapping} className="mt-4 space-y-3 text-xs">
                {guildRoles.length > 0 ? (
                  <div>
                    <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">رتبة السيرفر</label>
                    <select
                      value={mapRoleId}
                      onChange={(e) => {
                        setMapRoleId(e.target.value);
                        const r = guildRoles.find((item) => item.id === e.target.value);
                        if (r) setMapRoleName(r.name);
                      }}
                      className={inputCls}
                    >
                      {guildRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.id})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">معرف رتبة ديسكورد</label>
                      <input
                        type="text"
                        required
                        value={mapRoleId}
                        onChange={(e) => setMapRoleId(e.target.value.replace(/[^0-9]/g, ''))}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">اسم الرتبة في ديسكورد</label>
                      <input
                        type="text"
                        required
                        value={mapRoleName}
                        onChange={(e) => setMapRoleName(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">الرتبة المقابلة في الوزارة</label>
                  <select
                    value={mapRankTitle}
                    onChange={(e) => {
                      const found = sortedRanks.find((r) => r.title === e.target.value);
                      setMapRankTitle(e.target.value);
                      if (found) setMapRankLevel(found.level);
                    }}
                    className={inputCls}
                  >
                    {sortedRanks.map((r) => (
                      <option key={r.id} value={r.title}>
                        {r.title} (L{r.level})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">القسم الافتراضي</label>
                  <select
                    value={mapDeptId}
                    onChange={(e) => setMapDeptId(e.target.value)}
                    className={inputCls}
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 pt-1 text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={mapAutoSync}
                    onChange={(e) => setMapAutoSync(e.target.checked)}
                    className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                  />
                  <span>مزامنة تلقائية عند تحديث السجل</span>
                </label>

                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-60"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>اعتماد قاعدة الربط</span>
                </button>
              </form>
            </div>

            <div className="lg:col-span-7 space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-teal-900/40 dark:bg-[#0D1B1D]">
                <h2 className="border-b border-slate-100 pb-3 text-base font-bold text-slate-950 dark:border-teal-950 dark:text-white">
                  قواعد ربط الرتب المعتمدة ({discordMappings.length})
                </h2>
                {discordMappings.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    لا توجد قواعد ربط مسجلة حالياً.
                  </p>
                ) : (
                  <div className="mt-3 divide-y divide-slate-100 text-xs dark:divide-teal-950">
                    {discordMappings.map((m) => (
                      <div key={m.id} className="flex items-center justify-between py-2.5">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {m.discordRoleName} ← {m.rank} (L{m.rankLevel})
                          </p>
                          <p className="text-slate-500 dark:text-slate-400">
                            {m.departmentName} · Role ID: <span className="font-mono">{m.discordRoleId}</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteDiscordMappingRecord(m.id, m.discordRoleName, { uid: actor.uid, name: actor.name })}
                          className="text-rose-700 hover:text-rose-900 dark:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {guildMembers.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-teal-900/40 dark:bg-[#0D1B1D]">
                  <h2 className="border-b border-slate-100 pb-3 text-base font-bold text-slate-950 dark:border-teal-950 dark:text-white">
                    أعضاء السيرفر المتاحون للمزامنة ({guildMembers.length})
                  </h2>
                  <div className="mt-3 max-h-80 overflow-y-auto divide-y divide-slate-100 text-xs dark:divide-teal-950">
                    {guildMembers.map((member) => {
                      const linked = employees.some((e) => e.discordId === member.id);
                      return (
                        <div key={member.id} className="flex items-center justify-between py-2.5">
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">{member.displayName}</p>
                            <p className="font-mono text-slate-500 dark:text-slate-400">
                              @{member.username} · {member.id}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSyncMemberToDirectory(member)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-teal-800 hover:bg-slate-100 dark:border-teal-900/60 dark:bg-[#071112] dark:text-teal-300 dark:hover:bg-teal-950"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>{linked ? 'تحديث السجل' : 'استيراد للسجل'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: GOVERNANCE & AUDIT LOGS */}
      {subTab === 'governance' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-teal-900/40 dark:bg-[#0D1B1D]">
              <h2 className="border-b border-slate-100 pb-3 text-base font-bold text-slate-950 dark:border-teal-950 dark:text-white">
                منح صلاحيات الإدارة والقيادة
              </h2>
              <form onSubmit={handleGrantAdmin} className="mt-4 space-y-3 text-xs">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">معرف المستخدم (UID)</label>
                  <input
                    type="text"
                    required
                    value={adminUid}
                    onChange={(e) => setAdminUid(e.target.value)}
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">البريد الإلكتروني</label>
                  <input
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">الاسم</label>
                    <input
                      type="text"
                      required
                      value={adminDisplayName}
                      onChange={(e) => setAdminDisplayName(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">المسمى القيادي</label>
                    <input
                      type="text"
                      required
                      value={adminRankTitle}
                      onChange={(e) => setAdminRankTitle(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
                >
                  تفعيل صلاحية المدير
                </button>
              </form>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-teal-900/40 dark:bg-[#0D1B1D]">
              <h2 className="border-b border-slate-100 pb-3 text-base font-bold text-slate-950 dark:border-teal-950 dark:text-white">
                المدراء المفوضون ({admins.length})
              </h2>
              {admins.length === 0 ? (
                <p className="py-4 text-xs text-slate-500 dark:text-slate-400">
                  تعمل حالياً بحساب القيادة التأسيسي ({actor.email}).
                </p>
              ) : (
                <div className="mt-3 divide-y divide-slate-100 text-xs dark:divide-teal-950">
                  {admins.map((adm) => (
                    <div key={adm.uid} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {adm.displayName} · {adm.rankTitle}
                        </p>
                        <p className="font-mono text-slate-500 dark:text-slate-400">{adm.email}</p>
                      </div>
                      {adm.uid !== actor.uid && (
                        <button
                          type="button"
                          onClick={() =>
                            revokeDirectorAccess(adm.uid, adm.displayName, {
                              uid: actor.uid,
                              name: actor.name,
                            })
                          }
                          className="text-rose-700 hover:underline dark:text-rose-400"
                        >
                          سحب
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 dark:border-teal-900/40 dark:bg-[#0D1B1D]">
            <h2 className="border-b border-slate-100 pb-3 text-base font-bold text-slate-950 dark:border-teal-950 dark:text-white">
              سجل التدقيق الإداري غير القابل للتعديل ({auditLogs.length})
            </h2>
            {auditLogs.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                لا توجد عمليات إدارية مسجلة حتى الآن.
              </p>
            ) : (
              <div className="mt-3 max-h-[520px] overflow-y-auto divide-y divide-slate-100 text-xs dark:divide-teal-950">
                {auditLogs.map((log) => (
                  <div key={log.id} className="py-3">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                      <span className="font-mono font-semibold text-teal-800 dark:text-teal-400">{log.targetCode || log.action}</span>
                      <span>بواسطة: {log.actorName}</span>
                    </div>
                    <p className="mt-1 font-semibold text-slate-900 dark:text-white">{log.targetName}</p>
                    <p className="mt-0.5 text-slate-600 dark:text-slate-400">{log.details}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
