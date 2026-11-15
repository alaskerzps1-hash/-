import React, { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Employee, RankTierConfig, VisibilityLevel } from '../types';
import { deleteRankTierRecord, saveRankTierRecord } from '../services/mohService';

interface RanksViewProps {
  ranks: RankTierConfig[];
  employees: Employee[];
  isDirector: boolean;
  actor: { uid: string; name: string } | null;
}

export const RanksView: React.FC<RanksViewProps> = ({
  ranks,
  employees,
  isDirector,
  actor,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRank, setEditingRank] = useState<RankTierConfig | null>(null);
  const [level, setLevel] = useState(10);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [codeRange, setCodeRange] = useState('MOH-100 — MOH-199');
  const [authorityScope, setAuthorityScope] = useState('');
  const [discordRoleId, setDiscordRoleId] = useState('');
  const [visibility, setVisibility] = useState<VisibilityLevel>('public');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sortedRanks = useMemo(
    () => [...ranks].sort((a, b) => a.level - b.level),
    [ranks]
  );

  const countByRankTitle = useMemo(() => {
    const map = new Map<string, number>();
    for (const emp of employees) {
      map.set(emp.rank, (map.get(emp.rank) || 0) + 1);
    }
    return map;
  }, [employees]);

  const openNew = () => {
    setEditingRank(null);
    setLevel(15);
    setTitle('');
    setCategory('الكادر الطبي التخصصي');
    setCodeRange('MOH-300 — MOH-399');
    setAuthorityScope('');
    setDiscordRoleId('');
    setVisibility('public');
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEdit = (rank: RankTierConfig) => {
    setEditingRank(rank);
    setLevel(rank.level);
    setTitle(rank.title);
    setCategory(rank.category);
    setCodeRange(rank.codeRange);
    setAuthorityScope(rank.authorityScope);
    setDiscordRoleId(rank.discordRoleId || '');
    setVisibility(rank.visibility);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actor) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await saveRankTierRecord(
        {
          id: editingRank?.id,
          level,
          title,
          category,
          codeRange,
          authorityScope,
          discordRoleId,
          visibility,
        },
        actor
      );
      setModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر حفظ الرتبة.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rank: RankTierConfig) => {
    if (!actor) return;
    try {
      await deleteRankTierRecord(rank.id, rank.title, rank.level, actor);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر حذف الرتبة.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-teal-900/50 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white sm:text-3xl">
            سلم الرتب الوظيفية ونطاق الأكواد
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            التسلسل الهرمي المعتمد للرتب الطبية والإدارية في وزارة الصحة من المستوى القيادي (1) حتى الكوادر الميدانية.
          </p>
        </div>
        {isDirector && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>إضافة رتبة جديدة</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {sortedRanks.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-teal-900/40 dark:bg-[#0D1B1D]">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">لم يتم تعريف رتب وظيفية بعد</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-teal-900/40 dark:bg-[#0D1B1D]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-teal-900/50 dark:bg-[#081314] dark:text-slate-300">
                  <th className="px-4 py-3 whitespace-nowrap">المستوى</th>
                  <th className="px-4 py-3 whitespace-nowrap">مسمى الرتبة</th>
                  <th className="px-4 py-3 whitespace-nowrap">الفئة</th>
                  <th className="px-4 py-3 whitespace-nowrap">نطاق الأكواد</th>
                  <th className="px-4 py-3">نطاق الصلاحيات والمسؤوليات</th>
                  <th className="px-4 py-3 whitespace-nowrap">العدد</th>
                  {isDirector && <th className="px-4 py-3 whitespace-nowrap">إدارة</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-teal-950">
                {sortedRanks.map((rank) => {
                  const isExecutive = rank.level <= 4;
                  return (
                    <tr key={rank.id} className="hover:bg-slate-50 dark:hover:bg-[#112325]">
                      <td
                        className={`px-4 py-3 font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${
                          isExecutive
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-teal-800 dark:text-teal-400'
                        }`}
                      >
                        L{String(rank.level).padStart(2, '0')}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-950 dark:text-white whitespace-nowrap">
                        {rank.title}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {rank.category}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                        {rank.codeRange}
                      </td>
                      <td className="px-4 py-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {rank.authorityScope}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                        {countByRankTitle.get(rank.title) || 0}
                      </td>
                      {isDirector && (
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => openEdit(rank)}
                              className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                            >
                              تعديل
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(rank)}
                              aria-label={`حذف ${rank.title}`}
                              className="text-rose-700 hover:text-rose-900 dark:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                {editingRank ? 'تعديل الرتبة الوظيفية' : 'إضافة رتبة وظيفية جديدة'}
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">المستوى (1-50)</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={50}
                    value={level}
                    onChange={(e) => setLevel(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#071112] dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">مسمى الرتبة</label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#071112] dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">الفئة</label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#071112] dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">نطاق الأكواد</label>
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={codeRange}
                    onChange={(e) => setCodeRange(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#071112] dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">نطاق الصلاحيات</label>
                <textarea
                  rows={3}
                  required
                  maxLength={300}
                  value={authorityScope}
                  onChange={(e) => setAuthorityScope(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#071112] dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    معرف رتبة ديسكورد (اختياري)
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    placeholder="123456789012345678"
                    value={discordRoleId}
                    onChange={(e) => setDiscordRoleId(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#071112] dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">الظهور</label>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as VisibilityLevel)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-teal-900/60 dark:bg-[#071112] dark:text-white"
                  >
                    <option value="public">عام</option>
                    <option value="restricted">مقيد للقيادة</option>
                  </select>
                </div>
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
                  {saving ? 'جاري الحفظ...' : 'اعتماد الرتبة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
