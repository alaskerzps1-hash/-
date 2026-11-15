import React, { useState } from 'react';
import { LogOut, X, Link2, CheckCircle2, AlertCircle, Copy, Check } from 'lucide-react';
import { DiscordSessionUser, Employee } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  discordUser: DiscordSessionUser | null;
  matchedEmployee: Employee | null;
  isDirector: boolean;
  discordOAuthConfigured: boolean;
  discordRedirectUri: string;
  onConnectDiscord: () => Promise<void>;
  onDisconnectDiscord: () => Promise<void>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  discordUser,
  matchedEmployee,
  isDirector,
  discordOAuthConfigured,
  discordRedirectUri,
  onConnectDiscord,
  onDisconnectDiscord,
}) => {
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  if (!isOpen) return null;

  const handleDiscordLogin = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await onConnectDiscord();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر فتح نافذة تسجيل الدخول عبر ديسكورد.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await onDisconnectDiscord();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تسجيل الخروج.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyDiscordId = async () => {
    if (!discordUser) return;
    try {
      await navigator.clipboard.writeText(discordUser.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-teal-900/60 dark:bg-[#0D1B1D]">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-teal-950">
          <div>
            <h2 id="auth-modal-title" className="text-lg font-bold text-slate-950 dark:text-white">
              {discordUser ? 'حساب ديسكورد الموثق' : 'تسجيل الدخول عبر ديسكورد'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              المصادقة الموحدة لبوابة وزارة الصحة عبر حساب Discord فقط
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق النافذة"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-teal-950 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {!discordUser ? (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                سجّل الدخول بحساب ديسكورد للوصول إلى ملفك الوظيفي في الوزارة والتحقق التلقائي من رتبتك وصلاحياتك.
              </p>

              {discordOAuthConfigured ? (
                <button
                  type="button"
                  onClick={handleDiscordLogin}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4752C4] disabled:opacity-60"
                >
                  <Link2 className="h-4 w-4" />
                  <span>{busy ? 'جاري التحويل إلى ديسكورد...' : 'تسجيل الدخول عبر ديسكورد'}</span>
                </button>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-teal-900/50 dark:bg-[#071112] dark:text-slate-300">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="mt-0.5 h-4 w-4 text-amber-500 shrink-0" />
                    <div className="space-y-1.5">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        يلزم تفعيل إعدادات تطبيق ديسكورد في الأسرار (Secrets)
                      </p>
                      <p>
                        أضف <span className="font-mono">DISCORD_CLIENT_ID</span> و{' '}
                        <span className="font-mono">DISCORD_CLIENT_SECRET</span> ثم أضف رابط الاستجابة في Discord Developer Portal:
                      </p>
                      <p className="font-mono text-[11px] text-teal-800 dark:text-teal-300 break-all" dir="ltr">
                        {discordRedirectUri}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-teal-900/50 dark:bg-[#071112]">
                <div className="flex items-center gap-3">
                  {discordUser.avatarUrl ? (
                    <img
                      src={discordUser.avatarUrl}
                      alt={discordUser.serverNick || discordUser.displayName || discordUser.globalName}
                      referrerPolicy="no-referrer"
                      className="h-11 w-11 rounded-full border border-teal-500/30 object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#5865F2] text-sm font-bold text-white">
                      {(discordUser.serverNick || discordUser.displayName || discordUser.globalName).slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {discordUser.serverNick || discordUser.displayName || discordUser.globalName}
                      </p>
                      <CheckCircle2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    </div>
                    <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      @{discordUser.username}
                      {isDirector ? ' · صلاحية قيادة' : ''}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyDiscordId}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-slate-700 hover:bg-slate-50 dark:border-teal-900/60 dark:bg-[#0D1B1D] dark:text-slate-300"
                  title="نسخ معرف ديسكورد"
                >
                  <span>{discordUser.id}</span>
                  {copiedId ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3 text-slate-400" />
                  )}
                </button>
              </div>

              {matchedEmployee ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-teal-900/40 dark:bg-[#071112]">
                  <p className="font-semibold text-teal-700 dark:text-teal-400">
                    الملف الوظيفي المرتبط
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">
                    {matchedEmployee.fullName} ({matchedEmployee.employeeCode})
                  </p>
                  <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                    {matchedEmployee.rank} · {matchedEmployee.departmentName}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  لم يتم ربط معرف ديسكورد الخاص بك بملف موظف في الدليل بعد. شارك المعرف الرقمي أعلاه مع المدير العام لإدراجه في سجلك.
                </p>
              )}

              <button
                type="button"
                onClick={handleLogout}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-950/50"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>تسجيل الخروج من ديسكورد</span>
              </button>
            </div>
          )}

          {errorMsg && (
            <p className="text-xs font-medium text-rose-700 dark:text-rose-400">{errorMsg}</p>
          )}
        </div>
      </div>
    </div>
  );
};
