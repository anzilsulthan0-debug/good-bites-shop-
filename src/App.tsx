import {useCallback, useEffect, useRef, useState} from 'react';
import {WifiOff} from 'lucide-react';
import {AccountsManagerModal} from './components/AccountsManagerModal';
import {DashboardView} from './components/DashboardView';
import {DownloadAppView} from './components/DownloadAppView';
import {LoginView} from './components/LoginView';
import {ShopDetailView} from './components/ShopDetailView';
import {TopBar} from './components/TopBar';
import {useLiveSync} from './hooks/useLiveSync';
import {useOnlineStatus} from './hooks/useOnlineStatus';
import {
  apiFetch,
  readOfflineSyncCache,
  saveOfflineSyncCache,
  setStoredToken,
} from './lib/api';
import {CategoryCounts, Receipt, Shop, UserSession} from './types';

interface SyncPayload {
  ok: boolean;
  categoryCounts: CategoryCounts;
  shops: Shop[];
  receipts: Record<string, Receipt[]>;
}

interface ToastItem {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

const INITIAL_COUNTS: CategoryCounts = {
  'Quail Egg': 0,
  'Egg Pickle': 0,
  Nuts: 0,
};

export default function App() {
  const isOnline = useOnlineStatus();

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('goodBitesTheme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const [user, setUser] = useState<UserSession | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [view, setView] = useState<'dashboard' | 'shop' | 'download'>(() => {
    const p = window.location.pathname;
    if (p === '/download') return 'download';
    if (p.startsWith('/shop/')) return 'shop';
    return 'dashboard';
  });
  const [selectedShopId, setSelectedShopId] = useState<string | null>(() => {
    const p = window.location.pathname;
    if (p.startsWith('/shop/')) {
      return decodeURIComponent(p.slice(6));
    }
    const q = new URLSearchParams(window.location.search).get('id');
    return q || null;
  });

  const [shops, setShops] = useState<Shop[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<CategoryCounts>(INITIAL_COUNTS);
  const [receiptsByShop, setReceiptsByShop] = useState<Record<string, Receipt[]>>({});
  const [accountsModalOpen, setAccountsModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const migrationRanRef = useRef(false);

  const addToast = useCallback((message: string, kind: 'info' | 'error' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev.slice(-3), {id, message, kind}]);
    window.setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3200);
  }, []);

  // Theme sync
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try {
      localStorage.setItem('goodBitesTheme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Browser back/forward navigation
  useEffect(() => {
    const onPopState = () => {
      const p = window.location.pathname;
      if (p === '/download') {
        setView('download');
        setSelectedShopId(null);
      } else if (p.startsWith('/shop/')) {
        setView('shop');
        setSelectedShopId(decodeURIComponent(p.slice(6)));
      } else {
        setView('dashboard');
        setSelectedShopId(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((nextView: 'dashboard' | 'shop' | 'download', shopId?: string) => {
    setView(nextView);
    if (nextView === 'shop' && shopId) {
      setSelectedShopId(shopId);
      window.history.pushState({}, '', `/shop/${encodeURIComponent(shopId)}`);
    } else if (nextView === 'download') {
      setSelectedShopId(null);
      window.history.pushState({}, '', '/download');
    } else {
      setSelectedShopId(null);
      window.history.pushState({}, '', '/');
    }
    window.scrollTo({top: 0, behavior: 'smooth'});
  }, []);

  const refreshSync = useCallback(async () => {
    try {
      const res = await apiFetch<SyncPayload>('/api/sync');
      setShops(res.shops || []);
      setCategoryCounts(res.categoryCounts || INITIAL_COUNTS);
      setReceiptsByShop(res.receipts || {});
      saveOfflineSyncCache(res);
    } catch (err) {
      const cached = readOfflineSyncCache<SyncPayload>();
      if (cached && !navigator.onLine) {
        setShops(cached.shops || []);
        setCategoryCounts(cached.categoryCounts || INITIAL_COUNTS);
        setReceiptsByShop(cached.receipts || {});
      } else if (err instanceof Error && err.message.includes('Authentication')) {
        setUser(null);
        setStoredToken(null);
      }
    }
  }, []);

  // Verify existing session on boot
  useEffect(() => {
    let active = true;
    apiFetch<{ok: boolean; user: UserSession}>('/api/auth/me')
      .then(res => {
        if (!active) return;
        setUser(res.user);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
      })
      .finally(() => {
        if (active) setCheckingAuth(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Load shops & receipts once authenticated + import any legacy localStorage shops non-destructively
  useEffect(() => {
    if (!user) return;
    const runInitialLoad = async () => {
      if (user.role === 'admin' && !migrationRanRef.current) {
        migrationRanRef.current = true;
        try {
          const rawLegacyShops = localStorage.getItem('businessManagerDemoShops');
          const legacyShops = rawLegacyShops ? JSON.parse(rawLegacyShops) : [];
          if (Array.isArray(legacyShops) && legacyShops.length > 0) {
            const legacyReceipts: Record<string, unknown[]> = {};
            for (const s of legacyShops) {
              const sid = String(s.id || s._id || '');
              if (!sid) continue;
              const rawR = localStorage.getItem(`businessManagerReceipts_${sid}`);
              if (rawR) {
                legacyReceipts[sid] = JSON.parse(rawR);
              }
            }
            const res = await apiFetch<{ok: boolean; importedShops: number}>(
              '/api/admin/migrate-local',
              {
                method: 'POST',
                body: JSON.stringify({
                  shops: legacyShops,
                  receipts: legacyReceipts,
                }),
              },
            );
            if (res.importedShops > 0) {
              addToast(
                `Preserved ${res.importedShops} existing shop(s) into live database`,
              );
            }
          }
        } catch {
          // ignore legacy import errors
        }
      }
      await refreshSync();
    };
    void runInitialLoad();
  }, [user, refreshSync, addToast]);

  // Real-time WebSocket listener
  const syncStatus = useLiveSync(Boolean(user), msg => {
    void refreshSync();
    if (msg.scope === 'shops') {
      addToast('Shops updated live');
    } else if (msg.scope === 'receipts') {
      addToast('Receipts updated live');
    }
  });

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', {method: 'POST'});
    } catch {
      // ignore
    }
    setStoredToken(null);
    setUser(null);
    setShops([]);
    setCategoryCounts(INITIAL_COUNTS);
    setReceiptsByShop({});
    setAccountsModalOpen(false);
    navigate('dashboard');
  };

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <img
            src="/logo.png"
            alt="Good Bites"
            className="mx-auto mb-3 h-16 w-16 animate-pulse object-contain"
          />
          <p className="text-xs font-bold text-[var(--gb-muted)]">
            Connecting to Good Bites…
          </p>
        </div>
      </div>
    );
  }

  // Public Download App route works whether logged in or logged out
  if (!user && view === 'download') {
    return (
      <>
        <DownloadAppView onBack={() => navigate('dashboard')} />
        <ToastRack toasts={toasts} />
        <OfflineBanner isOnline={isOnline} />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <LoginView
          theme={theme}
          onToggleTheme={toggleTheme}
          onLoginSuccess={loggedUser => {
            setUser(loggedUser);
            addToast(`Welcome, ${loggedUser.displayRole}`);
          }}
          onOpenDownload={() => navigate('download')}
        />
        <ToastRack toasts={toasts} />
        <OfflineBanner isOnline={isOnline} />
      </>
    );
  }

  const activeShop = selectedShopId
    ? shops.find(s => s.id === selectedShopId) || null
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        user={user}
        syncStatus={syncStatus}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenDownload={() => navigate('download')}
        onOpenAccounts={
          user.role === 'admin' ? () => setAccountsModalOpen(true) : undefined
        }
        onGoHome={() => navigate('dashboard')}
        onLogout={() => void handleLogout()}
      />

      <div className="flex-1">
        {view === 'download' ? (
          <DownloadAppView onBack={() => navigate('dashboard')} />
        ) : view === 'shop' && activeShop ? (
          <ShopDetailView
            user={user}
            shop={activeShop}
            receipts={receiptsByShop[activeShop.id] || []}
            onBack={() => navigate('dashboard')}
            onRefreshSync={refreshSync}
            onToast={addToast}
          />
        ) : (
          <DashboardView
            user={user}
            shops={shops}
            categoryCounts={categoryCounts}
            onRefreshSync={refreshSync}
            onOpenShop={shopId => navigate('shop', shopId)}
            onOpenAccounts={() => setAccountsModalOpen(true)}
            onToast={addToast}
          />
        )}
      </div>

      <footer className="no-print py-6 text-center text-xs text-[var(--gb-muted)]">
        © {new Date().getFullYear()} Good Bites · Real-time Shop & Receipt Management
      </footer>

      {user.role === 'admin' && (
        <AccountsManagerModal
          open={accountsModalOpen}
          onClose={() => setAccountsModalOpen(false)}
          onToast={addToast}
          onAdminSessionUpdated={(updatedUser, token) => {
            setStoredToken(token);
            setUser(updatedUser);
          }}
        />
      )}

      <ToastRack toasts={toasts} />
      <OfflineBanner isOnline={isOnline} />
    </div>
  );
}

function ToastRack({toasts}: {toasts: ToastItem[]}) {
  if (!toasts.length) return null;
  return (
    <div
      aria-live="polite"
      className="no-print fixed bottom-5 left-1/2 z-[200] flex w-[min(380px,calc(100vw-28px))] -translate-x-1/2 flex-col gap-2"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          className={`rounded-xl px-4 py-3 text-xs font-bold shadow-xl ${
            t.kind === 'error'
              ? 'bg-[var(--gb-red)] text-white'
              : 'bg-[var(--gb-ink)] text-[var(--gb-bg)]'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

function OfflineBanner({isOnline}: {isOnline: boolean}) {
  if (isOnline) return null;
  return (
    <div className="no-print fixed bottom-4 left-4 z-[190] flex items-center gap-2 rounded-xl bg-[var(--gb-amber)] px-3.5 py-2 text-xs font-bold text-white shadow-lg">
      <WifiOff className="h-3.5 w-3.5" />
      <span>Offline Mode — Showing cached shops & receipts</span>
    </div>
  );
}
