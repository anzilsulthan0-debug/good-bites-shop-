import crypto from 'crypto';
import dotenv from 'dotenv';
import express, {NextFunction, Request, Response} from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import {WebSocket, WebSocketServer} from 'ws';
import {
  appendActivity,
  decryptCredential,
  encryptCredential,
  getSigningKey,
  hashPassword,
  isUsernameTaken,
  loadDb,
  normalizeCategory,
  ProductCategory,
  ReceiptRecord,
  sanitizeShopForPublic,
  saveDb,
  ShopRecord,
  VALID_CATEGORIES,
  verifyPassword,
} from './server/store.js';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_COOKIE = 'gb_session';
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface SessionPayload {
  userId: string;
  username: string;
  role: 'admin' | 'team';
  displayRole: string;
  shopId: string | null;
  accountType: 'admin' | 'team' | 'shop';
  exp: number;
}

interface AuthedRequest extends Request {
  sessionUser?: SessionPayload;
}

function signSession(payload: Omit<SessionPayload, 'exp'>): string {
  const full: SessionPayload = {
    ...payload,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningKey())
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto
    .createHmac('sha256', getSigningKey())
    .update(body)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE] || null;
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const session = verifySessionToken(extractToken(req));
  if (!session) {
    res.status(401).json({ok: false, message: 'Authentication required'});
    return;
  }
  req.sessionUser = session;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.sessionUser || req.sessionUser.role !== 'admin') {
    res.status(403).json({ok: false, message: 'Administrator permission required'});
    return;
  }
  next();
}

const slugify = (text: string) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function generateShopUsername(name: string, db: ReturnType<typeof loadDb>): string {
  const base = slugify(name).slice(0, 12) || 'shop';
  let username = base;
  let counter = 1;
  while (isUsernameTaken(db, username)) {
    counter++;
    username = `${base}${counter}`;
  }
  return username;
}

function generateShopPassword(name: string): string {
  const base = slugify(name).slice(0, 6) || 'shop';
  return `${base}@${Math.floor(100 + Math.random() * 900)}`;
}

function nextReceiptNumber(shopId: string, list: ReceiptRecord[]): string {
  let next = 1;
  for (const r of list) {
    const match = String(r.receiptNumber || '').match(/-(\d+)$/);
    if (match) next = Math.max(next, Number(match[1]) + 1);
  }
  const shortShop = String(shopId).replace(/\D/g, '').slice(-2).padStart(2, '0');
  return `REC-${shortShop}-${String(next).padStart(4, '0')}`;
}

function computeCategoryCounts(shops: ShopRecord[]) {
  const counts: Record<ProductCategory, number> = {
    'Quail Egg': 0,
    'Egg Pickle': 0,
    Nuts: 0,
  };
  for (const shop of shops) {
    const {category} = normalizeCategory(shop.category);
    counts[category] = (counts[category] || 0) + 1;
  }
  return counts;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  if (IS_PROD) {
    app.set('trust proxy', 1);
  }

  app.use(express.json({limit: '10mb'}));
  app.use(express.urlencoded({extended: true, limit: '10mb'}));

  // Never cache API responses (security requirement for login/admin/business endpoints)
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // WebSocket real-time hub
  const wss = new WebSocketServer({noServer: true});
  const connectedClients = new Set<WebSocket>();

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (reqUrl.pathname !== '/ws') {
      return;
    }
    const queryToken = reqUrl.searchParams.get('token');
    const cookies = parseCookies(request.headers.cookie);
    const session = verifySessionToken(queryToken || cookies[SESSION_COOKIE]);
    if (!session) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, ws => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', ws => {
    connectedClients.add(ws);
    ws.send(JSON.stringify({type: 'connected', ts: Date.now()}));
    ws.on('close', () => connectedClients.delete(ws));
    ws.on('error', () => connectedClients.delete(ws));
  });

  function broadcastSync(scope: 'shops' | 'receipts' | 'accounts' | 'all', shopId?: string) {
    const payload = JSON.stringify({
      type: 'sync',
      scope,
      shopId: shopId || null,
      ts: Date.now(),
    });
    for (const client of connectedClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  // Health & App APK status
  app.get('/api/health', (_req, res) => {
    res.json({ok: true, message: 'Good Bites Server Connected', timestamp: new Date().toISOString()});
  });

  app.get('/api/app/status', (_req, res) => {
    const apkPath = path.resolve(process.cwd(), 'public', 'downloads', 'good-bites.apk');
    const apkAvailable = fs.existsSync(apkPath) && fs.statSync(apkPath).size > 1024;
    res.json({
      ok: true,
      appName: 'Good Bites',
      version: '2.0.0',
      apkAvailable,
      apkSizeBytes: apkAvailable ? fs.statSync(apkPath).size : null,
      apkUrl: apkAvailable ? '/downloads/good-bites.apk' : null,
      capacitorConfigured: fs.existsSync(path.resolve(process.cwd(), 'capacitor.config.ts')),
      androidProjectReady: fs.existsSync(path.resolve(process.cwd(), 'android')),
      iosProjectReady: fs.existsSync(path.resolve(process.cwd(), 'ios')),
    });
  });

  // AUTH ROUTES
  app.post('/api/auth/login', (req, res) => {
    const mode = String(req.body?.mode || 'team').toLowerCase();
    const rawUsername = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!password) {
      res.status(400).json({ok: false, message: 'Password is required'});
      return;
    }

    const db = loadDb();

    if (mode === 'admin') {
      const adminUsername = db.adminAccount.username.toLowerCase();
      if (rawUsername && rawUsername !== adminUsername) {
        res.status(401).json({ok: false, message: 'Invalid admin username or password'});
        return;
      }
      if (!verifyPassword(password, db.adminAccount.passwordHash)) {
        res.status(401).json({ok: false, message: 'Wrong admin password'});
        return;
      }

      const sessionInfo = {
        userId: 'admin',
        username: db.adminAccount.username,
        role: 'admin' as const,
        displayRole: db.adminAccount.displayName || 'Administrator',
        shopId: null,
        accountType: 'admin' as const,
      };
      const token = signSession(sessionInfo);
      setSessionCookie(res, token);
      res.json({ok: true, user: sessionInfo, token});
      return;
    }

    if (!rawUsername) {
      res.status(400).json({ok: false, message: 'Username is required'});
      return;
    }

    // 1. Check team accounts (e.g., Haya & custom team users)
    const team = db.teams.find(
      t => t.loginId.trim().toLowerCase() === rawUsername && t.active !== false,
    );
    if (team && verifyPassword(password, team.passwordHash)) {
      const sessionInfo = {
        userId: team.id,
        username: team.loginId,
        role: 'team' as const,
        displayRole: team.name,
        shopId: null,
        accountType: 'team' as const,
      };
      const token = signSession(sessionInfo);
      setSessionCookie(res, token);
      res.json({ok: true, user: sessionInfo, token});
      return;
    }

    // 2. Check shop accounts created by Admin
    const shop = db.shops.find(s => s.username.trim().toLowerCase() === rawUsername);
    if (shop && verifyPassword(password, shop.passwordHash)) {
      if (shop.status !== 'active') {
        res.status(403).json({
          ok: false,
          message: 'This shop is closed. Contact the administrator.',
        });
        return;
      }
      const sessionInfo = {
        userId: shop.id,
        username: shop.username,
        role: 'team' as const,
        displayRole: shop.name,
        shopId: shop.id,
        accountType: 'shop' as const,
      };
      const token = signSession(sessionInfo);
      setSessionCookie(res, token);
      res.json({ok: true, user: sessionInfo, token});
      return;
    }

    res.status(401).json({ok: false, message: 'Invalid username or password'});
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ok: true, user: req.sessionUser});
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, {path: '/'});
    res.json({ok: true});
  });

  // SYNC & SHOPS ROUTES
  app.get('/api/sync', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDb();
    const isAdmin = req.sessionUser?.role === 'admin';
    const shops = db.shops.map(s => {
      const publicShop = sanitizeShopForPublic(s);
      if (isAdmin) {
        return {
          ...publicShop,
          username: s.username,
          password: decryptCredential(s.encryptedPassword),
        };
      }
      return publicShop;
    });

    res.json({
      ok: true,
      categories: VALID_CATEGORIES,
      categoryCounts: computeCategoryCounts(db.shops),
      shops,
      receipts: db.receipts,
    });
  });

  app.post('/api/shops', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      res.status(400).json({ok: false, message: 'Enter a shop name.'});
      return;
    }

    const db = loadDb();
    if (db.shops.some(s => s.name.trim().toLowerCase() === name.toLowerCase())) {
      res.status(409).json({ok: false, message: 'A shop with this name already exists.'});
      return;
    }

    const {category} = normalizeCategory(req.body?.category);
    const status = req.body?.status === 'inactive' ? 'inactive' : 'active';
    const description = String(req.body?.description || '').trim().slice(0, 300);
    const address = String(req.body?.address || '').trim().slice(0, 160);
    const phone = String(req.body?.phone || '').trim().slice(0, 20);
    const image = String(req.body?.image || '');

    let customUser = slugify(String(req.body?.username || ''));
    if (customUser && isUsernameTaken(db, customUser)) {
      res.status(409).json({ok: false, message: 'That username is already taken.'});
      return;
    }
    const username = customUser || generateShopUsername(name, db);
    const rawPassword = String(req.body?.password || '').trim() || generateShopPassword(name);

    const now = new Date().toISOString();
    const newShop: ShopRecord = {
      id: `shop_${Date.now()}`,
      name,
      category,
      status,
      description,
      address,
      phone,
      image,
      username,
      passwordHash: hashPassword(rawPassword),
      encryptedPassword: encryptCredential(rawPassword),
      createdAt: now,
      updatedAt: now,
    };

    db.shops.push(newShop);
    appendActivity(db, req.sessionUser!.username, 'Shop created', `${name} (${category})`);
    saveDb(db);
    broadcastSync('shops');

    res.status(201).json({
      ok: true,
      shop: {
        ...sanitizeShopForPublic(newShop),
        username: newShop.username,
        password: rawPassword,
      },
      credentials: {
        shopName: newShop.name,
        username: newShop.username,
        password: rawPassword,
      },
    });
  });

  app.put('/api/shops/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const db = loadDb();
    const shop = db.shops.find(s => s.id === req.params.id);
    if (!shop) {
      res.status(404).json({ok: false, message: 'Shop not found.'});
      return;
    }

    const name = String(req.body?.name || '').trim();
    if (!name) {
      res.status(400).json({ok: false, message: 'Enter a shop name.'});
      return;
    }

    if (
      db.shops.some(
        s => s.id !== shop.id && s.name.trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      res.status(409).json({ok: false, message: 'A shop with this name already exists.'});
      return;
    }

    const {category} = normalizeCategory(req.body?.category);
    shop.name = name;
    shop.category = category;
    shop.status = req.body?.status === 'inactive' ? 'inactive' : 'active';
    shop.description = String(req.body?.description || '').trim().slice(0, 300);
    shop.address = String(req.body?.address || '').trim().slice(0, 160);
    shop.phone = String(req.body?.phone || '').trim().slice(0, 20);
    if (typeof req.body?.image === 'string' && req.body.image !== '') {
      shop.image = req.body.image;
    } else if (req.body?.removeImage === true) {
      shop.image = '';
    }
    shop.updatedAt = new Date().toISOString();

    // Update shopName on existing receipts to stay consistent
    const shopReceipts = db.receipts[shop.id];
    if (Array.isArray(shopReceipts)) {
      for (const r of shopReceipts) {
        r.shopName = shop.name;
      }
    }

    appendActivity(db, req.sessionUser!.username, 'Shop updated', `${name} (${category})`);
    saveDb(db);
    broadcastSync('shops');

    res.json({
      ok: true,
      shop: {
        ...sanitizeShopForPublic(shop),
        username: shop.username,
        password: decryptCredential(shop.encryptedPassword),
      },
    });
  });

  app.patch('/api/shops/:id/status', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const db = loadDb();
    const shop = db.shops.find(s => s.id === req.params.id);
    if (!shop) {
      res.status(404).json({ok: false, message: 'Shop not found.'});
      return;
    }
    shop.status = shop.status === 'active' ? 'inactive' : 'active';
    shop.updatedAt = new Date().toISOString();
    appendActivity(
      db,
      req.sessionUser!.username,
      shop.status === 'active' ? 'Shop activated' : 'Shop closed',
      shop.name,
    );
    saveDb(db);
    broadcastSync('shops');
    res.json({ok: true, status: shop.status});
  });

  app.delete('/api/shops/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const db = loadDb();
    const shop = db.shops.find(s => s.id === req.params.id);
    if (!shop) {
      res.status(404).json({ok: false, message: 'Shop not found.'});
      return;
    }
    db.shops = db.shops.filter(s => s.id !== shop.id);
    delete db.receipts[shop.id];
    appendActivity(db, req.sessionUser!.username, 'Shop deleted', shop.name);
    saveDb(db);
    broadcastSync('shops');
    res.json({ok: true});
  });

  // RECEIPT ROUTES
  app.get('/api/shops/:id/receipts', requireAuth, (req, res) => {
    const db = loadDb();
    const shop = db.shops.find(s => s.id === req.params.id);
    if (!shop) {
      res.status(404).json({ok: false, message: 'Shop not found.'});
      return;
    }
    res.json({
      ok: true,
      shop: sanitizeShopForPublic(shop),
      receipts: db.receipts[shop.id] || [],
    });
  });

  app.post('/api/shops/:id/receipts', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const db = loadDb();
    const shop = db.shops.find(s => s.id === req.params.id);
    if (!shop) {
      res.status(404).json({ok: false, message: 'Shop not found.'});
      return;
    }

    const customerName = String(req.body?.customerName || '').trim();
    const date = String(req.body?.date || '').trim();
    const quantity = Number(req.body?.quantity);
    const price = Number(req.body?.price);
    const {category: productName} = normalizeCategory(req.body?.productName);

    if (!customerName || !date || !VALID_CATEGORIES.includes(productName)) {
      res.status(400).json({ok: false, message: 'Please fill all required fields.'});
      return;
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0) {
      res.status(400).json({ok: false, message: 'Enter a valid quantity and price.'});
      return;
    }

    const total = quantity * price;
    const list = db.receipts[shop.id] || [];
    const now = new Date().toISOString();
    const receipt: ReceiptRecord = {
      id: Date.now().toString(),
      receiptNumber: nextReceiptNumber(shop.id, list),
      shopId: shop.id,
      shopName: shop.name,
      customerName,
      date,
      productName,
      quantity,
      givenQuantity: 0,
      price,
      total,
      createdBy: req.sessionUser!.username,
      createdAt: now,
      updatedAt: now,
    };

    list.push(receipt);
    db.receipts[shop.id] = list;
    appendActivity(
      db,
      req.sessionUser!.username,
      'Receipt created',
      `${receipt.receiptNumber} · ${shop.name} · ${productName}`,
    );
    saveDb(db);
    broadcastSync('receipts', shop.id);

    res.status(201).json({ok: true, receipt});
  });

  app.patch(
    '/api/shops/:id/receipts/:receiptId',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      const db = loadDb();
      const list = db.receipts[req.params.id] || [];
      const receipt = list.find(r => String(r.id) === String(req.params.receiptId));
      if (!receipt) {
        res.status(404).json({ok: false, message: 'Receipt not found.'});
        return;
      }

      const given = Number(req.body?.givenQuantity);
      if (!Number.isSafeInteger(given) || given < 0 || given > receipt.quantity) {
        res
          .status(400)
          .json({ok: false, message: `Enter a whole number from 0 to ${receipt.quantity}.`});
        return;
      }

      receipt.givenQuantity = given;
      receipt.updatedAt = new Date().toISOString();
      appendActivity(
        db,
        req.sessionUser!.username,
        'Given pieces updated',
        `${receipt.receiptNumber} (${given}/${receipt.quantity})`,
      );
      saveDb(db);
      broadcastSync('receipts', req.params.id);

      res.json({ok: true, receipt});
    },
  );

  app.delete(
    '/api/shops/:id/receipts/:receiptId',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      const db = loadDb();
      const list = db.receipts[req.params.id] || [];
      const target = list.find(r => String(r.id) === String(req.params.receiptId));
      if (!target) {
        res.status(404).json({ok: false, message: 'Receipt not found.'});
        return;
      }
      db.receipts[req.params.id] = list.filter(r => String(r.id) !== String(req.params.receiptId));
      appendActivity(db, req.sessionUser!.username, 'Receipt deleted', target.receiptNumber);
      saveDb(db);
      broadcastSync('receipts', req.params.id);
      res.json({ok: true});
    },
  );

  // ADMIN-ONLY ACCOUNTS & CREDENTIALS MANAGEMENT
  app.get('/api/admin/accounts', requireAuth, requireAdmin, (_req, res) => {
    const db = loadDb();
    res.json({
      ok: true,
      admin: {
        id: 'admin',
        username: db.adminAccount.username,
        displayName: db.adminAccount.displayName,
        updatedAt: db.adminAccount.updatedAt,
      },
      teams: db.teams.map(t => ({
        id: t.id,
        name: t.name,
        username: t.loginId,
        password: decryptCredential(t.encryptedPassword),
        active: t.active !== false,
        updatedAt: t.updatedAt,
      })),
      shops: db.shops.map(s => ({
        id: s.id,
        name: s.name,
        category: s.category,
        status: s.status,
        username: s.username,
        password: decryptCredential(s.encryptedPassword),
        updatedAt: s.updatedAt,
      })),
      activityLog: db.activityLog.slice(0, 60),
    });
  });

  app.put('/api/admin/accounts/admin', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const newUsername = String(req.body?.username || '').trim().toLowerCase();
    const newPassword = String(req.body?.password || '');
    const displayName = String(req.body?.displayName || '').trim() || 'Administrator';

    if (!newUsername || newUsername.length < 2) {
      res.status(400).json({ok: false, message: 'Username must be at least 2 characters.'});
      return;
    }

    const db = loadDb();
    if (isUsernameTaken(db, newUsername, 'admin')) {
      res.status(409).json({ok: false, message: 'Username is already used by another account.'});
      return;
    }

    db.adminAccount.username = newUsername;
    db.adminAccount.displayName = displayName;
    if (newPassword.trim() !== '') {
      if (newPassword.length < 4) {
        res.status(400).json({ok: false, message: 'Password must be at least 4 characters.'});
        return;
      }
      db.adminAccount.passwordHash = hashPassword(newPassword);
    }
    db.adminAccount.updatedAt = new Date().toISOString();

    appendActivity(db, req.sessionUser!.username, 'Admin credentials updated', newUsername);
    saveDb(db);
    broadcastSync('accounts');

    const refreshedSession = {
      userId: 'admin',
      username: db.adminAccount.username,
      role: 'admin' as const,
      displayRole: db.adminAccount.displayName,
      shopId: null,
      accountType: 'admin' as const,
    };
    const token = signSession(refreshedSession);
    setSessionCookie(res, token);

    res.json({ok: true, user: refreshedSession, token});
  });

  app.post('/api/admin/accounts/teams', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const name = String(req.body?.name || '').trim();
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!name || !username || !password) {
      res.status(400).json({ok: false, message: 'Name, username, and password are required.'});
      return;
    }
    if (password.length < 4) {
      res.status(400).json({ok: false, message: 'Password must be at least 4 characters.'});
      return;
    }

    const db = loadDb();
    if (isUsernameTaken(db, username)) {
      res.status(409).json({ok: false, message: 'Username is already taken.'});
      return;
    }

    const now = new Date().toISOString();
    const team = {
      id: `team_${Date.now()}`,
      name,
      loginId: username,
      passwordHash: hashPassword(password),
      encryptedPassword: encryptCredential(password),
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    db.teams.push(team);
    appendActivity(db, req.sessionUser!.username, 'Team account created', `${name} (${username})`);
    saveDb(db);
    broadcastSync('accounts');

    res.status(201).json({
      ok: true,
      team: {
        id: team.id,
        name: team.name,
        username: team.loginId,
        password,
        active: team.active,
        updatedAt: team.updatedAt,
      },
    });
  });

  app.put('/api/admin/accounts/teams/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const db = loadDb();
    const team = db.teams.find(t => t.id === req.params.id);
    if (!team) {
      res.status(404).json({ok: false, message: 'Team account not found.'});
      return;
    }

    const name = String(req.body?.name || '').trim();
    const username = String(req.body?.username || '').trim().toLowerCase();
    const newPassword = String(req.body?.password || '');

    if (!name || !username) {
      res.status(400).json({ok: false, message: 'Name and username are required.'});
      return;
    }

    if (isUsernameTaken(db, username, team.id)) {
      res.status(409).json({ok: false, message: 'Username is already used by another account.'});
      return;
    }

    team.name = name;
    team.loginId = username;
    if (typeof req.body?.active === 'boolean') {
      team.active = req.body.active;
    }
    if (newPassword.trim() !== '') {
      if (newPassword.length < 4) {
        res.status(400).json({ok: false, message: 'Password must be at least 4 characters.'});
        return;
      }
      team.passwordHash = hashPassword(newPassword);
      team.encryptedPassword = encryptCredential(newPassword);
    }
    team.updatedAt = new Date().toISOString();

    appendActivity(
      db,
      req.sessionUser!.username,
      'Team credentials updated',
      `${team.name} (${team.loginId})`,
    );
    saveDb(db);
    broadcastSync('accounts');

    res.json({
      ok: true,
      team: {
        id: team.id,
        name: team.name,
        username: team.loginId,
        password: decryptCredential(team.encryptedPassword),
        active: team.active,
        updatedAt: team.updatedAt,
      },
    });
  });

  app.delete('/api/admin/accounts/teams/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const db = loadDb();
    const target = db.teams.find(t => t.id === req.params.id);
    if (!target) {
      res.status(404).json({ok: false, message: 'Team account not found.'});
      return;
    }
    db.teams = db.teams.filter(t => t.id !== target.id);
    appendActivity(db, req.sessionUser!.username, 'Team account removed', target.name);
    saveDb(db);
    broadcastSync('accounts');
    res.json({ok: true});
  });

  app.put('/api/admin/accounts/shops/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const db = loadDb();
    const shop = db.shops.find(s => s.id === req.params.id);
    if (!shop) {
      res.status(404).json({ok: false, message: 'Shop not found.'});
      return;
    }

    const username = String(req.body?.username || '').trim().toLowerCase();
    const newPassword = String(req.body?.password || '');

    if (!username) {
      res.status(400).json({ok: false, message: 'Username is required.'});
      return;
    }
    if (isUsernameTaken(db, username, shop.id)) {
      res.status(409).json({ok: false, message: 'Username is already used by another account.'});
      return;
    }

    shop.username = username;
    if (newPassword.trim() !== '') {
      if (newPassword.length < 4) {
        res.status(400).json({ok: false, message: 'Password must be at least 4 characters.'});
        return;
      }
      shop.passwordHash = hashPassword(newPassword);
      shop.encryptedPassword = encryptCredential(newPassword);
    }
    shop.updatedAt = new Date().toISOString();

    appendActivity(
      db,
      req.sessionUser!.username,
      'Shop credentials updated',
      `${shop.name} (${shop.username})`,
    );
    saveDb(db);
    broadcastSync('accounts');

    res.json({
      ok: true,
      shop: {
        id: shop.id,
        name: shop.name,
        username: shop.username,
        password: decryptCredential(shop.encryptedPassword),
      },
    });
  });

  // Non-destructive legacy localStorage migration (only imports missing shops/receipts without deleting anything)
  app.post('/api/admin/migrate-local', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const legacyShops = Array.isArray(req.body?.shops) ? req.body.shops : [];
    const legacyReceipts =
      req.body?.receipts && typeof req.body.receipts === 'object' ? req.body.receipts : {};

    if (legacyShops.length === 0) {
      res.json({ok: true, importedShops: 0});
      return;
    }

    const db = loadDb();
    let importedShops = 0;

    for (const rawShop of legacyShops) {
      const id = String(rawShop?.id || rawShop?._id || `shop_${Date.now()}_${importedShops}`);
      const name = String(rawShop?.name || '').trim();
      if (!name) continue;
      if (db.shops.some(s => s.id === id || s.name.toLowerCase() === name.toLowerCase())) {
        continue;
      }

      const {category, legacyCategory} = normalizeCategory(rawShop?.category);
      const rawUser = String(rawShop?.username || '').trim().toLowerCase();
      const username =
        rawUser && !isUsernameTaken(db, rawUser) ? rawUser : generateShopUsername(name, db);
      const rawPass = String(rawShop?.password || '').trim() || generateShopPassword(name);

      db.shops.push({
        id,
        name,
        category,
        ...(legacyCategory ? {legacyCategory} : {}),
        status: rawShop?.status === 'inactive' ? 'inactive' : 'active',
        description: String(rawShop?.description || ''),
        address: String(rawShop?.address || ''),
        phone: String(rawShop?.phone || ''),
        image: String(rawShop?.image || ''),
        username,
        passwordHash: hashPassword(rawPass),
        encryptedPassword: encryptCredential(rawPass),
        createdAt: String(rawShop?.createdAt || new Date().toISOString()),
        updatedAt: new Date().toISOString(),
      });

      const shopRcpList = Array.isArray(legacyReceipts[id]) ? legacyReceipts[id] : [];
      if (shopRcpList.length > 0 && !db.receipts[id]) {
        db.receipts[id] = shopRcpList.map((r: Record<string, unknown>) => {
          const {category: prodCat} = normalizeCategory(String(r.productName || ''));
          const qty = Math.max(1, Number(r.quantity) || 1);
          const price = Math.max(0, Number(r.price) || 0);
          const given = Math.max(0, Math.min(qty, Number(r.givenQuantity) || 0));
          return {
            id: String(r.id || Date.now()),
            receiptNumber: String(r.receiptNumber || 'REC-01-0001'),
            shopId: id,
            shopName: name,
            customerName: String(r.customerName || ''),
            date: String(r.date || new Date().toISOString().slice(0, 10)),
            productName: prodCat,
            quantity: qty,
            givenQuantity: given,
            price,
            total: qty * price,
            createdBy: String(r.createdBy || req.sessionUser!.username),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        });
      }
      importedShops++;
    }

    if (importedShops > 0) {
      appendActivity(
        db,
        req.sessionUser!.username,
        'Legacy shops imported',
        `${importedShops} shop(s) preserved and mapped`,
      );
      saveDb(db);
      broadcastSync('all');
    }

    res.json({ok: true, importedShops});
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ok: false, message: 'API endpoint not found'});
  });

  if (!IS_PROD) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true, hmr: false},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Good Bites server listening on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
