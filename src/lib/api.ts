const TOKEN_STORAGE_KEY = 'goodBitesAuthToken';
const OFFLINE_CACHE_KEY = 'goodBitesOfflineSyncCache';

export function getStoredToken(): string | null {
  try {
    return (
      localStorage.getItem(TOKEN_STORAGE_KEY) ||
      sessionStorage.getItem(TOKEN_STORAGE_KEY)
    );
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (!token) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } else {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
  } catch {
    // ignore storage errors
  }
}

export function saveOfflineSyncCache(data: unknown): void {
  try {
    localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

export function readOfflineSyncCache<T>(): T | null {
  try {
    const raw = localStorage.getItem(OFFLINE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  const data = (await res.json().catch(() => ({}))) as T & {
    ok?: boolean;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }

  return data;
}

export function formatMoney(amount: number): string {
  return (
    '₹' +
    (Number(amount) || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function compressImage(
  file: File,
  maxSize = 800,
  quality = 0.8,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not process image.'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}
