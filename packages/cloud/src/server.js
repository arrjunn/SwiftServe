import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { readFileSync } from "fs";
import { pool, testConnection } from "./db/pool.js";
import authRoutes from "./routes/auth.js";
import syncRoutes from "./routes/sync.js";
import orderRoutes from "./routes/orders.js";
import aggregatorRoutes from "./routes/aggregators.js";
import whatsappRoutes from "./routes/whatsapp.js";
import paymentRoutes from "./routes/payments.js";
import printerRoutes from "./routes/printer.js";

// ---------- Structured logger ----------
function log(level, msg, meta = {}) {
  const entry = { ts: new Date().toISOString(), level, msg, ...meta };
  if (level === "error") console.error(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

// Read version from package.json once at startup
let APP_VERSION = "unknown";
try {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
  APP_VERSION = pkg.version;
} catch { /* ignore */ }

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json({ limit: "100kb" })); // default limit; sync uses its own

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    log("info", "request", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - start,
    });
  });
  next();
});

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { error: "Too many login attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute
  message: { error: "Rate limit exceeded" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/auth/login", loginLimiter);
app.use("/api/", apiLimiter);

// Health check
app.get("/api/health", async (req, res) => {
  const mem = process.memoryUsage();
  let dbStatus = "disconnected";
  let dbTime = null;

  try {
    const dbResult = await pool.query("SELECT NOW() as time");
    dbStatus = "connected";
    dbTime = dbResult.rows[0].time;
  } catch { /* db unavailable */ }

  const healthy = dbStatus === "connected";
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    version: APP_VERSION,
    uptime_s: Math.floor(process.uptime()),
    db: { status: dbStatus, time: dbTime },
    memory: {
      rss_mb: Math.round(mem.rss / 1048576),
      heap_used_mb: Math.round(mem.heapUsed / 1048576),
      heap_total_mb: Math.round(mem.heapTotal / 1048576),
    },
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/aggregators", aggregatorRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/printer", printerRoutes);

// Error handler
app.use((err, req, res, next) => {
  log("error", "unhandled error", {
    method: req.method,
    path: req.path,
    error: err.message,
  });
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "development"
      ? err.message
      : "Internal server error",
  });
});

// Start
async function start() {
  const dbOk = await testConnection();
  if (!dbOk) {
    log("warn", "PostgreSQL not available — starting without database");
    log("warn", "Set DATABASE_URL in .env to connect");
  }
  app.listen(PORT, () => {
    log("info", "server started", { port: PORT, version: APP_VERSION });
    log("info", "health endpoint", { url: `http://localhost:${PORT}/api/health` });
  });
}

start();
