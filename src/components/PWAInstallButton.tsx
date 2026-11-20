import React, {useState} from 'react';
import {Download, Share, Smartphone, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({compact = false}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:brightness-95 active:scale-[0.98] whitespace-nowrap shrink-0"
        style={{background: 'linear-gradient(135deg, var(--gb-gold), var(--gb-gold-2))'}}
      >
        <Download className="h-3.5 w-3.5" />
        <span>{compact ? 'Install App' : 'Install Good Bites App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface)] px-3.5 py-2 text-xs font-bold text-[var(--gb-ink)] transition hover:border-[var(--gb-gold-2)] hover:bg-[var(--gb-surface-2)] whitespace-nowrap shrink-0"
        >
          <Smartphone className="h-3.5 w-3.5 text-[var(--gb-gold)]" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl font-bold text-[var(--gb-ink)]">
                    Install on iPhone or iPad
                  </h3>
                  <p className="mt-1 text-xs text-[var(--gb-muted)]">
                    Add Good Bites to your Home Screen for full-screen live access.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--gb-line)] text-[var(--gb-muted)] hover:bg-[var(--gb-surface-2)]"
                  aria-label="Close guide"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <ol className="mt-5 space-y-3 text-sm text-[var(--gb-ink)]">
                <li className="flex items-start gap-3 rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--gb-gold)] text-xs font-bold text-white">
                    1
                  </span>
                  <span>
                    Open this site in <strong>Safari</strong> and tap the{' '}
                    <Share className="inline h-4 w-4 text-[var(--gb-gold)]" />{' '}
                    <strong>Share</strong> button.
                  </span>
                </li>
                <li className="flex items-start gap-3 rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--gb-gold)] text-xs font-bold text-white">
                    2
                  </span>
                  <span>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-3 rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--gb-gold)] text-xs font-bold text-white">
                    3
                  </span>
                  <span>
                    Tap <strong>Add</strong> in the top right to launch Good Bites full-screen.
                  </span>
                </li>
              </ol>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl font-bold text-sm text-white"
                style={{background: 'linear-gradient(135deg, var(--gb-gold), var(--gb-gold-2))'}}
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
