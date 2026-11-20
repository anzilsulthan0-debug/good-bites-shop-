import React, {useState} from 'react';
import {ArrowRight, Lock, Moon, Smartphone, Sun, User} from 'lucide-react';
import {apiFetch, setStoredToken} from '../lib/api';
import {UserSession} from '../types';
import {PWAInstallButton} from './PWAInstallButton';

interface LoginViewProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onLoginSuccess: (user: UserSession) => void;
  onOpenDownload: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  theme,
  onToggleTheme,
  onLoginSuccess,
  onOpenDownload,
}) => {
  const [tab, setTab] = useState<'team' | 'admin'>('team');
  const [teamUsername, setTeamUsername] = useState('');
  const [teamPassword, setTeamPassword] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ok: boolean; user: UserSession; token: string}>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            mode: 'team',
            username: teamUsername.trim(),
            password: teamPassword,
          }),
        },
      );
      setStoredToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ok: boolean; user: UserSession; token: string}>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            mode: 'admin',
            username: adminUsername.trim() || undefined,
            password: adminPassword,
          }),
        },
      );
      setStoredToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wrong admin password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-between px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="rounded-3xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-6 shadow-[var(--gb-shadow)] sm:p-8">
          <div className="mb-6 text-center">
            <img
              src="/logo.png"
              alt="Good Bites logo"
              className="mx-auto mb-3 h-16 w-16 object-contain"
            />
            <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--gb-gold)]">
              Good Bites
            </h1>
            <p className="mt-1 text-xs font-semibold tracking-wider text-[var(--gb-muted)]">
              Shop Management & Live Operations
            </p>
          </div>

          <div
            className="mb-6 grid grid-cols-2 rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] p-1"
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'team'}
              onClick={() => {
                setTab('team');
                setError('');
              }}
              className={`min-h-[42px] rounded-lg text-xs font-bold transition ${
                tab === 'team'
                  ? 'bg-[var(--gb-gold)] text-white shadow-sm'
                  : 'text-[var(--gb-muted)] hover:text-[var(--gb-ink)]'
              }`}
            >
              Team Login
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'admin'}
              onClick={() => {
                setTab('admin');
                setError('');
              }}
              className={`min-h-[42px] rounded-lg text-xs font-bold transition ${
                tab === 'admin'
                  ? 'bg-[var(--gb-gold)] text-white shadow-sm'
                  : 'text-[var(--gb-muted)] hover:text-[var(--gb-ink)]'
              }`}
            >
              Admin Login
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-[var(--gb-red)]/30 bg-[var(--gb-red-soft)] px-3.5 py-2.5 text-xs font-semibold text-[var(--gb-red)]"
            >
              {error}
            </div>
          )}

          {tab === 'team' ? (
            <form onSubmit={handleTeamSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="team-username"
                  className="mb-1.5 block text-xs font-bold text-[var(--gb-muted)]"
                >
                  Username
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gb-muted)]" />
                  <input
                    id="team-username"
                    type="text"
                    autoComplete="username"
                    value={teamUsername}
                    onChange={e => setTeamUsername(e.target.value)}
                    placeholder="Enter username"
                    required
                    className="w-full min-h-[44px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] pl-10 pr-4 text-sm text-[var(--gb-ink)] outline-none transition focus:border-[var(--gb-gold)]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="team-password"
                  className="mb-1.5 block text-xs font-bold text-[var(--gb-muted)]"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gb-muted)]" />
                  <input
                    id="team-password"
                    type="password"
                    autoComplete="current-password"
                    value={teamPassword}
                    onChange={e => setTeamPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    className="w-full min-h-[44px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] pl-10 pr-4 text-sm text-[var(--gb-ink)] outline-none transition focus:border-[var(--gb-gold)]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-sm transition hover:brightness-95 disabled:opacity-60"
                style={{background: 'linear-gradient(135deg, var(--gb-gold), var(--gb-gold-2))'}}
              >
                <span>{loading ? 'Signing in…' : 'Login'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="admin-username"
                  className="mb-1.5 block text-xs font-bold text-[var(--gb-muted)]"
                >
                  Admin Username (optional if default)
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gb-muted)]" />
                  <input
                    id="admin-username"
                    type="text"
                    autoComplete="username"
                    value={adminUsername}
                    onChange={e => setAdminUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full min-h-[44px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] pl-10 pr-4 text-sm text-[var(--gb-ink)] outline-none transition focus:border-[var(--gb-gold)]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="admin-password"
                  className="mb-1.5 block text-xs font-bold text-[var(--gb-muted)]"
                >
                  Admin Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gb-muted)]" />
                  <input
                    id="admin-password"
                    type="password"
                    autoComplete="current-password"
                    value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)}
                    placeholder="Enter admin password"
                    required
                    className="w-full min-h-[44px] rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] pl-10 pr-4 text-sm text-[var(--gb-ink)] outline-none transition focus:border-[var(--gb-gold)]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-sm transition hover:brightness-95 disabled:opacity-60"
                style={{background: 'linear-gradient(135deg, var(--gb-gold), var(--gb-gold-2))'}}
              >
                <span>{loading ? 'Signing in…' : 'Login as Admin'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--gb-line)] pt-5">
            <button
              type="button"
              onClick={onOpenDownload}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] px-3.5 py-2 text-xs font-bold text-[var(--gb-ink)] transition hover:border-[var(--gb-gold-2)]"
            >
              <Smartphone className="h-4 w-4 text-[var(--gb-gold)]" />
              <span>Download Mobile App</span>
            </button>

            <div className="flex items-center gap-2">
              <PWAInstallButton compact />
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] text-[var(--gb-ink)] transition hover:border-[var(--gb-gold-2)]"
                aria-label="Toggle dark mode"
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4 text-[var(--gb-gold)]" />
                ) : (
                  <Moon className="h-4 w-4 text-[var(--gb-muted)]" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <footer className="mt-6 text-center text-xs text-[var(--gb-muted)]">
        © {new Date().getFullYear()} Good Bites — Shop Management
      </footer>
    </div>
  );
};
