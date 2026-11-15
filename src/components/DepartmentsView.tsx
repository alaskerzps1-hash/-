import React, { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Department, Employee, VisibilityLevel } from '../types';
import { deleteDepartmentRecord, saveDepartmentRecord } from '../services/mohService';

interface DepartmentsViewProps {
  departments: Department[];
  employees: Employee[];
  isDirector: boolean;
  actor: { uid: string; name: string } | null;
}

export const DepartmentsView: React.FC<DepartmentsViewProps> = ({
  departments,
  employees,
  isDirector,
  actor,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [sector, setSector] = useState('');
  const [headName, setHeadName] = useState('');
  const [headCode, setHeadCode] = useState('');
  const [facility, setFacility] = useState('');
  const [visibility, setVisibility] = useState<VisibilityLevel>('public');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const countByDept = useMemo(() => {
    const map = new Map<string, number>();
    for (const emp of employees) {
      map.set(emp.departmentId, (map.get(emp.departmentId) || 0) + 1);
    }
    return map;
  }, [employees]);

  const openNew = () => {
    setEditingDept(null);
    setCode('MOH-');
    setName('');
    setSector('');
    setHeadName('');
    setHeadCode('MOH-');
    setFacility('');
    setVisibility('public');
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEdit = (dept: Department) => {
    setEditingDept(dept);
    setCode(dept.code);
    setName(dept.name);
    setSector(dept.sector);
    setHeadName(dept.headName);
    setHeadCode(dept.headCode);
    setFacility(dept.facility);
    setVisibility(dept.visibility);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actor) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await saveDepartmentRecord(
        {
          id: editingDept?.id,
          code,
          name,
          sector,
          headName,
          headCode,
          facility,
          visibility,
        },
        actor
      );
      setModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر حفظ القسم.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (dept: Department) => {
    if (!actor) return;
    const count = countByDept.get(dept.id) || 0;
    if (count > 0) {
      setErrorMsg(`لا يمكن حذف قسم "${dept.name}" لوجود ${count} موظف مرتبط به.`);
      return;
    }
    try {
      await deleteDepartmentRecord(dept.id, dept.name, dept.code, actor);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر حذف القسم.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-teal-900/50 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white sm:text-3xl">
            الهيكل الإداري والأقسام الصحية
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            الإدارات والقطاعات الطبية المعتمدة في وزارة الصحة مع بيانات رؤساء الأقسام والمنشآت التابعة.
          </p>
        </div>
        {isDirector && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>إضافة قسم جديد</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {departments.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-teal-900/40 dark:bg-[#0D1B1D]">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">لا توجد أقسام مضافة حتى الآن</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            أضف الأقسام الإدارية أو استخدم خيار التهيئة التأسيسية من سجل الموظفين.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {departments.map((dept) => {
            const staffCount = countByDept.get(dept.id) || 0;
            return (
              <div
                key={dept.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-teal-600/50 dark:border-teal-900/50 dark:bg-[#0D1B1D] dark:hover:border-teal-500/50"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-semibold text-teal-800 dark:text-teal-400">{dept.code}</span>
                    <span>
                      {dept.sector}
                      {dept.visibility === 'restricted' ? ' · مقيد' : ''}
                    </span>
                  </div>
                  <h2 className="mt-2 text-lg font-bold text-slate-950 dark:text-white">{dept.name}</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{dept.facility}</p>

                  <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs dark:border-teal-950">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">رئيس القسم</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{dept.headName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">كود الرئيس</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300 tabular-nums">{dept.headCode}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">الكوادر المسجلة</span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-amber-300 tabular-nums">
                        {staffCount}
                      </span>
                    </div>
                  </div>
                </div>

                {isDirector && (
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-teal-950">
                    <button
                      type="button"
                      onClick={() => openEdit(dept)}
                      className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                    >
                      تعديل البيانات
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(dept)}
                      aria-label={`حذف ${dept.name}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:underline dark:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>حذف</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-teal-900/60 dark:bg-[#0D1B1D]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-teal-950">
              <h2 className="text-lg font-bold text-slate-950 dark:text-white">
                {editingDept ? 'تعديل القسم الإداري' : 'إنشاء قسم إداري جديد'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-teal-950"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">رمز القسم</label>
                  <input
                    type="text"
                    required
                    maxLength={24}
                    placeholder="MOH-CARDIO"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#071112] dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">القطاع</label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    placeholder="القطاع العلاجي"
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#071112] dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">اسم القسم</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#071112] dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">المنشأة / المقر</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={facility}
                  onChange={(e) => setFacility(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#071112] dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">رئيس القسم</label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={headName}
                    onChange={(e) => setHeadName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#071112] dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">كود رئيس القسم</label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    placeholder="MOH-205"
                    value={headCode}
                    onChange={(e) => setHeadCode(e.target.value.toUpperCase())}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#071112] dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">مستوى الظهور</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as VisibilityLevel)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#071112] dark:text-white"
                >
                  <option value="public">عام (مرئي لجميع منسوبي البوابة)</option>
                  <option value="restricted">مقيد (مرئي للقيادة فقط)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 dark:border-teal-900/60 dark:text-slate-300"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-60"
                >
                  {saving ? 'جاري الحفظ...' : 'اعتماد القسم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
