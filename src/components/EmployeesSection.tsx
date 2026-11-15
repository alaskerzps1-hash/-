import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock,
  Copy,
  Check,
  ListFilter,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  Department,
  DiscordGuildMember,
  DiscordGuildRole,
  DiscordSessionUser,
  Employee,
  EMPLOYEE_SHIFT_LABELS,
  EMPLOYEE_STATUS_LABELS,
  EmployeeShift,
  EmployeeStatus,
  VisibleDiscordRoleConfig,
} from '../types';

interface EmployeesSectionProps {
  employees: Employee[];
  departments: Department[];
  loading: boolean;
  isDirector: boolean;
  discordUser: DiscordSessionUser | null;
  botConfigured?: boolean;
  onOpenAuthModal: () => void;
  onOpenDirectorAddEmployee: () => void;
  onEditEmployeeInDirector: (employee: Employee) => void;
}

interface UnifiedStaffRow {
  key: string;
  displayName: string;
  subName: string;
  avatarUrl: string | null;
  rankTitle: string;
  rankLevel: number;
  secondaryRoles: string[];
  departmentName: string;
  shift: EmployeeShift | null;
  status: EmployeeStatus | null;
  extension: string | null;
  employee: Employee | null;
  sortWeight: number;
}

const STATUS_TEXT_CLASS: Record<EmployeeStatus, string> = {
  active: 'text-emerald-700 dark:text-emerald-400 font-semibold',
  mission: 'text-teal-700 dark:text-teal-400 font-semibold',
  on_leave: 'text-amber-700 dark:text-amber-400 font-semibold',
  suspended: 'text-rose-700 dark:text-rose-400 font-semibold',
};

function getArabicInitials(fullName: string): string {
  const cleaned = fullName
    .replace(/^(د\.|أ\.|م\.|دكتور|أستاذ)\s+/u, '')
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'م';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`;
}

interface EmployeeAvatarProps {
  fullName: string;
  rankLevel: number;
  avatarUrl?: string | null;
  size?: 'sm' | 'md';
}

const EmployeeAvatar: React.FC<EmployeeAvatarProps> = ({
  fullName,
  rankLevel,
  avatarUrl,
  size = 'sm',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  const ringClass =
    rankLevel <= 2
      ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:border-amber-400/50 dark:bg-amber-500/15 dark:text-amber-300'
      : rankLevel <= 4
        ? 'border-teal-600/50 bg-teal-600/10 text-teal-800 dark:border-teal-400/40 dark:bg-teal-500/15 dark:text-teal-300'
        : 'border-slate-300 bg-slate-100 text-slate-700 dark:border-teal-800/70 dark:bg-[#112325] dark:text-slate-200';

  const dimensions = size === 'md' ? 'h-12 w-12 text-sm' : 'h-10 w-10 text-xs';

  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={fullName}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${dimensions} shrink-0 rounded-full border object-cover ${ringClass}`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${dimensions} flex shrink-0 items-center justify-center rounded-full border font-bold tracking-tight ${ringClass}`}
    >
      {getArabicInitials(fullName)}
    </div>
  );
};

function inferDepartmentFromRoles(
  roles: DiscordGuildRole[],
  departments: Department[],
  fallbackGuildName?: string | null
): string {
  for (const role of roles) {
    const rName = role.name.trim().toLowerCase();
    const matchedDept = departments.find((d) => {
      const dName = d.name.trim().toLowerCase();
      return dName.includes(rName) || rName.includes(dName);
    });
    if (matchedDept) return matchedDept.name;
  }

  const deptLikeRole = roles.find((r) => /قسم|إدارة|طوارئ|إسعاف|عيادة|مستشفى|شؤون/u.test(r.name));
  if (deptLikeRole) return deptLikeRole.name;

  return fallbackGuildName || 'كادر وزارة الصحة';
}

export const EmployeesSection: React.FC<EmployeesSectionProps> = ({
  employees,
  departments,
  loading,
  isDirector,
  discordUser,
  botConfigured,
  onOpenAuthModal,
  onOpenDirectorAddEmployee,
  onEditEmployeeInDirector,
}) => {
  const [queryText, setQueryText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [guildMembers, setGuildMembers] = useState<DiscordGuildMember[]>([]);
  const [guildRoles, setGuildRoles] = useState<DiscordGuildRole[]>([]);
  const [guildName, setGuildName] = useState<string | null>(null);
  const [discordLoading, setDiscordLoading] = useState(false);

  const [visibleRoles, setVisibleRoles] = useState<VisibleDiscordRoleConfig[]>([]);
  const [rolesConfigLoaded, setRolesConfigLoaded] = useState(false);

  // Role IDs allowlist modal state
  const [rolesModalOpen, setRolesModalOpen] = useState(false);
  const [draftRoles, setDraftRoles] = useState<VisibleDiscordRoleConfig[]>([]);
  const [newRoleIdInput, setNewRoleIdInput] = useState('');
  const [newRoleDeptInput, setNewRoleDeptInput] = useState('');
  const [savingRoles, setSavingRoles] = useState(false);
  const [rolesModalError, setRolesModalError] = useState<string | null>(null);

  const loadVisibleRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/discord/visible-roles');
      if (!res.ok) return;
      const data = (await res.json()) as { roles?: VisibleDiscordRoleConfig[] };
      if (Array.isArray(data.roles)) {
        setVisibleRoles(data.roles);
      }
    } catch {
      // Optional
    } finally {
      setRolesConfigLoaded(true);
    }
  }, []);

  const loadDiscordRoster = useCallback(async (forceRefresh = false) => {
    setDiscordLoading(true);
    try {
      const res = await fetch(
        forceRefresh ? '/api/discord/guild-data?refresh=1' : '/api/discord/guild-data'
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        guild?: { name?: string };
        roles?: DiscordGuildRole[];
        members?: DiscordGuildMember[];
      };
      if (data.guild?.name) {
        setGuildName(data.guild.name);
      }
      if (Array.isArray(data.roles)) {
        setGuildRoles(data.roles);
      }
      if (Array.isArray(data.members)) {
        setGuildMembers(data.members);
      }
    } catch {
      // Optional server sync
    } finally {
      setDiscordLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVisibleRoles();
  }, [loadVisibleRoles]);

  useEffect(() => {
    if (botConfigured) {
      void loadDiscordRoster(false);
    }
  }, [botConfigured, loadDiscordRoster]);

  const guildRoleById = useMemo(
    () => new Map<string, DiscordGuildRole>(guildRoles.map((r) => [r.id, r])),
    [guildRoles]
  );

  const canManageRoles = useMemo(() => {
    if (!discordUser) return false;
    const REQUIRED_MANAGER_ROLE_ID = '1571297044360990750';
    const liveMember = guildMembers.find((m) => m.id === discordUser.id);
    if (liveMember) {
      return liveMember.roles.includes(REQUIRED_MANAGER_ROLE_ID);
    }
    return Boolean(
      discordUser.canManageVisibleRoles ||
        discordUser.roleIds?.includes(REQUIRED_MANAGER_ROLE_ID)
    );
  }, [discordUser, guildMembers]);

  const openRolesModal = () => {
    if (!canManageRoles) return;
    setDraftRoles(visibleRoles.map((r) => ({ ...r })));
    setNewRoleIdInput('');
    setNewRoleDeptInput('');
    setRolesModalError(null);
    setRolesModalOpen(true);
  };

  const handleAddRoleIdsFromInput = () => {
    setRolesModalError(null);
    const tokens = newRoleIdInput
      .split(/[\s,،\n]+/)
      .map((s) => s.replace(/[^0-9]/g, '').trim())
      .filter((s) => /^[0-9]{5,30}$/.test(s));

    if (tokens.length === 0) {
      setRolesModalError('أدخل آيدي رتبة صحيحاً مكوّناً من أرقام فقط (مثال: 1563653562901471273).');
      return;
    }

    const cleanDept = newRoleDeptInput.trim();
    setDraftRoles((prev) => {
      const existingIds = new Set(prev.map((item) => item.roleId));
      const next = [...prev];
      for (const id of tokens) {
        if (!existingIds.has(id)) {
          existingIds.add(id);
          next.push(cleanDept ? { roleId: id, departmentName: cleanDept } : { roleId: id });
        }
      }
      return next;
    });
    setNewRoleIdInput('');
    setNewRoleDeptInput('');
  };

  const handleToggleServerRoleInDraft = (roleId: string) => {
    setDraftRoles((prev) => {
      const exists = prev.some((item) => item.roleId === roleId);
      if (exists) {
        return prev.filter((item) => item.roleId !== roleId);
      }
      return [...prev, { roleId }];
    });
  };

  const handleUpdateDraftDepartment = (roleId: string, departmentName: string) => {
    setDraftRoles((prev) =>
      prev.map((item) =>
        item.roleId === roleId
          ? { ...item, departmentName: departmentName || undefined }
          : item
      )
    );
  };

  const handleRemoveDraftRole = (roleId: string) => {
    setDraftRoles((prev) => prev.filter((item) => item.roleId !== roleId));
  };

  const handleSaveVisibleRoles = async () => {
    setRolesModalError(null);
    if (!discordUser) {
      setRolesModalError('يرجى تسجيل الدخول عبر ديسكورد أولاً لحفظ قائمة الرتب.');
      return;
    }

    setSavingRoles(true);
    try {
      const res = await fetch('/api/discord/visible-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: draftRoles }),
      });
      const data = (await res.json()) as { roles?: VisibleDiscordRoleConfig[]; error?: string };
      if (!res.ok) {
        setRolesModalError(data.error || 'تعذر حفظ القائمة.');
        return;
      }
      setVisibleRoles(Array.isArray(data.roles) ? data.roles : draftRoles);
      setRolesModalOpen(false);
    } catch {
      setRolesModalError('حدث خطأ أثناء الاتصال بالخادم لحفظ القائمة.');
    } finally {
      setSavingRoles(false);
    }
  };

  const isEmployeeDiscordMatch = useCallback(
    (emp: Employee): boolean => {
      if (!discordUser) return false;
      if (emp.discordId && emp.discordId === discordUser.id) return true;
      if (
        emp.discordUsername &&
        emp.discordUsername.toLowerCase() === discordUser.username.toLowerCase()
      ) {
        return true;
      }
      return false;
    },
    [discordUser]
  );

  const unifiedRows = useMemo<UnifiedStaffRow[]>(() => {
    // Only show members holding at least one Role ID specified by the user
    if (visibleRoles.length === 0) {
      return [];
    }

    const allowedRoleConfig = new Map<string, VisibleDiscordRoleConfig & { order: number }>();
    visibleRoles.forEach((cfg, idx) => {
      allowedRoleConfig.set(cfg.roleId, { ...cfg, order: idx });
    });

    const resolveAllowedRolesFromIds = (
      roleIds: string[],
      roleObjects?: DiscordGuildRole[]
    ): DiscordGuildRole[] => {
      const objMap = new Map<string, DiscordGuildRole>();
      if (roleObjects) {
        for (const ro of roleObjects) objMap.set(ro.id, ro);
      }

      const matched: DiscordGuildRole[] = [];
      for (const rid of roleIds) {
        if (!allowedRoleConfig.has(rid)) continue;
        const meta = objMap.get(rid) || guildRoleById.get(rid);
        if (meta) {
          matched.push(meta);
        } else {
          const order = allowedRoleConfig.get(rid)?.order ?? 99;
          matched.push({
            id: rid,
            name: `رتبة (${rid})`,
            colorHex: '#64748b',
            position: 100 - order,
          });
        }
      }

      return matched.sort((a, b) => {
        const orderA = allowedRoleConfig.get(a.id)?.order ?? 999;
        const orderB = allowedRoleConfig.get(b.id)?.order ?? 999;
        return orderA - orderB || b.position - a.position;
      });
    };

    const memberById = new Map<string, DiscordGuildMember>();
    const memberByUsername = new Map<string, DiscordGuildMember>();
    for (const m of guildMembers) {
      memberById.set(m.id, m);
      memberByUsername.set(m.username.toLowerCase(), m);
    }

    const consumedDiscordIds = new Set<string>();
    const rows: UnifiedStaffRow[] = [];

    // 1. Firestore employees linked to Discord members who hold an allowed Role ID
    for (const emp of employees) {
      const matchedMember =
        (emp.discordId ? memberById.get(emp.discordId) : undefined) ||
        (emp.discordUsername ? memberByUsername.get(emp.discordUsername.toLowerCase()) : undefined);

      const currentMatches = isEmployeeDiscordMatch(emp);
      const rawRoleIds = matchedMember?.roles?.length
        ? matchedMember.roles
        : currentMatches && discordUser?.roleIds?.length
          ? discordUser.roleIds
          : [];

      const rawRoleObjects = matchedMember?.roleObjects?.length
        ? matchedMember.roleObjects
        : currentMatches && discordUser?.roleNames?.length
          ? discordUser.roleNames
          : [];

      const allowedRoles = resolveAllowedRolesFromIds(rawRoleIds, rawRoleObjects);
      if (allowedRoles.length === 0) continue;

      if (matchedMember) consumedDiscordIds.add(matchedMember.id);
      if (currentMatches && discordUser) consumedDiscordIds.add(discordUser.id);

      const topRole = allowedRoles[0];
      const topRoleConfig = allowedRoleConfig.get(topRole.id);
      const discordName =
        matchedMember?.displayName ||
        (currentMatches && discordUser
          ? discordUser.serverNick || discordUser.displayName || discordUser.globalName
          : null);

      const displayName = discordName || emp.fullName;
      const handleText = matchedMember
        ? `@${matchedMember.username}`
        : emp.discordUsername
          ? `@${emp.discordUsername}`
          : '';
      const subName = [
        emp.employeeCode,
        discordName && discordName !== emp.fullName ? emp.fullName : emp.specialization,
        handleText,
      ]
        .filter(Boolean)
        .join(' · ');

      rows.push({
        key: `emp_${emp.id}`,
        displayName,
        subName,
        avatarUrl:
          matchedMember?.avatarUrl || (currentMatches ? discordUser?.avatarUrl || null : null),
        rankTitle: topRole.name,
        rankLevel: Math.min(10, (topRoleConfig?.order ?? 0) + 1),
        secondaryRoles: allowedRoles.slice(1, 3).map((r) => r.name),
        departmentName: topRoleConfig?.departmentName || emp.departmentName,
        shift: emp.shift,
        status: emp.status,
        extension: emp.extension,
        employee: emp,
        sortWeight: topRoleConfig?.order ?? emp.rankLevel,
      });
    }

    // 2. Live Discord server members holding at least one allowed Role ID
    for (const member of guildMembers) {
      if (consumedDiscordIds.has(member.id)) continue;

      const allowedRoles = resolveAllowedRolesFromIds(member.roles || [], member.roleObjects);
      if (allowedRoles.length === 0) continue;

      consumedDiscordIds.add(member.id);
      const topRole = allowedRoles[0];
      const topRoleConfig = allowedRoleConfig.get(topRole.id);
      const inferredDept =
        topRoleConfig?.departmentName ||
        inferDepartmentFromRoles(allowedRoles, departments, guildName || discordUser?.guildName);

      rows.push({
        key: `dc_${member.id}`,
        displayName: member.displayName,
        subName: `@${member.username}`,
        avatarUrl: member.avatarUrl || null,
        rankTitle: topRole.name,
        rankLevel: Math.min(10, (topRoleConfig?.order ?? 0) + 1),
        secondaryRoles: allowedRoles.slice(1, 3).map((r) => r.name),
        departmentName: inferredDept,
        shift: null,
        status: null,
        extension: null,
        employee: null,
        sortWeight: topRoleConfig?.order ?? 50,
      });
    }

    // 3. Fallback for signed-in Discord user if guild members list is unavailable
    if (discordUser && !consumedDiscordIds.has(discordUser.id)) {
      const allowedRoles = resolveAllowedRolesFromIds(
        discordUser.roleIds || [],
        discordUser.roleNames
      );
      if (allowedRoles.length > 0) {
        const topRole = allowedRoles[0];
        const topRoleConfig = allowedRoleConfig.get(topRole.id);
        const inferredDept =
          topRoleConfig?.departmentName ||
          inferDepartmentFromRoles(allowedRoles, departments, guildName || discordUser.guildName);

        rows.push({
          key: `me_${discordUser.id}`,
          displayName:
            discordUser.serverNick || discordUser.displayName || discordUser.globalName,
          subName: `@${discordUser.username}`,
          avatarUrl: discordUser.avatarUrl,
          rankTitle: topRole.name,
          rankLevel: Math.min(10, (topRoleConfig?.order ?? 0) + 1),
          secondaryRoles: allowedRoles.slice(1, 3).map((r) => r.name),
          departmentName: inferredDept,
          shift: null,
          status: null,
          extension: null,
          employee: null,
          sortWeight: topRoleConfig?.order ?? 50,
        });
      }
    }

    return rows.sort(
      (a, b) => a.sortWeight - b.sortWeight || a.displayName.localeCompare(b.displayName, 'ar')
    );
  }, [
    visibleRoles,
    guildRoleById,
    employees,
    guildMembers,
    departments,
    guildName,
    discordUser,
    isEmployeeDiscordMatch,
  ]);

  const filteredRows = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return unifiedRows.filter((row) => {
      if (!q) return true;
      return (
        row.displayName.toLowerCase().includes(q) ||
        row.subName.toLowerCase().includes(q) ||
        row.rankTitle.toLowerCase().includes(q) ||
        row.secondaryRoles.some((r) => r.toLowerCase().includes(q)) ||
        row.departmentName.toLowerCase().includes(q) ||
        (row.extension && row.extension.toLowerCase().includes(q))
      );
    });
  }, [unifiedRows, queryText]);

  const handleCopyExtension = async (rowKey: string, ext: string) => {
    try {
      await navigator.clipboard.writeText(ext);
      setCopiedId(rowKey);
      setTimeout(() => setCopiedId((prev) => (prev === rowKey ? null : prev)), 1800);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-teal-900/50 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white sm:text-3xl">
            قسم الموظفين والمناوبات
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            يتم عرض الأعضاء الحاملين للرتب المحددة في قائمة آيديات الرتب فقط، مع إظهار اسم العضو وصورته ورتبته وقسمه من ديسكورد.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {canManageRoles && (
            <button
              type="button"
              onClick={openRolesModal}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-500/20 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20 whitespace-nowrap"
            >
              <ListFilter className="h-3.5 w-3.5" />
              <span>قائمة آيديات الرتب ({visibleRoles.length})</span>
            </button>
          )}

          {botConfigured && (
            <button
              type="button"
              onClick={() => void loadDiscordRoster(true)}
              disabled={discordLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-teal-900/60 dark:bg-[#0D1B1D] dark:text-slate-200 dark:hover:bg-[#112325] whitespace-nowrap"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${discordLoading ? 'animate-spin' : ''}`} />
              <span>تحديث الأعضاء</span>
            </button>
          )}

        </div>
      </div>

      {/* Search Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-teal-900/40 dark:bg-[#0D1B1D]">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="ابحث بالاسم أو الرتبة أو القسم..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-9 pl-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none dark:border-teal-900/60 dark:bg-[#071112] dark:text-white"
          />
        </div>
      </div>

      {/* Staff Roster Table: Name & Photo on the Right | Discord Rank Centered | Department on the Left */}
      {(!rolesConfigLoaded || discordLoading) && unifiedRows.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-16 rounded-xl border border-slate-200 bg-white dark:border-teal-900/40 dark:bg-[#0D1B1D] animate-pulse"
            />
          ))}
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-teal-900/50 dark:bg-[#0D1B1D]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-5 py-3.5 dark:border-teal-900/50 dark:bg-[#081314]">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                جدول الموظفين والرتب
              </h2>
              {visibleRoles.length > 0 && (
                <span className="text-xs text-teal-700 dark:text-teal-400">
                  · مفلتر حسب {visibleRoles.length} رتبة محددة
                </span>
              )}
            </div>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {filteredRows.length} موظف
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-teal-900/50 dark:bg-[#0A1718] dark:text-slate-300">
                  <th className="w-[36%] px-5 py-3.5 text-right whitespace-nowrap">
                    الاسم والصورة
                  </th>
                  <th className="w-[30%] px-4 py-3.5 text-center whitespace-nowrap">
                    الرتبة
                  </th>
                  <th className="w-[34%] px-5 py-3.5 text-left whitespace-nowrap">
                    القسم
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-teal-950/80">
                {visibleRoles.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        لم يتم تحديد آيديات الرتب الظاهرة بعد
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {canManageRoles
                          ? 'أضف آيديات الرتب التي تريد إظهارها من سيرفر ديسكورد ليظهر هنا أصحاب تلك الرتب فقط.'
                          : 'يتم عرض الأعضاء المعتمدين فور تحديد الرتب من قبل صاحب الصلاحية.'}
                      </p>
                      {canManageRoles && (
                        <button
                          type="button"
                          onClick={openRolesModal}
                          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
                        >
                          <ListFilter className="h-4 w-4" />
                          <span>إضافة آيديات الرتب</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-6 py-12 text-center text-sm font-medium text-slate-500 dark:text-slate-400"
                    >
                      لا يوجد أعضاء يحملون الرتب المحددة ومطابقون لخيارات البحث الحالية
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr
                      key={row.key}
                      className="transition-colors hover:bg-slate-50/80 dark:hover:bg-[#112325]/80"
                    >
                      {/* Right Column: Photo & Discord Name */}
                      <td className="px-5 py-4 text-right align-middle">
                        <div className="flex items-center gap-3.5">
                          <EmployeeAvatar
                            fullName={row.displayName}
                            rankLevel={row.rankLevel}
                            avatarUrl={row.avatarUrl}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="truncate font-bold text-slate-950 dark:text-white">
                              {row.displayName}
                            </div>
                            <p className="mt-0.5 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                              {row.subName}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Center Column: Discord Role / Rank */}
                      <td className="px-4 py-4 text-center align-middle">
                        <div className="inline-flex items-center justify-center gap-2 font-bold text-slate-900 dark:text-white">
                          <span
                            aria-hidden="true"
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              row.rankLevel <= 2
                                ? 'bg-amber-500'
                                : row.rankLevel <= 5
                                  ? 'bg-teal-500'
                                  : 'bg-slate-400 dark:bg-slate-500'
                            }`}
                          />
                          <span>{row.rankTitle}</span>
                        </div>
                        {row.secondaryRoles.length > 0 && (
                          <div className="mt-0.5 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {row.secondaryRoles.join(' · ')}
                          </div>
                        )}
                      </td>

                      {/* Left Column: Department & Optional Shift/Status/Extension */}
                      <td className="px-5 py-4 text-left align-middle">
                        <div className="flex flex-col items-end gap-1">
                          <div className="font-semibold text-slate-800 dark:text-slate-100">
                            {row.departmentName}
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-2.5 text-xs text-slate-500 dark:text-slate-400">
                            {row.status && (
                              <span className={STATUS_TEXT_CLASS[row.status]}>
                                {EMPLOYEE_STATUS_LABELS[row.status]}
                              </span>
                            )}

                            {row.shift && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                                <span>{EMPLOYEE_SHIFT_LABELS[row.shift]}</span>
                              </span>
                            )}

                            {row.extension && (
                              <button
                                type="button"
                                onClick={() => void handleCopyExtension(row.key, row.extension!)}
                                className="inline-flex items-center gap-1 font-mono font-semibold text-slate-700 hover:text-teal-700 dark:text-slate-200 dark:hover:text-teal-300 tabular-nums"
                                title="نسخ التحويلة"
                              >
                                <Phone className="h-3 w-3 text-slate-400" />
                                <span>{row.extension}</span>
                                {copiedId === row.key ? (
                                  <Check className="h-3 w-3 text-emerald-500" />
                                ) : (
                                  <Copy className="h-3 w-3 text-slate-400" />
                                )}
                              </button>
                            )}

                            {isDirector && row.employee && (
                              <button
                                type="button"
                                onClick={() => onEditEmployeeInDirector(row.employee!)}
                                className="font-semibold text-teal-700 hover:underline dark:text-teal-400"
                              >
                                تعديل
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Allowed Discord Role IDs Modal */}
      {canManageRoles && rolesModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="roles-allowlist-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-teal-900/60 dark:bg-[#0D1B1D]">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-teal-950">
              <div>
                <h2
                  id="roles-allowlist-title"
                  className="text-lg font-bold text-slate-950 dark:text-white"
                >
                  قائمة آيديات الرتب الظاهرة في الجدول
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  أدخل آيديات رتب ديسكورد أو اخترها من قائمة السيرفر ليظهر أصحاب هذه الرتب فقط في الجدول.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRolesModalOpen(false)}
                aria-label="إغلاق"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-teal-950"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-6 text-sm">
              {/* Manual Role ID Entry */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-teal-900/50 dark:bg-[#071112]">
                <p className="mb-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  إضافة آيدي رتبة ديسكورد يدوياً (يمكن لصق أكثر من آيدي مفصولاً بمسافة أو فاصلة)
                </p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                  <input
                    type="text"
                    value={newRoleIdInput}
                    onChange={(e) => setNewRoleIdInput(e.target.value)}
                    placeholder="مثال: 1563653562901471273"
                    dir="ltr"
                    className="sm:col-span-6 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#0D1B1D] dark:text-white"
                  />
                  <input
                    type="text"
                    value={newRoleDeptInput}
                    onChange={(e) => setNewRoleDeptInput(e.target.value)}
                    placeholder="اسم القسم (اختياري)"
                    className="sm:col-span-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#0D1B1D] dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddRoleIdsFromInput}
                    className="sm:col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>إضافة</span>
                  </button>
                </div>
              </div>

              {/* Active Draft Role IDs List */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    الرتب المعتمدة للعرض ({draftRoles.length})
                  </h3>
                  {draftRoles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDraftRoles([])}
                      className="text-xs font-medium text-rose-600 hover:underline dark:text-rose-400"
                    >
                      مسح الكل
                    </button>
                  )}
                </div>

                {draftRoles.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-4 py-4 text-center text-xs text-slate-500 dark:border-teal-900/50 dark:text-slate-400">
                    لم تُضف أي آيديات رتب بعد. أضف آيدي في الحقل أعلاه أو اختر من رتب السيرفر بالأسفل.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {draftRoles.map((item) => {
                      const roleMeta = guildRoleById.get(item.roleId);
                      return (
                        <div
                          key={item.roleId}
                          className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-teal-900/50 dark:bg-[#081314] sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-950 dark:text-white">
                              {roleMeta ? roleMeta.name : 'رتبة مضافة بالآيدي'}
                            </p>
                            <p className="font-mono text-[11px] text-teal-700 dark:text-teal-400 tabular-nums">
                              {item.roleId}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={item.departmentName || ''}
                              onChange={(e) =>
                                handleUpdateDraftDepartment(item.roleId, e.target.value)
                              }
                              placeholder="تخصيص اسم القسم (اختياري)"
                              className="w-44 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#0D1B1D] dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveDraftRole(item.roleId)}
                              aria-label={`حذف ${item.roleId}`}
                              className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick Pick from Discord Server Roles */}
              {guildRoles.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    اختيار سريع من رتب السيرفر ({guildName || 'ديسكورد'})
                  </h3>
                  <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {guildRoles.map((role) => {
                      const selected = draftRoles.some((item) => item.roleId === role.id);
                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => handleToggleServerRoleInDraft(role.id)}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-right transition-colors ${
                            selected
                              ? 'border-teal-600 bg-teal-50/70 text-teal-950 dark:border-teal-500 dark:bg-teal-950/50 dark:text-white'
                              : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-teal-900/50 dark:bg-[#081314] dark:text-slate-200 dark:hover:bg-[#112325]'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold">{role.name}</div>
                            <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                              {role.id}
                            </div>
                          </div>
                          {selected && <Check className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {rolesModalError && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                  <span>{rolesModalError}</span>
                  {!discordUser && (
                    <button
                      type="button"
                      onClick={() => {
                        setRolesModalOpen(false);
                        onOpenAuthModal();
                      }}
                      className="font-bold text-teal-700 underline dark:text-teal-300"
                    >
                      تسجيل الدخول بديسكورد
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 dark:border-teal-950">
              <button
                type="button"
                onClick={() => setRolesModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-teal-900/60 dark:text-slate-300 dark:hover:bg-[#112325]"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void handleSaveVisibleRoles()}
                disabled={savingRoles}
                className="rounded-lg bg-teal-700 px-5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60 dark:bg-teal-600 dark:hover:bg-teal-500"
              >
                {savingRoles ? 'جاري الحفظ...' : 'حفظ واعتماد القائمة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
