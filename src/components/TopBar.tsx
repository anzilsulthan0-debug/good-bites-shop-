import React from 'react';
import {KeyRound, LogOut, Moon, Smartphone, Sun} from 'lucide-react';
import {SyncStatus} from '../hooks/useLiveSync';
import {UserSession} from '../types';
import {PWAInstallButton} from './PWAInstallButton';

interface TopBarProps {
  user: UserSession;
  syncStatus: SyncStatus;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenDownload: () => void;
  onOpenAccounts?: () => void;
  onGoHome: () => void;
  onLogout: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  user,
  syncStatus,
  theme,
  onToggleTheme,
  onOpenDownload,
  onOpenAccounts,
  onGoHome,
  onLogout,
}) => {
  const isAdmin = user.role === 'admin';

  return (
    <header
      className="no-print sticky top-0 z-40 border-b border-[var(--gb-line)] backdrop-blur-md"
      style={{
        background: 'color-mix(in srgb, var(--gb-surface) 90%, transparent)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-8">
        <button
          type="button"
          onClick={onGoHome}
          className="flex min-w-0 items-center gap-2.5 text-left whitespace-nowrap shrink-0"
        >
          <img
            src="/logo.png"
            alt="Good Bites logo"
            className="h-10 w-10 shrink-0 object-contain"
          />
          <span className="font-display text-xl font-bold tracking-tight text-[var(--gb-ink)]">
            Good <span className="text-[var(--gb-gold)]">Bites</span>
          </span>
        </button>

        <div className="flex items-center gap-2 sm:gap-2.5 overflow-x-auto">
          <div
            className="hidden sm:inline-flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-[var(--gb-muted)] whitespace-nowrap shrink-0"
            role="status"
            aria-live="polite"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                syncStatus === 'on'
                  ? 'bg-[var(--gb-green)]'
                  : syncStatus === 'wait'
                    ? 'bg-[var(--gb-amber)]'
                    : 'bg-[var(--gb-red)]'
              }`}
            />
            <span>
              {syncStatus === 'on'
                ? 'Live sync'
                : syncStatus === 'wait'
                  ? 'Syncing'
                  : 'Offline'}
            </span>
          </div>

          <PWAInstallButton compact />

          <button
            type="button"
            onClick={onOpenDownload}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface)] px-3 py-2 text-xs font-bold text-[var(--gb-ink)] transition hover:border-[var(--gb-gold-2)] hover:bg-[var(--gb-surface-2)] whitespace-nowrap shrink-0"
          >
            <Smartphone className="h-3.5 w-3.5 text-[var(--gb-gold)]" />
            <span className="hidden md:inline">Get App</span>
          </button>

          {isAdmin && onOpenAccounts && (
            <button
              type="button"
              onClick={onOpenAccounts}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface)] px-3 py-2 text-xs font-bold text-[var(--gb-ink)] transition hover:border-[var(--gb-gold-2)] hover:bg-[var(--gb-surface-2)] whitespace-nowrap shrink-0"
            >
              <KeyRound className="h-3.5 w-3.5 text-[var(--gb-gold)]" />
              <span>Accounts</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1.5 rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface)] px-2.5 py-2 text-xs font-bold text-[var(--gb-ink)] transition hover:border-[var(--gb-gold-2)] hover:bg-[var(--gb-surface-2)] whitespace-nowrap shrink-0"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-[var(--gb-gold)]" />
            ) : (
              <Moon className="h-4 w-4 text-[var(--gb-muted)]" />
            )}
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[var(--gb-red-soft)] px-3 py-2 text-xs font-bold text-[var(--gb-red)] transition hover:brightness-95 whitespace-nowrap shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
};
