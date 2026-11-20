import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const VALID_CATEGORIES = ['Quail Egg', 'Egg Pickle', 'Nuts'] as const;
export type ProductCategory = (typeof VALID_CATEGORIES)[number];

export interface ShopRecord {
  id: string;
  name: string;
  category: ProductCategory;
  legacyCategory?: string;
  status: 'active' | 'inactive';
  description: string;
  address: string;
  phone: string;
  image: string;
  username: string;
  passwordHash: string;
  encryptedPassword: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptRecord {
  id: string;
  receiptNumber: string;
  shopId: string;
  shopName: string;
  customerName: string;
  date: string;
  productName: ProductCategory;
  quantity: number;
  givenQuantity: number;
  price: number;
  total: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamAccountRecord {
  id: string;
  name: string;
  loginId: string;
  passwordHash: string;
  encryptedPassword: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAccountRecord {
  id: 'admin';
  username: string;
  displayName: string;
  passwordHash: string;
  updatedAt: string;
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  detail: string;
}

export interface DatabaseState {
  adminAccount: AdminAccountRecord;
  teams: TeamAccountRecord[];
  shops: ShopRecord[];
  receipts: Record<string, ReceiptRecord[]>;
  activityLog: ActivityEntry[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const LEGACY_CATEGORY_MAP: Record<string, ProductCategory> = {
  'quail egg': 'Quail Egg',
  'egg pickle': 'Egg Pickle',
  nuts: 'Nuts',
  'grocery & mart': 'Quail Egg',
  'food & dining': 'Egg Pickle',
  'health & pharmacy': 'Nuts',
  'fashion & wear': 'Nuts',
  'tech & mobiles': 'Quail Egg',
  'home & living': 'Egg Pickle',
  general: 'Quail Egg',
};

export function normalizeCategory(raw?: string | null): {
  category: ProductCategory;
  legacyCategory?: string;
} {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return {category: 'Quail Egg'};
  }
  const exact = VALID_CATEGORIES.find(c => c.toLowerCase() === trimmed.toLowerCase());
  if (exact) {
    return {category: exact};
  }
  const mapped = LEGACY_CATEGORY_MAP[trimmed.toLowerCase()];
  if (mapped) {
    return {category: mapped, legacyCategory: trimmed};
  }
  return {category: 'Quail Egg', legacyCategory: trimmed};
}

function getCryptoSecret(): Buffer {
  const envSecret = process.env.SESSION_SECRET || process.env.GOOD_BITES_SECRET || '';
  if (envSecret) {
    return crypto.createHash('sha256').update(envSecret).digest();
  }
  const secretFile = path.join(DATA_DIR, '.secret');
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {recursive: true});
  }
  if (fs.existsSync(secretFile)) {
    const hex = fs.readFileSync(secretFile, 'utf8').trim();
    if (hex.length >= 64) {
      return Buffer.from(hex.slice(0, 64), 'hex');
    }
  }
  const generated = crypto.randomBytes(32);
  fs.writeFileSync(secretFile, generated.toString('hex'), {mode: 0o600});
  return generated;
}

const SERVER_SECRET = getCryptoSecret();

export function getSigningKey(): Buffer {
  return SERVER_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = String(storedHash || '').split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function encryptCredential(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SERVER_SECRET, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptCredential(payload: string): string {
  try {
    const parts = String(payload || '').split(':');
    if (parts.length !== 3) return '';
    const [ivHex, tagHex, dataHex] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      SERVER_SECRET,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

function createInitialDb(): DatabaseState {
  const now = new Date().toISOString();
  const initialAdminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const initialAdminUsername = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();

  return {
    adminAccount: {
      id: 'admin',
      username: initialAdminUsername,
      displayName: 'Administrator',
      passwordHash: hashPassword(initialAdminPassword),
      updatedAt: now,
    },
    teams: [
      {
        id: 'team-haya',
        name: 'Haya',
        loginId: 'haya',
        passwordHash: hashPassword('haya@955'),
        encryptedPassword: encryptCredential('haya@955'),
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    shops: [],
    receipts: {},
    activityLog: [],
  };
}

let stateCache: DatabaseState | null = null;

export function loadDb(): DatabaseState {
  if (stateCache) return stateCache;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {recursive: true});
  }

  if (!fs.existsSync(DB_PATH)) {
    stateCache = createInitialDb();
    saveDb(stateCache);
    return stateCache;
  }

  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DatabaseState>;
    const fallback = createInitialDb();

    const shops = Array.isArray(parsed.shops)
      ? parsed.shops.map(s => {
          const {category, legacyCategory} = normalizeCategory(s.category);
          return {
            ...s,
            category,
            ...(legacyCategory && !s.legacyCategory ? {legacyCategory} : {}),
          };
        })
      : [];

    stateCache = {
      adminAccount: parsed.adminAccount?.username ? parsed.adminAccount : fallback.adminAccount,
      teams: Array.isArray(parsed.teams) && parsed.teams.length > 0 ? parsed.teams : fallback.teams,
      shops,
      receipts: parsed.receipts && typeof parsed.receipts === 'object' ? parsed.receipts : {},
      activityLog: Array.isArray(parsed.activityLog) ? parsed.activityLog : [],
    };
    return stateCache;
  } catch (err) {
    console.error('Failed to read db.json, reinitializing:', err);
    stateCache = createInitialDb();
    saveDb(stateCache);
    return stateCache;
  }
}

export function saveDb(next: DatabaseState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {recursive: true});
  }
  stateCache = next;
  const tmpPath = `${DB_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

export function appendActivity(db: DatabaseState, user: string, action: string, detail: string): void {
  db.activityLog.unshift({
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    user,
    action,
    detail,
  });
  if (db.activityLog.length > 300) {
    db.activityLog = db.activityLog.slice(0, 300);
  }
}

export function isUsernameTaken(
  db: DatabaseState,
  candidateUsername: string,
  excludeId?: string,
): boolean {
  const norm = candidateUsername.trim().toLowerCase();
  if (!norm) return true;
  if (excludeId !== 'admin' && db.adminAccount.username.toLowerCase() === norm) {
    return true;
  }
  if (db.teams.some(t => t.id !== excludeId && t.loginId.toLowerCase() === norm)) {
    return true;
  }
  if (db.shops.some(s => s.id !== excludeId && s.username.toLowerCase() === norm)) {
    return true;
  }
  return false;
}

export function sanitizeShopForPublic(shop: ShopRecord) {
  return {
    id: shop.id,
    name: shop.name,
    category: shop.category,
    legacyCategory: shop.legacyCategory,
    status: shop.status,
    description: shop.description,
    address: shop.address,
    phone: shop.phone,
    image: shop.image,
    createdAt: shop.createdAt,
    updatedAt: shop.updatedAt,
  };
}
