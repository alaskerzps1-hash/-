import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  isBootstrappedAdminEmail,
  OperationType,
  testFirestoreConnection,
} from './firebase';
import {
  AdminRecord,
  AuditLog,
  Department,
  DirectorDecision,
  DiscordRoleMapping,
  DiscordSessionUser,
  Employee,
  RankTierConfig,
  UserProfile,
} from './types';
import { TopBar, PortalTab } from './components/TopBar';
import { EmployeeDirectory } from './components/EmployeeDirectory';
import { EmployeesSection } from './components/EmployeesSection';
import { DepartmentsView } from './components/DepartmentsView';
import { RanksView } from './components/RanksView';
import { DirectorDashboard } from './components/DirectorDashboard';
import { AuthModal } from './components/AuthModal';
import { seedMinistryRegistry } from './data/seedRegistry';

export default function App() {
  const [activeTab, setActiveTab] = useState<PortalTab>('directory');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAdminDocPresent, setIsAdminDocPresent] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [ranks, setRanks] = useState<RankTierConfig[]>([]);
  const [decisions, setDecisions] = useState<DirectorDecision[]>([]);
  const [discordMappings, setDiscordMappings] = useState<DiscordRoleMapping[]>([]);
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [dataLoading, setDataLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [preselectedEmployee, setPreselectedEmployee] = useState<Employee | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [discordUser, setDiscordUser] = useState<DiscordSessionUser | null>(null);
  const [discordStatus, setDiscordStatus] = useState({
    oauthConfigured: false,
    botConfigured: false,
    defaultGuildId: '',
    redirectUri: `${window.location.origin}/auth/discord/callback`,
  });

  const matchedDiscordEmployee = useMemo(() => {
    if (!discordUser || !employees.length) return null;
    return (
      employees.find((e) => e.discordId === discordUser.id) ||
      employees.find(
        (e) =>
          e.discordUsername &&
          e.discordUsername.toLowerCase() === discordUser.username.toLowerCase()
      ) ||
      null
    );
  }, [discordUser, employees]);

  const isBootstrapped = Boolean(
    firebaseUser?.emailVerified && isBootstrappedAdminEmail(firebaseUser.email)
  );
  const isDirector = Boolean(
    discordUser?.isDirector ||
      (matchedDiscordEmployee && matchedDiscordEmployee.rankLevel <= 4) ||
      (firebaseUser?.emailVerified && (isBootstrapped || isAdminDocPresent))
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    void testFirestoreConnection();
  }, []);

  const fetchDiscordMe = useCallback(async () => {
    try {
      const [statusRes, meRes] = await Promise.all([
        fetch('/api/discord/status'),
        fetch('/api/discord/me'),
      ]);
      if (statusRes.ok) {
        const sData = await statusRes.json();
        setDiscordStatus(sData);
      }
      if (meRes.ok) {
        const mData = await meRes.json();
        setDiscordUser(mData.connected ? mData.user : null);
      }
    } catch {
      // Optional
    }
  }, []);

  useEffect(() => {
    void fetchDiscordMe();

    const handlePopupMessage = (event: MessageEvent) => {
      const origin = event.origin || '';
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'DISCORD_OAUTH_SUCCESS') {
        void fetchDiscordMe();
        setToastMsg('تم ربط حساب ديسكورد بالبوابة بنجاح.');
      }
    };
    window.addEventListener('message', handlePopupMessage);
    return () => window.removeEventListener('message', handlePopupMessage);
  }, [fetchDiscordMe]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setUserProfile(null);
        setIsAdminDocPresent(false);
        setAuthReady(true);
        return;
      }

      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const defaultRole =
            user.emailVerified && isBootstrappedAdminEmail(user.email) ? 'director' : 'staff';
          const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email || 'user@moh.gov',
            displayName: user.displayName || user.email?.split('@')[0] || 'منسوب وزارة الصحة',
            role: defaultRole,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(userRef, newProfile);
          setUserProfile({
            ...newProfile,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } else {
          setUserProfile(snap.data() as UserProfile);
        }

        const adminSnap = await getDoc(doc(db, 'admins', user.uid));
        setIsAdminDocPresent(adminSnap.exists());
      } catch (err) {
        console.error('Auth profile bootstrap warning:', err);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;

    setDataLoading(true);
    const unsubs: Array<() => void> = [];

    const empQuery = isBootstrapped
      ? collection(db, 'employees')
      : query(collection(db, 'employees'), where('visibility', '==', 'public'));

    unsubs.push(
      onSnapshot(
        empQuery,
        (snapshot) => {
          setEmployees(snapshot.docs.map((d) => d.data() as Employee));
          setDataLoading(false);
        },
        (err) => {
          setDataLoading(false);
          handleFirestoreError(err, OperationType.LIST, 'employees');
        }
      )
    );

    const deptQuery = isBootstrapped
      ? collection(db, 'departments')
      : query(collection(db, 'departments'), where('visibility', '==', 'public'));

    unsubs.push(
      onSnapshot(
        deptQuery,
        (snapshot) => {
          setDepartments(snapshot.docs.map((d) => d.data() as Department));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'departments')
      )
    );

    const rankQuery = isBootstrapped
      ? collection(db, 'ranks')
      : query(collection(db, 'ranks'), where('visibility', '==', 'public'));

    unsubs.push(
      onSnapshot(
        rankQuery,
        (snapshot) => {
          setRanks(snapshot.docs.map((d) => d.data() as RankTierConfig));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'ranks')
      )
    );

    if (isDirector && firebaseUser) {
      const decQuery = isBootstrapped
        ? collection(db, 'directorDecisions')
        : query(collection(db, 'directorDecisions'), where('issuedBy', '==', firebaseUser.uid));

      unsubs.push(
        onSnapshot(
          decQuery,
          (snapshot) => {
            setDecisions(snapshot.docs.map((d) => d.data() as DirectorDecision));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'directorDecisions')
        )
      );

      const mapQuery = isBootstrapped
        ? collection(db, 'discordMappings')
        : query(collection(db, 'discordMappings'), where('autoSync', '==', true));

      unsubs.push(
        onSnapshot(
          mapQuery,
          (snapshot) => {
            setDiscordMappings(snapshot.docs.map((d) => d.data() as DiscordRoleMapping));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'discordMappings')
        )
      );

      const adminQuery = isBootstrapped
        ? collection(db, 'admins')
        : query(collection(db, 'admins'), where('uid', '==', firebaseUser.uid));

      unsubs.push(
        onSnapshot(
          adminQuery,
          (snapshot) => {
            setAdmins(snapshot.docs.map((d) => d.data() as AdminRecord));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'admins')
        )
      );

      const auditQuery = isBootstrapped
        ? collection(db, 'auditLogs')
        : query(collection(db, 'auditLogs'), where('actorUid', '==', firebaseUser.uid));

      unsubs.push(
        onSnapshot(
          auditQuery,
          (snapshot) => {
            setAuditLogs(snapshot.docs.map((d) => d.data() as AuditLog));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'auditLogs')
        )
      );
    } else {
      setDecisions([]);
      setDiscordMappings([]);
      setAdmins([]);
      setAuditLogs([]);
    }

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [authReady, isBootstrapped, isDirector, firebaseUser]);

  const handleConnectDiscord = async () => {
    const res = await fetch('/api/discord/auth-url');
    const data = await res.json();
    if (!res.ok || !data.url) {
      throw new Error(data.error || 'تعذر بدء مصادقة ديسكورد.');
    }
    const popup = window.open(data.url, 'discord_oauth_popup', 'width=600,height=720');
    if (!popup) {
      setToastMsg('يرجى السماح بالنوافذ المنبثقة لإتمام ربط ديسكورد.');
    }
  };

  const handleDisconnectDiscord = async () => {
    await fetch('/api/discord/logout', { method: 'POST' });
    setDiscordUser(null);
    setActiveTab('directory');
    setToastMsg('تم تسجيل الخروج من ديسكورد.');
  };

  const discordDisplayName = discordUser
    ? discordUser.serverNick || discordUser.displayName || discordUser.globalName
    : null;

  const handleSeedRegistry = async () => {
    if (!firebaseUser || !isDirector) return;
    await seedMinistryRegistry(
      firebaseUser.uid,
      discordDisplayName || userProfile?.displayName || firebaseUser.displayName || 'المدير العام'
    );
    setToastMsg('تم اعتماد وتهيئة السجل التأسيسي لوزارة الصحة بنجاح.');
  };

  const actorContext = firebaseUser
    ? {
        uid: firebaseUser.uid,
        name: discordDisplayName || userProfile?.displayName || firebaseUser.displayName || 'المدير العام',
        email: firebaseUser.email || '',
      }
    : discordUser
      ? {
          uid: `discord_${discordUser.id}`,
          name: discordDisplayName || discordUser.globalName,
          email: `@${discordUser.username}`,
        }
      : null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-[#071112] dark:text-slate-100">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isDirector={isDirector}
        userDisplayName={discordDisplayName}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        onOpenAccount={() => setAuthModalOpen(true)}
      />

      {toastMsg && (
        <div className="mx-auto mt-4 w-full max-w-[1440px] px-6">
          <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-semibold text-teal-900 dark:border-teal-800/60 dark:bg-teal-950/60 dark:text-teal-200">
            <span>{toastMsg}</span>
            <button
              type="button"
              onClick={() => setToastMsg(null)}
              className="text-teal-700 hover:underline dark:text-teal-300"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-8">
        {activeTab === 'directory' && (
          <EmployeeDirectory
            employees={employees}
            departments={departments}
            loading={dataLoading}
            isDirector={isDirector}
            isSignedIn={Boolean(discordUser)}
            onOpenAuthModal={() => setAuthModalOpen(true)}
            onSeedRegistry={handleSeedRegistry}
            onOpenDirectorAddEmployee={() => {
              setPreselectedEmployee(null);
              setActiveTab('director');
            }}
            onEditEmployeeInDirector={(emp) => {
              setPreselectedEmployee(emp);
              setActiveTab('director');
            }}
          />
        )}

        {activeTab === 'staff-portal' && (
          <EmployeesSection
            employees={employees}
            departments={departments}
            loading={dataLoading}
            isDirector={isDirector}
            discordUser={discordUser}
            botConfigured={discordStatus.botConfigured}
            onOpenAuthModal={() => setAuthModalOpen(true)}
            onOpenDirectorAddEmployee={() => {
              setPreselectedEmployee(null);
              setActiveTab('director');
            }}
            onEditEmployeeInDirector={(emp) => {
              setPreselectedEmployee(emp);
              setActiveTab('director');
            }}
          />
        )}

        {activeTab === 'departments' && (
          <DepartmentsView
            departments={departments}
            employees={employees}
            isDirector={isDirector}
            actor={actorContext}
          />
        )}

        {activeTab === 'ranks' && (
          <RanksView
            ranks={ranks}
            employees={employees}
            isDirector={isDirector}
            actor={actorContext}
          />
        )}

        {activeTab === 'director' && isDirector && actorContext && (
          <DirectorDashboard
            employees={employees}
            departments={departments}
            ranks={ranks}
            decisions={decisions}
            discordMappings={discordMappings}
            admins={admins}
            auditLogs={auditLogs}
            actor={actorContext}
            onSeedRegistry={handleSeedRegistry}
            preselectedEmployee={preselectedEmployee}
            onClearPreselectedEmployee={() => setPreselectedEmployee(null)}
            discordStatus={discordStatus}
          />
        )}
      </main>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        discordUser={discordUser}
        matchedEmployee={matchedDiscordEmployee}
        isDirector={isDirector}
        discordOAuthConfigured={discordStatus.oauthConfigured}
        discordRedirectUri={discordStatus.redirectUri}
        onConnectDiscord={handleConnectDiscord}
        onDisconnectDiscord={handleDisconnectDiscord}
      />
    </div>
  );
}
