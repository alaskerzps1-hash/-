import React, { useMemo, useState } from 'react';
import {
  X,
  ArrowUpLeft,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import {
  Department,
  Employee,
  EMPLOYEE_SHIFT_LABELS,
  EMPLOYEE_STATUS_LABELS,
  EmployeeStatus,
} from '../types';
import mohHeadquartersImg from '../assets/images/moh_headquarters_center_1794706970814.jpg';

interface EmployeeDirectoryProps {
  employees: Employee[];
  departments: Department[];
  loading: boolean;
  isDirector: boolean;
  isSignedIn: boolean;
  onOpenAuthModal: () => void;
  onSeedRegistry: () => Promise<void>;
  onOpenDirectorAddEmployee: () => void;
  onEditEmployeeInDirector: (employee: Employee) => void;
}

const STATUS_TEXT_CLASS: Record<EmployeeStatus, string> = {
  active: 'text-emerald-700 dark:text-emerald-400 font-semibold',
  mission: 'text-teal-700 dark:text-teal-400 font-semibold',
  on_leave: 'text-amber-700 dark:text-amber-400 font-semibold',
  suspended: 'text-rose-700 dark:text-rose-400 font-semibold',
};

function getInitials(name: string): string {
  const cleaned = name.replace(/^(د\.|أ\.|م\.|معالي)\s*/g, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ص';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

export const EmployeeDirectory: React.FC<EmployeeDirectoryProps> = ({
  employees,
  loading,
  isDirector,
  isSignedIn,
  onOpenAuthModal,
  onEditEmployeeInDirector,
}) => {
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [heroFailed, setHeroFailed] = useState(false);

  const filteredEmployees = useMemo(() => {
    return [...employees].sort(
      (a, b) => a.rankLevel - b.rankLevel || a.employeeCode.localeCompare(b.employeeCode)
    );
  }, [employees]);

  return (
    <div className="space-y-8">
      {/* Centered Sovereign Executive Hero */}
      <section className="flex flex-col items-center gap-7 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-teal-900/50 dark:bg-[#0B1718] sm:p-10">
        <div className="mx-auto max-w-3xl space-y-4">
          <div>
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              المنظومة القيادية المركزية
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              السجل الموحد للرتب والأكواد الإدارية
            </p>
          </div>

          <div>
            <h1 className="font-display text-2xl font-bold leading-snug text-slate-950 dark:text-white sm:text-4xl">
              إدارة الكوادر الصحية وسجل الرتب والأكواد
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              منصة رسمية موحدة لاستعراض بيانات الموظفين والقيادات الصحية، متابعة توزيع الأقسام والمناوبات، وإصدار القرارات الإدارية والربط المباشر مع سيرفر ديسكورد.
            </p>
          </div>

          {!isSignedIn && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={onOpenAuthModal}
                className="inline-flex items-center gap-2 rounded-lg bg-[#5865F2] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#4752C4] whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>تسجيل الدخول عبر ديسكورد</span>
              </button>
            </div>
          )}
        </div>

        <div className="relative mx-auto aspect-video w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-[#091E1E] shadow-lg dark:border-teal-900/60">
          {!heroFailed ? (
            <img
              src={mohHeadquartersImg}
              alt="المقر الرئيسي لوزارة الصحة"
              referrerPolicy="no-referrer"
              onError={() => setHeroFailed(true)}
              className="h-full w-full object-cover object-center"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0B2526] to-[#061213]">
              <Building2 className="h-16 w-16 text-teal-500/40" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#071112]/85 via-[#071112]/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-center text-white">
            <p className="text-xs font-semibold text-amber-300">المقر الرئيسي للعمليات الصحية</p>
            <p className="mt-0.5 text-xs text-slate-200">
              القطاع القيادي · الطوارئ الميدانية · المستشفيات التخصصية
            </p>
          </div>
        </div>
      </section>

      {/* Data Views: Loading / Cards */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="h-44 rounded-xl border border-slate-200 bg-white p-5 dark:border-teal-900/40 dark:bg-[#0D1B1D] animate-pulse"
            />
          ))}
        </div>
      ) : filteredEmployees.length === 0 ? null : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredEmployees.map((emp) => {
            const isLeadership = emp.rankLevel <= 4;
            return (
              <div
                key={emp.id}
                onClick={() => setSelectedEmployee(emp)}
                className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-teal-600/60 dark:border-teal-900/50 dark:bg-[#0D1B1D] dark:hover:border-teal-500/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold shrink-0 ${
                        isLeadership
                          ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                          : 'bg-teal-700/10 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300 border border-teal-500/20'
                      }`}
                    >
                      {getInitials(emp.fullName)}
                    </div>
                    <div>
                      <p
                        className={`font-mono text-xs font-semibold tabular-nums ${
                          isLeadership
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-teal-700 dark:text-teal-400'
                        }`}
                      >
                        {emp.employeeCode} · L{emp.rankLevel}
                      </p>
                      <h3 className="mt-0.5 text-base font-bold text-slate-950 dark:text-white group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
                        {emp.fullName}
                      </h3>
                    </div>
                  </div>
                  <span className={`text-xs whitespace-nowrap ${STATUS_TEXT_CLASS[emp.status]}`}>
                    {EMPLOYEE_STATUS_LABELS[emp.status]}
                  </span>
                </div>

                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3.5 text-xs dark:border-teal-950">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">الرتبة</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{emp.rank}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">القسم</span>
                    <span className="text-slate-700 dark:text-slate-300 truncate max-w-[220px]">
                      {emp.departmentName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">التخصص</span>
                    <span className="text-slate-700 dark:text-slate-300 truncate max-w-[220px]">
                      {emp.specialization}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-teal-950 dark:text-slate-400">
                  <span className="font-mono tabular-nums">
                    تحويلة {emp.extension} · {EMPLOYEE_SHIFT_LABELS[emp.shift]}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-teal-700 dark:text-teal-400">
                    <span>الملف</span>
                    <ArrowUpLeft className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Employee Dossier Side Drawer */}
      {selectedEmployee && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedEmployee(null)}
        >
          <div
            className="h-full w-full max-w-md overflow-y-auto border-r border-slate-200 bg-white p-6 shadow-2xl dark:border-teal-900/60 dark:bg-[#0B1718]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-100 pb-4 dark:border-teal-950">
              <div>
                <p className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400 tabular-nums">
                  {selectedEmployee.employeeCode}
                  {selectedEmployee.visibility === 'restricted' ? ' · سجل قيادي مقيد' : ''}
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">
                  {selectedEmployee.fullName}
                </h2>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                  {selectedEmployee.rank} · المستوى {selectedEmployee.rankLevel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmployee(null)}
                aria-label="إغلاق البطاقة"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-teal-950 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <dl className="mt-6 space-y-4 text-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-teal-950">
                <dt className="text-slate-500 dark:text-slate-400">الحالة الوظيفية</dt>
                <dd className={STATUS_TEXT_CLASS[selectedEmployee.status]}>
                  {EMPLOYEE_STATUS_LABELS[selectedEmployee.status]}
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-teal-950">
                <dt className="text-slate-500 dark:text-slate-400">القسم الإداري</dt>
                <dd className="font-medium text-slate-900 dark:text-white">{selectedEmployee.departmentName}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-teal-950">
                <dt className="text-slate-500 dark:text-slate-400">المنشأة الصحية</dt>
                <dd className="font-medium text-slate-900 dark:text-white">{selectedEmployee.facility}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-teal-950">
                <dt className="text-slate-500 dark:text-slate-400">التخصص الدقيق</dt>
                <dd className="font-medium text-slate-900 dark:text-white">{selectedEmployee.specialization}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-teal-950">
                <dt className="text-slate-500 dark:text-slate-400">نظام المناوبة</dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {EMPLOYEE_SHIFT_LABELS[selectedEmployee.shift]}
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-teal-950">
                <dt className="text-slate-500 dark:text-slate-400">التحويلة الداخلية</dt>
                <dd className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                  {selectedEmployee.extension}
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-teal-950">
                <dt className="text-slate-500 dark:text-slate-400">تاريخ المباشرة</dt>
                <dd className="font-mono text-slate-900 dark:text-white tabular-nums">{selectedEmployee.hireDate}</dd>
              </div>
              {selectedEmployee.discordUsername && (
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-teal-950">
                  <dt className="text-slate-500 dark:text-slate-400">حساب ديسكورد</dt>
                  <dd className="font-mono text-xs text-slate-800 dark:text-teal-300">
                    @{selectedEmployee.discordUsername} ({selectedEmployee.discordId})
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-slate-500 dark:text-slate-400">الملاحظات والتكليفات</dt>
                <dd className="mt-1.5 leading-relaxed text-slate-700 dark:text-slate-300">
                  {selectedEmployee.notes || 'لا توجد ملاحظات مسجلة.'}
                </dd>
              </div>
            </dl>

            {isDirector && (
              <div className="mt-8 border-t border-slate-200 pt-4 dark:border-teal-950">
                <button
                  type="button"
                  onClick={() => {
                    const emp = selectedEmployee;
                    setSelectedEmployee(null);
                    onEditEmployeeInDirector(emp);
                  }}
                  className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
                >
                  تعديل أو ترقية الموظف في لوحة القيادة
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
