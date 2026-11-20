import React, {useEffect, useState} from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  RefreshCw,
  Share,
  ShieldCheck,
  Smartphone,
  Terminal,
} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';
import {apiFetch} from '../lib/api';
import {AppBuildStatus} from '../types';

interface DownloadAppViewProps {
  onBack: () => void;
}

export const DownloadAppView: React.FC<DownloadAppViewProps> = ({onBack}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [status, setStatus] = useState<AppBuildStatus | null>(null);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);
  const [installMessage, setInstallMessage] = useState('');

  useEffect(() => {
    apiFetch<AppBuildStatus & {ok: boolean}>('/api/app/status')
      .then(res => setStatus(res))
      .catch(() => {
        setStatus({
          appName: 'Good Bites',
          version: '2.0.0',
          apkAvailable: false,
          apkSizeBytes: null,
          apkUrl: null,
          capacitorConfigured: true,
          androidProjectReady: true,
          iosProjectReady: true,
        });
      });
  }, []);

  const handleAndroidInstall = async () => {
    setInstallMessage('');
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        setInstallMessage('Good Bites has been installed on your device!');
      }
      return;
    }
    setShowAndroidGuide(true);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="mb-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[var(--gb-line)] bg-[var(--gb-surface)] px-3.5 text-xs font-bold text-[var(--gb-ink)] hover:border-[var(--gb-gold-2)] hover:bg-[var(--gb-surface-2)]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Good Bites</span>
        </button>
      </div>

      {/* Hero Header */}
      <section className="mb-8 rounded-3xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-6 shadow-[var(--gb-shadow)] sm:p-10">
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
          <img
            src="/logo.png"
            alt="Good Bites logo"
            className="h-24 w-24 shrink-0 rounded-2xl object-contain"
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-[var(--gb-gold-ink)]">
              Version {status?.version || '2.0.0'} · Android & iOS Mobile Experience
            </div>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-[var(--gb-ink)] sm:text-4xl">
              Download Good Bites App
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--gb-muted)]">
              Install Good Bites directly onto your Android phone or iPhone for full-screen mobile access, persistent login sessions, receipt printing, and instant real-time updates synced with the website.
            </p>
          </div>
        </div>

        {isInstalled && (
          <div className="mt-6 flex items-center gap-2.5 rounded-2xl bg-[var(--gb-green-soft)] px-4 py-3 text-xs font-bold text-[var(--gb-green)]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Good Bites is currently running as an installed standalone app on this device.</span>
          </div>
        )}

        {installMessage && (
          <div className="mt-6 flex items-center gap-2.5 rounded-2xl bg-[var(--gb-green-soft)] px-4 py-3 text-xs font-bold text-[var(--gb-green)]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{installMessage}</span>
          </div>
        )}
      </section>

      {/* Android & iOS Cards */}
      <section className="grid gap-6 md:grid-cols-2">
        {/* Android Card */}
        <article className="flex flex-col rounded-3xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-6 shadow-[var(--gb-shadow)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--gb-gold-soft)] text-[var(--gb-gold-ink)]">
              <Smartphone className="h-6 w-6" />
            </div>
            <span className="text-xs font-bold text-[var(--gb-green)]">
              Android 8.0+ · Full-Screen App
            </span>
          </div>

          <h2 className="mt-4 font-display text-2xl font-bold text-[var(--gb-ink)]">
            Android Application
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--gb-muted)]">
            Install Good Bites as a live full-screen app directly from Chrome on Android, or build/download the signed Capacitor APK package.
          </p>

          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={() => void handleAndroidInstall()}
              className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-sm transition hover:brightness-95"
              style={{
                background: 'linear-gradient(135deg, var(--gb-gold), var(--gb-gold-2))',
              }}
            >
              <Download className="h-4 w-4" />
              <span>
                {isInstallable
                  ? 'Install Android App Now'
                  : 'Install Android App (Live WebAPK)'}
              </span>
            </button>

            {status?.apkAvailable && status.apkUrl ? (
              <a
                href={status.apkUrl}
                download="Good-Bites-v2.0.0.apk"
                className="flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl border border-[var(--gb-gold)] bg-[var(--gb-gold-soft)] text-sm font-bold text-[var(--gb-gold-ink)] transition hover:brightness-95"
              >
                <Download className="h-4 w-4" />
                <span>
                  Download Signed APK (
                  {status.apkSizeBytes
                    ? `${(status.apkSizeBytes / (1024 * 1024)).toFixed(1)} MB`
                    : 'Android'}
                  )
                </span>
              </a>
            ) : (
              <div className="rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] p-4 text-xs leading-relaxed text-[var(--gb-muted)]">
                <div className="mb-1 flex items-center gap-1.5 font-bold text-[var(--gb-ink)]">
                  <Terminal className="h-3.5 w-3.5 text-[var(--gb-gold)]" />
                  <span>Capacitor Signed APK Project Prepared</span>
                </div>
                <p>
                  The native Capacitor <code className="font-mono">/android</code> project is configured and ready. Because this cloud preview host does not include Java JDK / Android SDK, the binary <code className="font-mono">.apk</code> is not pre-compiled here. Run{' '}
                  <code className="font-mono font-bold text-[var(--gb-ink)]">npm run build:apk</code> on a machine with Android Studio / JDK to output the signed APK into{' '}
                  <code className="font-mono">public/downloads/good-bites.apk</code>, or use the{' '}
                  <strong>Install Android App</strong> button above to install the full-screen live app immediately!
                </p>
              </div>
            )}
          </div>

          {showAndroidGuide && (
            <div className="mt-4 rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] p-4 text-xs text-[var(--gb-ink)]">
              <div className="mb-2 font-bold">Android Chrome Installation Steps</div>
              <ol className="list-decimal space-y-1.5 pl-4 text-[var(--gb-muted)]">
                <li>
                  Open this Good Bites link in <strong>Google Chrome</strong> on your Android phone.
                </li>
                <li>
                  Tap the <strong>⋮ Menu</strong> in the top-right corner.
                </li>
                <li>
                  Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>) and confirm <strong>Install</strong>.
                </li>
                <li>
                  Launch Good Bites from your home screen — it opens full-screen with live updates!
                </li>
              </ol>
            </div>
          )}
        </article>

        {/* iOS Card (NO APK download for iOS!) */}
        <article className="flex flex-col rounded-3xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-6 shadow-[var(--gb-shadow)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--gb-gold-soft)] text-[var(--gb-gold-ink)]">
              <Share className="h-6 w-6" />
            </div>
            <span className="text-xs font-bold text-[var(--gb-gold-ink)]">
              iPhone & iPad · Safari PWA
            </span>
          </div>

          <h2 className="mt-4 font-display text-2xl font-bold text-[var(--gb-ink)]">
            iOS Application
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--gb-muted)]">
            Install Good Bites on iPhone or iPad via Safari Add to Home Screen for a standalone app icon, splash screen, and live sync.
          </p>

          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={() => setShowIOSGuide(!showIOSGuide)}
              className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[var(--gb-gold)] bg-[var(--gb-gold-soft)] text-sm font-bold text-[var(--gb-gold-ink)] transition hover:brightness-95"
            >
              <Smartphone className="h-4 w-4" />
              <span>
                {isIOS ? 'Install iOS App (Show Steps)' : 'Install iOS App (iPhone / iPad)'}
              </span>
            </button>

            <div className="rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface-2)] p-4 text-xs leading-relaxed text-[var(--gb-ink)]">
              <div className="mb-2 font-bold">iPhone & iPad Safari Steps</div>
              <ol className="list-decimal space-y-1.5 pl-4 text-[var(--gb-muted)]">
                <li>
                  Open this Good Bites website in <strong>Safari</strong> on your iPhone or iPad.
                </li>
                <li>
                  Tap the <strong>Share</strong> icon (square with upward arrow) in the Safari toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong>Add</strong> — Good Bites appears with its gold logo and opens full-screen without browser bars.
                </li>
              </ol>
              {status?.iosProjectReady && (
                <p className="mt-3 border-t border-[var(--gb-line)] pt-2.5 text-[11px] text-[var(--gb-muted)]">
                  Capacitor <code className="font-mono">/ios</code> Xcode workspace is also prepared for TestFlight and App Store signing on macOS.
                </p>
              )}
            </div>
          </div>
        </article>
      </section>

      {/* Shared Live Experience Guarantees */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="flex items-start gap-3.5 rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-5">
          <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-[var(--gb-gold)]" />
          <div>
            <h3 className="text-sm font-bold text-[var(--gb-ink)]">
              Automatic Live Updates
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--gb-muted)]">
              Changes made by Admin on the website—new shops, Quail Egg / Egg Pickle / Nuts updates, receipts, or password updates—appear live inside the mobile app via WebSockets.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3.5 rounded-2xl border border-[var(--gb-line)] bg-[var(--gb-surface)] p-5">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--gb-gold)]" />
          <div>
            <h3 className="text-sm font-bold text-[var(--gb-ink)]">
              Secure Sessions & Offline Safety
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--gb-muted)]">
              Team and Admin permissions stay strictly enforced on the server. Sensitive login and admin API responses are never cached by the service worker.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};
