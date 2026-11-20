
require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");
const rateLimit = require("express-rate-limit");

const User = require("./models/User");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const SESSION_NAME = process.env.SESSION_NAME || "goodbites.sid";

if (!process.env.MONGODB_URI || !process.env.SESSION_SECRET) {
  console.error("Missing MONGODB_URI or SESSION_SECRET in .env");
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet({
  contentSecurityPolicy: false
}));

const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : false,
  credentials: true
}));

app.use(express.json({ limit: "7mb" }));
app.use(express.urlencoded({ extended: true, limit: "7mb" }));

// SESSION
const sessionMiddleware = session({
  name: SESSION_NAME,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,

  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: "sessions",
    ttl: 14 * 24 * 60 * 60
  }),

  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 14 * 24 * 60 * 60 * 1000
  }
});

app.use(sessionMiddleware);

// SOCKET.IO
const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : false,
    credentials: true
  }
});

// Share Express session with Socket.IO
io.engine.use(sessionMiddleware);

io.use((socket, next) => {
  const user = socket.request.session?.user;

  if (!user) {
    return next(new Error("Authentication required"));
  }

  next();
});

io.on("connection", socket => {
  console.log("Good Bites device connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Device disconnected:", socket.id);
  });
});

// Make Socket.IO available to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// AUTH ROUTES
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

app.use("/api/auth", authLimiter, require("./routes/auth"));
app.use("/api/shops", require("./routes/shops"));

// HEALTH CHECK
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Good Bites Server Connected",
    database: mongoose.connection.readyState === 1
      ? "connected"
      : "disconnected"
  });
});

// FRONTEND FILES
app.use(express.static(__dirname));

// API NOT FOUND
app.use("/api", (req, res) => {
  res.status(404).json({
    ok: false,
    message: "API endpoint not found"
  });
});

// ERROR HANDLER
app.use((error, req, res, next) => {
  console.error("Server error:", error);

  if (res.headersSent) return next(error);

  res.status(error.status || 500).json({
    ok: false,
    message: "Something went wrong"
  });
});

// CREATE INITIAL ADMIN IF NOT EXISTS
async function createInitialAdmin() {
  const username = String(process.env.ADMIN_USERNAME || "")
    .trim()
    .toLowerCase();

  const password = String(process.env.ADMIN_PASSWORD || "");

  if (!username || !password) {
    console.log("Initial Admin setup skipped: check ADMIN_USERNAME and ADMIN_PASSWORD.");
    return;
  }

  const existing = await User.findOne({ username });

  if (existing) {
    console.log("Initial Admin already exists.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await User.create({
    username,
    passwordHash,
    role: "admin",
    displayName: "Administrator",
    active: true
  });

  console.log("Initial Admin account created.");
}

// START
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log("MongoDB connected successfully.");

    await createInitialAdmin();

    server.listen(PORT, () => {
      console.log(`Good Bites running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Startup error:", error.message);
    process.exit(1);
  }
}

startServer();
