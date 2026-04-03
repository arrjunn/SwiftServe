import { Router } from "express";
import net from "net";
import dns from "dns/promises";
import { authenticate } from "./auth.js";

const router = Router();

/** Check if IP is in private/local range (SSRF prevention) */
function isPrivateIP(ip) {
  if (!ip) return false;
  return /^(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2[0-9]|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|127\.\d+\.\d+\.\d+)$/.test(ip);
}

/** Resolve hostname to IP and validate it's private (prevents DNS rebinding SSRF) */
async function resolveAndValidate(host) {
  // If already an IP, validate directly
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return isPrivateIP(host) ? host : null;
  }
  // localhost special case
  if (host === "localhost") return "127.0.0.1";
  // Resolve DNS and check resolved IP
  try {
    const addresses = await dns.resolve4(host);
    const resolved = addresses[0];
    return isPrivateIP(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/printer/print
 * Proxies ESC/POS data to a network thermal printer via TCP.
 * Query: ?ip=192.168.1.100&port=9100
 * Requires authentication. Only allows private/local IPs.
 */
router.post("/print", authenticate, async (req, res) => {
  const rawIp = req.query.ip || process.env.PRINTER_IP;
  const port = parseInt(req.query.port || process.env.PRINTER_PORT || "9100", 10);

  if (!rawIp) {
    return res.status(400).json({
      error: "Printer IP not specified. Pass ?ip=192.168.1.100 or set PRINTER_IP in .env",
    });
  }

  // Resolve hostname and validate it's a private IP (prevents DNS rebinding SSRF)
  const ip = await resolveAndValidate(rawIp);
  if (!ip) {
    return res.status(400).json({ error: "Printer address must resolve to a private IP" });
  }

  // Collect raw body
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);

  if (data.length === 0) {
    return res.status(400).json({ error: "No print data received" });
  }

  try {
    await sendToPrinter(ip, port, data);
    res.json({ success: true, printer: `${ip}:${port}`, bytes: data.length });
  } catch (err) {
    console.error(`[PRINTER] Failed to print to ${ip}:${port}:`, err.message);
    res.status(502).json({ error: `Failed to connect to printer at ${ip}:${port}: ${err.message}` });
  }
});

/**
 * GET /api/printer/status
 * Check if a network printer is reachable.
 * Query: ?ip=192.168.1.100&port=9100
 */
router.get("/status", authenticate, async (req, res) => {
  const rawIp = req.query.ip || process.env.PRINTER_IP;
  const port = parseInt(req.query.port || process.env.PRINTER_PORT || "9100", 10);

  if (!rawIp) {
    return res.json({ configured: false, message: "No printer IP configured" });
  }
  const ip = await resolveAndValidate(rawIp);
  if (!ip) {
    return res.status(400).json({ error: "Printer address must resolve to a private IP" });
  }

  try {
    await checkPrinter(ip, port);
    res.json({ configured: true, reachable: true, printer: `${ip}:${port}` });
  } catch (err) {
    res.json({ configured: true, reachable: false, printer: `${ip}:${port}`, error: err.message });
  }
});

function sendToPrinter(ip, port, data, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Connection timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.connect(port, ip, () => {
      socket.write(data, () => {
        clearTimeout(timer);
        socket.end();
        resolve();
      });
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function checkPrinter(ip, port, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Connection timeout"));
    }, timeoutMs);

    socket.connect(port, ip, () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export default router;
