import React, { useState } from 'react';
import { Moon, ShieldCheck, Sun } from 'lucide-react';
import mohCrestImg from '../assets/images/moh_crest_emblem_1794703637088.jpg';

export type PortalTab = 'directory' | 'staff-portal' | 'departments' | 'ranks' | 'director';

interface TopBarProps {
  activeTab: PortalTab;
  onSelectTab: (tab: PortalTab) => void;
  isDirector: boolean;
  userDisplayName: string | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenAccount: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  userDisplayName,
  theme,
  onToggleTheme,
  onOpenAccount,
}) => {
  const [crestFailed, setCrestFailed] = useState(false);

  const navItems: Array<{ id: PortalTab; label: string }> = [
    { id: 'directory', label: 'سجل الموظفين' },
    { id: 'staff-portal', label: 'قسم الموظفين' },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md dark:border-teal-950/80 dark:bg-[#081314]/95">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-3 shrink-0">
          {!crestFailed ? (
            <img
              src={mohCrestImg}
              alt="شعار وزارة الصحة"
              referrerPolicy="no-referrer"
              onError={() => setCrestFailed(true)}
              className="h-9 w-9 rounded-lg border border-amber-500/30 object-cover shadow-sm shrink-0"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/30 bg-[#091E1E] text-amber-400 shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
          )}

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'التبديل للوضع النهاري' : 'التبديل للوضع الليلي'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-teal-900/60 dark:bg-[#112325] dark:text-slate-200 dark:hover:bg-teal-950 whitespace-nowrap shrink-0"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span>نهاري</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-teal-700" />
                <span>ليلي</span>
              </>
            )}
          </button>

          <a
            href="#directory"
            onClick={(e) => {
              e.preventDefault();
              onSelectTab('directory');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-950 dark:text-white whitespace-nowrap shrink-0"
          >
            بوابة وزارة الصحة
          </a>
        </div>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  isActive
                    ? 'border-teal-700 text-slate-950 font-semibold dark:border-teal-400 dark:text-white'
                    : 'border-transparent text-slate-600 hover:text-slate-950 hover:border-slate-300 dark:text-slate-300 dark:hover:text-white dark:hover:border-teal-800'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onOpenAccount}
            className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:bg-teal-600 dark:hover:bg-teal-500 whitespace-nowrap shrink-0 max-w-[220px] truncate"
          >
            {userDisplayName ? userDisplayName : 'تسجيل الدخول بديسكورد'}
          </button>
        </div>
      </div>

      {/* Mobile navigation strip */}
      <nav className="flex md:hidden items-center gap-4 overflow-x-auto border-t border-slate-100 px-6 py-2 text-xs font-medium text-slate-600 dark:border-teal-950/60 dark:text-slate-300">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 ${
                isActive
                  ? 'border-teal-700 text-slate-950 font-semibold dark:border-teal-400 dark:text-white'
                  : 'border-transparent text-slate-600 dark:text-slate-300'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
