const path = require("path");
const fs = require("fs");
const envPath = path.join(__dirname, "..", ".env");
require("dotenv").config({ path: envPath, override: true });
if (!fs.existsSync(envPath)) {
  console.warn(`[env] Missing ${envPath} — copy .env.example to .env and fill in real values.`);
}

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const multer = require("multer");
const nodemailer = require("nodemailer");
const { MongoClient } = require("mongodb");

const app = express();
const corsOrigins = String(process.env.CORS_ORIGIN || process.env.FRONTEND_URL || "*")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: corsOrigins.includes("*") ? "*" : corsOrigins,
    allowedHeaders: ["Content-Type", "Authorization", "X-Company-Id"],
  })
);
app.use(express.json());

const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOADS_DIR));

const PORT = process.env.PORT || 3001;

const USERS = [
  { username: "admin@company.com", password: "admin123", role: "admin", displayName: "Admin" },
  { username: "manager@gtc.com", password: "manager123", role: "manager", displayName: "Manager" },
  { username: "technician@company.com", password: "technician123", role: "technician", displayName: "Technician" },
  { username: "account@company.com", password: "account123", role: "account", displayName: "Account" },
];

const EQUIPMENT_TYPES = [
  "crane",
  "generator",
  "compressor",
  "forklift",
  "machinery_industrial_equipment",
  "welding_machine",
  "pump",
  "hoist",
  "hvac",
  "other",
];

const BUSINESS_DEPARTMENTS = ["trading", "freelancer", "factory"];

/** Maps stored codes and display labels (en/ar) to a department code — keeps dashboard counts & ?department= filters aligned. */
function normalizeBusinessDepartment(v) {
  const raw = String(v || "").trim();
  if (!raw) return "trading";
  const s = raw.toLowerCase();
  if (BUSINESS_DEPARTMENTS.includes(s)) return s;
  const labelMap = {
    trading: ["trading", "التجارة"],
    freelancer: ["freelancer", "العمل الحر"],
    factory: ["factory", "المصنع"],
  };
  for (const d of BUSINESS_DEPARTMENTS) {
    for (const lab of labelMap[d]) {
      if (lab.toLowerCase() === s) return d;
    }
  }
  return "trading";
}

function withStockDepartment(item) {
  return { ...item, department: normalizeBusinessDepartment(item && item.department) };
}

function withSoldDepartment(item) {
  return { ...item, department: normalizeBusinessDepartment(item && item.department) };
}

let stockAvailability = [];
let soldStock = [];
let equipment = [];
let clients = [];
let projects = [];
let serviceHistory = [];
let activityLog = [];
let recordFiles = [];

// In-memory stock alert email cooldown tracker: key -> last sent timestamp.
const stockAlertEmailLastSentAt = new Map();
let stockAlertEmailLastDailyDate = "";

const DATA_FILE = path.join(__dirname, "data.json");
const MONGODB_URI = String(process.env.MONGODB_URI || "").trim();
const MONGODB_DB = String(process.env.MONGODB_DB || "inventory_system").trim();
const MONGODB_COLLECTION = String(process.env.MONGODB_COLLECTION || "app_state").trim();
const MONGODB_DOC_ID = "singleton";
const USE_LOCAL_DATA_FILE = String(process.env.USE_LOCAL_DATA_FILE || (MONGODB_URI ? "false" : "true"))
  .trim()
  .toLowerCase() === "true";
let mongoClient = null;
let mongoCollection = null;
let mongoPersistTimer = null;
const COMPANY_IDS = ["trust_general", "trust_factory"];
const DEFAULT_COMPANY_ID = "trust_general";
let activeCompanyId = DEFAULT_COMPANY_ID;
let companyStore = Object.create(null);

function defaultRoleEditAccess() {
  return {
    technician: false,
    account: false,
  };
}

function createEmptyCompanyState() {
  return {
    stockAvailability: [],
    soldStock: [],
    equipment: [],
    clients: [],
    projects: [],
    serviceHistory: [],
    activityLog: [],
    recordFiles: [],
    roleEditAccess: defaultRoleEditAccess(),
    stockAlertEmailLastDailyDate: "",
    stockAlertEmailLastSentAt: {},
  };
}

function normalizeCompanyId(raw) {
  const next = String(raw || "").trim().toLowerCase();
  if (next === "trust_factory" || next === "trust_factory_for_fabrication" || next === "factory") return "trust_factory";
  return "trust_general";
}

function ensureCompanyState(companyId) {
  const key = normalizeCompanyId(companyId);
  if (!companyStore[key] || typeof companyStore[key] !== "object") {
    companyStore[key] = createEmptyCompanyState();
  }
  const state = companyStore[key];
  if (!Array.isArray(state.stockAvailability)) state.stockAvailability = [];
  if (!Array.isArray(state.soldStock)) state.soldStock = [];
  if (!Array.isArray(state.equipment)) state.equipment = [];
  if (!Array.isArray(state.clients)) state.clients = [];
  if (!Array.isArray(state.projects)) state.projects = [];
  if (!Array.isArray(state.serviceHistory)) state.serviceHistory = [];
  if (!Array.isArray(state.activityLog)) state.activityLog = [];
  if (!Array.isArray(state.recordFiles)) state.recordFiles = [];
  if (!state.roleEditAccess || typeof state.roleEditAccess !== "object") state.roleEditAccess = defaultRoleEditAccess();
  if (typeof state.stockAlertEmailLastDailyDate !== "string") state.stockAlertEmailLastDailyDate = "";
  if (!state.stockAlertEmailLastSentAt || typeof state.stockAlertEmailLastSentAt !== "object") state.stockAlertEmailLastSentAt = {};
  return state;
}

function flushBoundStateToStore() {
  const state = ensureCompanyState(activeCompanyId);
  state.stockAvailability = stockAvailability;
  state.soldStock = soldStock;
  state.equipment = equipment;
  state.clients = clients;
  state.projects = projects;
  state.serviceHistory = serviceHistory;
  state.activityLog = activityLog;
  state.recordFiles = recordFiles;
  state.roleEditAccess = roleEditAccess;
  state.stockAlertEmailLastDailyDate = stockAlertEmailLastDailyDate;
  state.stockAlertEmailLastSentAt = Object.fromEntries(stockAlertEmailLastSentAt.entries());
}

function bindCompanyData(companyId) {
  const key = normalizeCompanyId(companyId);
  if (activeCompanyId !== key) {
    flushBoundStateToStore();
  }
  const state = ensureCompanyState(key);
  activeCompanyId = key;
  stockAvailability = state.stockAvailability;
  soldStock = state.soldStock;
  equipment = state.equipment;
  clients = state.clients;
  projects = state.projects;
  serviceHistory = state.serviceHistory;
  activityLog = state.activityLog;
  recordFiles = state.recordFiles;
  roleEditAccess = state.roleEditAccess;
  stockAlertEmailLastDailyDate = state.stockAlertEmailLastDailyDate;
  stockAlertEmailLastSentAt.clear();
  Object.entries(state.stockAlertEmailLastSentAt).forEach(([k, v]) => {
    const n = Number(v || 0);
    if (Number.isFinite(n) && n > 0) stockAlertEmailLastSentAt.set(k, n);
  });
}

function hydrateStoreFromData(data) {
  if (data && data.companies && typeof data.companies === "object") {
    companyStore = Object.create(null);
    COMPANY_IDS.forEach((companyId) => {
      const src = data.companies[companyId];
      if (src && typeof src === "object") {
        const merged = createEmptyCompanyState();
        merged.stockAvailability = Array.isArray(src.stockAvailability) ? src.stockAvailability : [];
        merged.soldStock = Array.isArray(src.soldStock) ? src.soldStock : [];
        merged.equipment = Array.isArray(src.equipment) ? src.equipment : [];
        merged.clients = Array.isArray(src.clients) ? src.clients : [];
        merged.projects = Array.isArray(src.projects) ? src.projects : [];
        merged.serviceHistory = Array.isArray(src.serviceHistory) ? src.serviceHistory : [];
        merged.activityLog = Array.isArray(src.activityLog) ? src.activityLog : [];
        merged.recordFiles = Array.isArray(src.recordFiles) ? src.recordFiles : [];
        merged.roleEditAccess =
          src.roleEditAccess && typeof src.roleEditAccess === "object" ? src.roleEditAccess : defaultRoleEditAccess();
        merged.stockAlertEmailLastDailyDate =
          typeof src.stockAlertEmailLastDailyDate === "string" ? src.stockAlertEmailLastDailyDate : "";
        merged.stockAlertEmailLastSentAt =
          src.stockAlertEmailLastSentAt && typeof src.stockAlertEmailLastSentAt === "object" ? src.stockAlertEmailLastSentAt : {};
        companyStore[companyId] = merged;
      } else {
        companyStore[companyId] = createEmptyCompanyState();
      }
    });
  } else {
    // Backward-compatible migration: existing single-company data becomes Trust General.
    companyStore = Object.create(null);
    companyStore.trust_general = createEmptyCompanyState();
    companyStore.trust_factory = createEmptyCompanyState();
    companyStore.trust_general.stockAvailability = Array.isArray(data.stockAvailability) ? data.stockAvailability : [];
    companyStore.trust_general.soldStock = Array.isArray(data.soldStock) ? data.soldStock : [];
    companyStore.trust_general.equipment = Array.isArray(data.equipment) ? data.equipment : [];
    companyStore.trust_general.clients = Array.isArray(data.clients) ? data.clients : [];
    companyStore.trust_general.projects = Array.isArray(data.projects) ? data.projects : [];
    companyStore.trust_general.serviceHistory = Array.isArray(data.serviceHistory) ? data.serviceHistory : [];
    companyStore.trust_general.activityLog = Array.isArray(data.activityLog) ? data.activityLog : [];
    companyStore.trust_general.recordFiles = Array.isArray(data.recordFiles) ? data.recordFiles : [];
    companyStore.trust_general.stockAlertEmailLastDailyDate =
      typeof data.stockAlertEmailLastDailyDate === "string" ? data.stockAlertEmailLastDailyDate : "";
    companyStore.trust_general.roleEditAccess =
      data.roleEditAccess && typeof data.roleEditAccess === "object" ? data.roleEditAccess : defaultRoleEditAccess();
  }
  bindCompanyData(DEFAULT_COMPANY_ID);
}

function loadPersistedDataFromFile() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const data = JSON.parse(raw);
    hydrateStoreFromData(data);
  } catch {
    // If file is corrupted, ignore and continue with empty in-memory arrays.
    companyStore = Object.create(null);
    COMPANY_IDS.forEach((id) => {
      companyStore[id] = createEmptyCompanyState();
    });
    bindCompanyData(DEFAULT_COMPANY_ID);
  }
}

async function initMongoPersistence() {
  if (!MONGODB_URI) return false;
  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  mongoCollection = mongoClient.db(MONGODB_DB).collection(MONGODB_COLLECTION);
  const doc = await mongoCollection.findOne({ _id: MONGODB_DOC_ID });
  if (doc && doc.data && typeof doc.data === "object") {
    hydrateStoreFromData(doc.data);
  }
  return true;
}

function extractPersistableState() {
  flushBoundStateToStore();
  return {
    version: 2,
    companies: companyStore,
  };
}

async function persistDataToMongoNow() {
  if (!mongoCollection) return;
  const data = extractPersistableState();
  await mongoCollection.updateOne(
    { _id: MONGODB_DOC_ID },
    { $set: { data, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
}

function persistData() {
  try {
    if (mongoCollection) {
      if (mongoPersistTimer) clearTimeout(mongoPersistTimer);
      mongoPersistTimer = setTimeout(() => {
        persistDataToMongoNow().catch((err) => {
          console.error("[mongo] Failed to persist data:", err.message || err);
        });
      }, 120);
      return;
    }
    if (!USE_LOCAL_DATA_FILE) return;
    const data = extractPersistableState();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch {
    // Persistence failures should not block the app.
  }
}

// Permission state (persisted to data.json). Manager updates these values;
// when other users login, backend calculates their `canEdit` based on them.
let roleEditAccess = {
  technician: false,
  account: false,
};

if (USE_LOCAL_DATA_FILE) {
  loadPersistedDataFromFile();
}

app.use((req, res, next) => {
  const headerCompany = req.headers["x-company-id"];
  const queryCompany = req.query && typeof req.query.company === "string" ? req.query.company : "";
  const companyId = normalizeCompanyId(headerCompany || queryCompany || DEFAULT_COMPANY_ID);
  bindCompanyData(companyId);
  req.companyId = companyId;
  res.setHeader("X-Company-Id", companyId);
  next();
});

const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number.parseInt(String(process.env.SMTP_PORT || "587"), 10);
const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || "").trim();
const SMTP_FROM = String(process.env.SMTP_FROM || SMTP_USER || "").trim();
const STOCK_ALERT_MAIL_COOLDOWN_MIN = Math.max(5, Number.parseInt(String(process.env.STOCK_ALERT_MAIL_COOLDOWN_MIN || "180"), 10) || 180);
const STOCK_ALERT_MAIL_ENABLED = String(process.env.STOCK_ALERT_MAIL_ENABLED || "true").trim().toLowerCase() !== "false";

function formatLocalYYYYMMDD(d = new Date()) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function parseStockAlertDailyAt(raw) {
  const m = String(raw || "08:00").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { hour: 8, minute: 0 };
  const hour = Math.min(23, Math.max(0, Number.parseInt(m[1], 10)));
  const minute = Math.min(59, Math.max(0, Number.parseInt(m[2], 10)));
  return { hour, minute };
}

function msUntilNextStockAlertDailyRun(hour, minute) {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMilliseconds(0);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

if (!SMTP_HOST) {
  console.log("[env] SMTP_HOST not set — stock alert email is disabled until .env is configured.");
} else if (/example\.com|example\.org/i.test(SMTP_HOST) || /your-mailbox/i.test(SMTP_USER)) {
  console.warn(
    "[env] SMTP values look like .env.example placeholders. Edit the project .env (real host/user) and restart the API."
  );
} else {
  console.log(`[env] SMTP_HOST=${SMTP_HOST}`);
}

function csvEmails(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function getStockAlertRecipients() {
  const managerDefault = USERS.find((u) => String(u.role || "").toLowerCase() === "manager")?.username || "";
  const procurementDefault =
    String(process.env.PROCUREMENT_EMAIL || "").trim().toLowerCase() ||
    USERS.find((u) => String(u.role || "").toLowerCase() === "account")?.username ||
    "";
  const managerEmails = csvEmails(process.env.ALERT_MAIL_TO_MANAGER || managerDefault);
  const procurementEmails = csvEmails(process.env.ALERT_MAIL_TO_PROCUREMENT || procurementDefault);
  return [...new Set([...managerEmails, ...procurementEmails])];
}

let smtpTransporter = null;
function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) return null;
  smtpTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    ...(SMTP_PORT === 587 ? { requireTLS: true } : {}),
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return smtpTransporter;
}

function buildStockLevelAlerts(today) {
  const alerts = [];
  if (stockAvailability.length === 0) {
    alerts.push({
      type: "stock_level_critical",
      severity: "high",
      entityType: "stock",
      entityId: "inventory",
      entityName: "Inventory",
      dueDate: today,
      message: "Stock level is critical: no items currently in stock.",
    });
    return alerts;
  }

  const byPart = new Map();
  stockAvailability.forEach((item) => {
    const partKey = String(item.partNumber || item.partDescription || "").trim().toLowerCase();
    if (!partKey) return;
    const bucket = byPart.get(partKey) || {
      partNumber: String(item.partNumber || "").trim(),
      partDescription: String(item.partDescription || "").trim(),
      count: 0,
    };
    bucket.count += 1;
    byPart.set(partKey, bucket);
  });

  byPart.forEach((bucket, key) => {
    if (bucket.count > 2) return;
    const label = bucket.partNumber || bucket.partDescription || key;
    alerts.push({
      type: bucket.count === 1 ? "stock_level_critical" : "stock_level_low",
      severity: bucket.count === 1 ? "high" : "medium",
      entityType: "stock",
      entityId: key,
      entityName: label,
      dueDate: today,
      message:
        bucket.count === 1
          ? `Stock level is critical for ${label} (1 item remaining).`
          : `Stock level is low for ${label} (${bucket.count} items remaining).`,
      count: bucket.count,
    });
  });

  return alerts;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stockAlertEmailShell({ title, accent, subtitleHtml, bodyHtml, footerLines }) {
  const foot = (footerLines || [])
    .map((line) => `<p style="margin:6px 0 0;font-size:12px;color:#64748b;">${escapeHtml(line)}</p>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#e8eef5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8eef5;padding:28px 14px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #cbd5e1;box-shadow:0 8px 30px rgba(15,23,42,0.12);">
<tr><td style="background:${accent};padding:22px 26px;border-bottom:3px solid rgba(255,255,255,0.25);">
<h1 style="margin:0;font-family:Segoe UI,Roboto,Arial,sans-serif;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">${escapeHtml(title)}</h1>
${subtitleHtml || ""}
</td></tr>
<tr><td style="padding:26px 26px 22px;font-family:Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1e293b;">
${bodyHtml}
</td></tr>
<tr><td style="padding:0 26px 26px;font-family:Segoe UI,Roboto,Arial,sans-serif;">
${foot}
</td></tr>
</table>
<p style="margin:16px 0 0;font-family:Segoe UI,Roboto,Arial,sans-serif;font-size:11px;color:#94a3b8;text-align:center;">Trust General Trading &amp; Contracting — Inventory Control System</p>
</td></tr>
</table>
</body>
</html>`;
}

function buildStockAlertTestEmail() {
  const when = new Date().toISOString();
  const subtitle = `<p style="margin:10px 0 0;font-size:14px;color:rgba(255,255,255,0.92);font-weight:500;">SMTP test</p>`;
  const body = `
<p style="margin:0 0 18px;font-size:16px;color:#0f172a;"><strong style="color:#059669;">Success</strong> — mail server settings are working.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;border-radius:10px;border-left:5px solid #10b981;">
<tr><td style="padding:16px 18px;">
<p style="margin:0;font-size:14px;color:#065f46;line-height:1.5;">Stock alert delivery is active. Re-run this test from the Alerts page whenever you need.</p>
</td></tr>
</table>
<p style="margin:20px 0 0;font-size:13px;color:#475569;"><strong>Sent at:</strong> ${escapeHtml(when)}</p>`;
  const text = [
    "Inventory Control System — SMTP / stock alert test",
    "",
    "Success: mail server settings are working.",
    "",
    `Sent at: ${when}`,
  ].join("\n");
  const html = stockAlertEmailShell({
    title: "Email test",
    accent: "#0f766e",
    subtitleHtml: subtitle,
    bodyHtml: body,
    footerLines: [],
  });
  return { text, html };
}

function buildStockLevelAlertEmail(toSend, dashboardUrl) {
  const when = new Date().toISOString();
  const urgent = toSend.some((a) => a.severity === "high");
  const accent = urgent ? "#b91c1c" : "#1d4ed8";
  const badge = urgent ? "URGENT" : "UPDATE";
  const subtitle = `<p style="margin:10px 0 0;font-size:13px;color:rgba(255,255,255,0.95);"><span style="display:inline-block;background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:999px;font-weight:700;letter-spacing:0.04em;">${badge}</span> <span style="margin-left:8px;">${toSend.length} stock alert${toSend.length === 1 ? "" : "s"}</span></p>`;

  const alertBlocks = toSend
    .map((a, i) => {
      const sev = String(a.severity || "").toLowerCase();
      const isHigh = sev === "high";
      const border = isHigh ? "#dc2626" : "#d97706";
      const bg = isHigh ? "#fef2f2" : "#fffbeb";
      const labelBg = isHigh ? "#dc2626" : "#d97706";
      const labelText = isHigh ? "HIGH — Urgent" : "MEDIUM — Plan soon";
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;background:${bg};border-radius:10px;border:1px solid ${border};border-left-width:5px;border-left-color:${border};">
<tr><td style="padding:14px 16px;">
<span style="display:inline-block;background:${labelBg};color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;letter-spacing:0.03em;">${escapeHtml(labelText)}</span>
<p style="margin:10px 0 4px;font-size:17px;font-weight:700;color:#0f172a;">${escapeHtml(String(a.entityName || "Item"))}</p>
<p style="margin:0 0 8px;font-size:14px;color:#334155;">${escapeHtml(String(a.message || ""))}</p>
<p style="margin:0;font-size:12px;color:#64748b;"><strong style="color:#475569;">Due date:</strong> ${escapeHtml(String(a.dueDate || ""))} &nbsp;·&nbsp; <strong style="color:#475569;">#${i + 1}</strong></p>
</td></tr>
</table>`;
    })
    .join("");

  const body = `
<h2 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:10px;">Stock level summary</h2>
${alertBlocks}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;background:#f1f5f9;border-radius:8px;">
<tr><td style="padding:14px 16px;">
<p style="margin:0;font-size:13px;color:#475569;">Review inventory in the dashboard and replenish or adjust stock as needed.</p>
</td></tr>
</table>`;

  const lines = toSend.map(
    (a, i) => `${i + 1}. [${String(a.severity || "").toUpperCase()}] ${a.entityName} — ${a.message} (due ${a.dueDate})`
  );
  const text = [
    urgent ? "URGENT Stock level alert" : "Stock level alert update",
    "",
    ...lines,
    "",
    `Open alerts: ${dashboardUrl}`,
    `Generated at: ${when}`,
  ].join("\n");

  const html = stockAlertEmailShell({
    title: "Stock level alert",
    accent,
    subtitleHtml: subtitle,
    bodyHtml: body,
    footerLines: [`Dashboard: ${dashboardUrl}`, `Generated at: ${when}`],
  });
  return { text, html };
}

function stockMailSkipReasonMessage(reason) {
  const map = {
    mail_disabled: "Stock alert emails are disabled (STOCK_ALERT_MAIL_ENABLED=false).",
    smtp_not_configured: "SMTP is not fully configured in .env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).",
    no_recipients: "No alert recipients: set ALERT_MAIL_TO_MANAGER and/or ALERT_MAIL_TO_PROCUREMENT (or account user email).",
    no_alerts: "No stock-level alerts to email right now.",
    daily_limit: "Daily stock alert email already sent today.",
    cooldown: "Alerts are in cooldown; no email sent this run.",
  };
  return map[reason] || reason;
}

async function sendStockLevelEmailAlerts(opts = {}) {
  const forTest = Boolean(opts.forTest);
  const bypassCooldown = Boolean(opts.bypassCooldown);

  if (forTest) {
    const transporter = getSmtpTransporter();
    const recipients = getStockAlertRecipients();
    if (!transporter) return { skipped: true, reason: "smtp_not_configured" };
    if (recipients.length === 0) return { skipped: true, reason: "no_recipients" };
    const { text, html } = buildStockAlertTestEmail();
    await transporter.sendMail({
      from: SMTP_FROM,
      to: recipients.join(","),
      subject: "Inventory system — SMTP / stock alert test",
      text,
      html,
    });
    return { sent: 1, test: true };
  }

  if (!STOCK_ALERT_MAIL_ENABLED) return { skipped: true, reason: "mail_disabled" };
  const transporter = getSmtpTransporter();
  const recipients = getStockAlertRecipients();
  if (!transporter) return { skipped: true, reason: "smtp_not_configured" };
  if (recipients.length === 0) return { skipped: true, reason: "no_recipients" };

  const today = formatLocalYYYYMMDD();
  if (!bypassCooldown && stockAlertEmailLastDailyDate === today) {
    return { skipped: true, reason: "daily_limit" };
  }
  const stockAlerts = buildStockLevelAlerts(today);
  if (stockAlerts.length === 0) return { skipped: true, reason: "no_alerts" };

  const now = Date.now();
  const cooldownMs = STOCK_ALERT_MAIL_COOLDOWN_MIN * 60 * 1000;
  const toSend = stockAlerts.filter((a) => {
    if (bypassCooldown) return true;
    const key = `${a.type}:${a.entityId}:${a.message}`;
    const last = Number(stockAlertEmailLastSentAt.get(key) || 0);
    return !last || now - last >= cooldownMs;
  });
  if (toSend.length === 0) return { skipped: true, reason: "cooldown" };

  const subject =
    toSend.some((a) => a.severity === "high")
      ? `URGENT Stock Alert (${toSend.length})`
      : `Stock Alert Update (${toSend.length})`;
  const dashboardUrl = `http://localhost:${PORT}/alerts`;
  const { text, html } = buildStockLevelAlertEmail(toSend, dashboardUrl);

  await transporter.sendMail({
    from: SMTP_FROM,
    to: recipients.join(","),
    subject,
    text,
    html,
  });

  toSend.forEach((a) => {
    const key = `${a.type}:${a.entityId}:${a.message}`;
    stockAlertEmailLastSentAt.set(key, now);
  });
  stockAlertEmailLastDailyDate = today;
  persistData();
  return { sent: toSend.length };
}

const ALLOWED_ENTITY_TYPES = new Set(["stock", "sold", "equipment", "client", "project"]);

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(String(file.originalname || "")).slice(0, 12);
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});
const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

function normalizeEntityType(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "clients") return "client";
  if (s === "projects") return "project";
  return s;
}

function getRecordFiles(entityType, entityId) {
  const et = normalizeEntityType(entityType);
  const rid = String(entityId || "").trim();
  return recordFiles.filter((f) => normalizeEntityType(f.entityType) === et && String(f.entityId || "").trim() === rid);
}

function buildFilesFolder(entityType, entityId) {
  const files = getRecordFiles(entityType, entityId);
  if (!files.length) return null;
  return {
    key: "files",
    items: files.slice(0, 50).map((f) => ({
      path: `/uploads/${f.storedName}`,
      title: f.originalName,
      subtitle: f.uploadedAt ? String(f.uploadedAt).slice(0, 10) : "",
    })),
  };
}

function getCanEditForRole(role) {
  if (role === "manager") return true;
  if (role === "admin") return false;
  if (role === "account") return true; // accounts have full access
  return Boolean(roleEditAccess[String(role || "").trim().toLowerCase()]);
}

function normalizeDepartmentKey(key) {
  // allow simple role/department keys like "store", "sales_team", "hr"
  const s = String(key || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  return s;
}

const AUTH_SECRET = process.env.JWT_SECRET || process.env.AUTH_SECRET || "dev-secret-change-me";

function base64urlEncode(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecode(str) {
  let s = String(str || "");
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64").toString("utf8");
}

function base64urlBuffer(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signAuthToken(payload) {
  const header = { alg: "HS256", typ: "AUTH" };
  const body = { ...payload, iat: Date.now(), exp: Date.now() + 60 * 60 * 1000 };
  const b64Header = base64urlEncode(JSON.stringify(header));
  const b64Body = base64urlEncode(JSON.stringify(body));
  const data = `${b64Header}.${b64Body}`;
  const signature = base64urlBuffer(crypto.createHmac("sha256", AUTH_SECRET).update(data).digest());

  // Note: signature encoding is done without external JWT libs (demo purpose).
  return `${data}.${signature}`;
}

function verifyAuthToken(token) {
  try {
    if (!token) return null;
    const parts = String(token).split(".");
    if (parts.length !== 3) return null;
    const [b64Header, b64Body, signature] = parts;
    const data = `${b64Header}.${b64Body}`;
    const expectedSig = base64urlBuffer(crypto.createHmac("sha256", AUTH_SECRET).update(data).digest());

    if (expectedSig !== signature) return null;
    const body = JSON.parse(base64urlDecode(b64Body));
    if (!body.exp || Date.now() > body.exp) return null;
    return body;
  } catch {
    return null;
  }
}

function requireManager(req, res, next) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  const decoded = verifyAuthToken(token);
  if (!decoded || decoded.role !== "manager") {
    return res.status(403).json({ success: false, message: "Forbidden." });
  }
  req.user = decoded;
  next();
}

function requireCanEdit(req, res, next) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  const decoded = verifyAuthToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, message: "Unauthorized." });
  }
  if (!getCanEditForRole(decoded.role)) {
    return res.status(403).json({ success: false, message: "Edit permission required." });
  }
  req.user = decoded;
  next();
}

function requireAuth(req, res, next) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  const decoded = verifyAuthToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, message: "Unauthorized." });
  }
  req.user = decoded;
  next();
}

function id() {
  return crypto.randomUUID();
}

const MAX_ACTIVITY_LOG = 500;
function logActivity(actor, { section, action, details }) {
  if (!actor) return;
  const entry = {
    id: id(),
    timestamp: new Date().toISOString(),
    actorName: actor.displayName || actor.username || actor.role || "User",
    actorRole: actor.role || "user",
    section: String(section || "").trim() || "General",
    action: String(action || "").trim() || "Updated",
    details: String(details || "").trim(),
  };
  activityLog.unshift(entry); // newest first
  if (activityLog.length > MAX_ACTIVITY_LOG) activityLog.pop();

  // Persist all demo data so records survive server restarts.
  persistData();
}

const EQUIPMENT_STATUSES = ["active", "under_maintenance", "decommissioned", "replacement"];

function equipmentFields(body, existing = {}) {
  const fromBody = body.status != null ? String(body.status).trim().toLowerCase() : null;
  const fromExisting = String(existing.status || "").trim().toLowerCase();
  const validStatus =
    fromBody && EQUIPMENT_STATUSES.includes(fromBody)
      ? fromBody
      : EQUIPMENT_STATUSES.includes(fromExisting)
        ? fromExisting
        : "active";
  const rawType = String((body.type != null ? body.type : existing.type) || "other").toLowerCase().replace(/\s+/g, "_");
  const validType = EQUIPMENT_TYPES.includes(rawType) ? rawType : (existing.type || "other");
  return {
    type: validType,
    name: String((body.name != null ? body.name : existing.name) || "").trim(),
    model: String((body.model != null ? body.model : existing.model) || "").trim(),
    location: String((body.location != null ? body.location : existing.location) || "").trim(),
    status: validStatus,
    capacity: String((body.capacity != null ? body.capacity : existing.capacity) || "").trim(),
    lastServiceDate: String((body.lastServiceDate != null ? body.lastServiceDate : existing.lastServiceDate) || "").trim(),
    notes: String((body.notes != null ? body.notes : existing.notes) || "").trim(),
    serialNumber: String((body.serialNumber != null ? body.serialNumber : existing.serialNumber) || "").trim(),
    manufacturer: String((body.manufacturer != null ? body.manufacturer : existing.manufacturer) || "").trim(),
    commissionDate: String((body.commissionDate != null ? body.commissionDate : existing.commissionDate) || "").trim(),
    warrantyExpiry: String((body.warrantyExpiry != null ? body.warrantyExpiry : existing.warrantyExpiry) || "").trim(),
    nextInspectionDate: String((body.nextInspectionDate != null ? body.nextInspectionDate : existing.nextInspectionDate) || "").trim(),
    lastInspectionDate: String((body.lastInspectionDate != null ? body.lastInspectionDate : existing.lastInspectionDate) || "").trim(),
    complianceNotes: String((body.complianceNotes != null ? body.complianceNotes : existing.complianceNotes) || "").trim(),
    clientId: body.clientId != null ? (body.clientId || null) : (existing.clientId || null),
    projectId: body.projectId != null ? (body.projectId || null) : (existing.projectId || null),
  };
}

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const emailTrim = String(email || "").trim().toLowerCase();
  const passwordVal = String(password || "");

  if (!emailTrim || !passwordVal) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required.",
    });
  }

  const user = USERS.find(
    (u) =>
      String(u.username || "").trim().toLowerCase() === emailTrim &&
      String(u.password || "") === passwordVal
  );

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Invalid email, password, or role.",
    });
  }

  const role = String(user.role || "").toLowerCase();
  const canEdit = getCanEditForRole(role);
  const token = signAuthToken({
    username: user.username,
    role,
    displayName: user.displayName || role,
  });

  logActivity(
    { username: user.username, role, displayName: user.displayName || role },
    { section: "Auth", action: "Login", details: "User logged in." }
  );

  res.json({
    success: true,
    role,
    displayName: user.displayName || role,
    canEdit,
    token,
  });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const username = String(req.user?.username || "").trim().toLowerCase();
  const user = USERS.find((u) => String(u.username || "").trim().toLowerCase() === username);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found." });
  }
  const role = String(user.role || "").toLowerCase();
  res.json({
    success: true,
    username: user.username,
    role,
    displayName: user.displayName || role,
    canEdit: getCanEditForRole(role),
  });
});

app.post("/api/auth/change-password", requireAuth, (req, res) => {
  const { newPassword } = req.body || {};
  const nextPassword = String(newPassword || "");
  if (!nextPassword || nextPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: "New password must be at least 6 characters.",
    });
  }

  const username = String(req.user?.username || "").trim().toLowerCase();
  const user = USERS.find((u) => String(u.username || "").trim().toLowerCase() === username);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found." });
  }

  user.password = nextPassword;
  logActivity(req.user, {
    section: "Auth",
    action: "Changed password",
    details: "User updated account password.",
  });
  res.json({ success: true, message: "Password updated successfully." });
});

app.get("/api/permissions", requireManager, (req, res) => {
  res.json({
    success: true,
    permissions: { ...roleEditAccess },
  });
});

app.post("/api/permissions/grant", requireManager, (req, res) => {
  const body = req.body || {};

  // New shape: { permissions: { [departmentKey]: boolean } }
  if (body && typeof body === "object" && body.permissions && typeof body.permissions === "object") {
    // Replace the current permissions map with the posted one.
    // This allows deleted departments to be removed properly.
    const next = {};
    Object.entries(body.permissions).forEach(([k, v]) => {
      if (typeof v !== "boolean") return;
      const key = normalizeDepartmentKey(k);
      if (!key) return;
      next[key] = v;
    });

    // Ensure base departments always exist in-memory for this demo.
    roleEditAccess = {
      technician: Boolean(next.technician),
      account: Boolean(next.account),
      ...next,
    };

    // Prevent manager/admin from ever being stored as editable departments.
    delete roleEditAccess.manager;
    delete roleEditAccess.admin;
  }

  // Backward-compatible shape
  const { technicianCanEdit, accountCanEdit } = body;
  if (typeof technicianCanEdit === "boolean") roleEditAccess.technician = technicianCanEdit;
  if (typeof accountCanEdit === "boolean") roleEditAccess.account = accountCanEdit;

  logActivity(req.user, {
    section: "Permissions",
    action: "Updated edit permissions",
    details: `technician=${Boolean(roleEditAccess.technician)}, account=${Boolean(roleEditAccess.account)}`,
  });

  res.json({
    success: true,
    permissions: { ...roleEditAccess },
  });
});

app.get("/api/records/:entityType/:entityId/files", (req, res) => {
  const entityType = normalizeEntityType(req.params.entityType);
  const entityId = String(req.params.entityId || "").trim();
  if (!ALLOWED_ENTITY_TYPES.has(entityType) || !entityId) {
    return res.status(400).json({ success: false, message: "Invalid record type or id." });
  }
  const files = getRecordFiles(entityType, entityId).map((f) => ({
    ...f,
    url: `/uploads/${f.storedName}`,
  }));
  res.json(files);
});

app.post("/api/records/:entityType/:entityId/files", requireCanEdit, upload.single("file"), (req, res) => {
  const entityType = normalizeEntityType(req.params.entityType);
  const entityId = String(req.params.entityId || "").trim();
  if (!ALLOWED_ENTITY_TYPES.has(entityType) || !entityId) {
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }
    return res.status(400).json({ success: false, message: "Invalid record type or id." });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, message: "File is required." });
  }

  const slotRaw = String(req.body?.slot || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  const SOLD_SLOTS = new Set(["invoice", "purchase_order", "other"]);
  const EQUIPMENT_SLOTS = new Set(["main", "warranty", "inspection", "other"]);
  const allowedSlots =
    entityType === "sold" ? SOLD_SLOTS : entityType === "equipment" ? EQUIPMENT_SLOTS : new Set();
  const fileSlot = allowedSlots.has(slotRaw) ? slotRaw : undefined;

  if (fileSlot && (entityType === "sold" || entityType === "equipment")) {
    const toRemove = recordFiles.filter(
      (f) =>
        normalizeEntityType(f.entityType) === entityType &&
        String(f.entityId || "").trim() === entityId &&
        String(f.slot || "").trim() === fileSlot
    );
    toRemove.forEach((f) => {
      const idx = recordFiles.findIndex((x) => x.id === f.id);
      if (idx !== -1) recordFiles.splice(idx, 1);
      if (f.storedName) {
        const p = path.join(UPLOADS_DIR, f.storedName);
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {}
      }
    });
  }

  const fileRow = {
    id: id(),
    entityType,
    entityId,
    originalName: String(req.file.originalname || "").trim() || "file",
    storedName: String(req.file.filename || "").trim(),
    mimeType: String(req.file.mimetype || "").trim(),
    size: Number(req.file.size || 0),
    uploadedAt: new Date().toISOString(),
    uploadedBy: req.user?.displayName || req.user?.username || req.user?.role || "User",
    ...(fileSlot ? { slot: fileSlot } : {}),
  };
  recordFiles.push(fileRow);
  persistData();
  logActivity(req.user, {
    section: "Files",
    action: "Uploaded file",
    details: `${entityType}:${entityId} - ${fileRow.originalName}`,
  });
  res.status(201).json({
    ...fileRow,
    url: `/uploads/${fileRow.storedName}`,
  });
});

app.delete("/api/records/:entityType/:entityId/files/:fileId", requireCanEdit, (req, res) => {
  const entityType = normalizeEntityType(req.params.entityType);
  const entityId = String(req.params.entityId || "").trim();
  const fileId = String(req.params.fileId || "").trim();
  if (!ALLOWED_ENTITY_TYPES.has(entityType) || !entityId || !fileId) {
    return res.status(400).json({ success: false, message: "Invalid request." });
  }
  const idx = recordFiles.findIndex(
    (f) => f.id === fileId && normalizeEntityType(f.entityType) === entityType && String(f.entityId || "").trim() === entityId
  );
  if (idx === -1) return res.status(404).json({ success: false, message: "File not found." });
  const removed = recordFiles[idx];
  recordFiles.splice(idx, 1);
  persistData();
  if (removed?.storedName) {
    const p = path.join(UPLOADS_DIR, removed.storedName);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {}
    }
  }
  logActivity(req.user, {
    section: "Files",
    action: "Deleted file",
    details: `${entityType}:${entityId} - ${removed?.originalName || fileId}`,
  });
  res.status(204).send();
});

app.get("/api/stock-availability", (req, res) => {
  const deptQ = req.query.department;
  let list = stockAvailability;
  if (deptQ && typeof deptQ === "string") {
    const n = normalizeBusinessDepartment(deptQ);
    list = list.filter((i) => normalizeBusinessDepartment(i.department) === n);
  }
  res.json(list.map(withStockDepartment));
});

app.post("/api/stock-availability", requireCanEdit, (req, res) => {
  const { partNumber, partDescription, dateOfProcurement, storageLocation, qrCode, department } = req.body || {};
  if (!partNumber || !partDescription || !dateOfProcurement || !storageLocation) {
    return res.status(400).json({
      success: false,
      message: "Part number, part description, date of procurement and storage location are required.",
    });
  }
  const item = {
    id: id(),
    partNumber: String(partNumber).trim(),
    partDescription: String(partDescription).trim(),
    dateOfProcurement: String(dateOfProcurement).trim(),
    storageLocation: String(storageLocation).trim(),
    qrCode: String(qrCode || "").trim(),
    department: normalizeBusinessDepartment(department),
  };
  stockAvailability.push(item);
  logActivity(req.user, {
    section: "Stock availability",
    action: "Added stock item",
    details: `${item.partNumber} - ${item.partDescription}`,
  });
  res.status(201).json(withStockDepartment(item));
});

app.get("/api/stock-availability/:id", (req, res) => {
  const item = stockAvailability.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ success: false, message: "Not found." });
  res.json(withStockDepartment(item));
});

app.put("/api/stock-availability/:id", requireCanEdit, (req, res) => {
  const idx = stockAvailability.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Not found." });
  const { partNumber, partDescription, dateOfProcurement, storageLocation, qrCode, department } = req.body || {};
  if (!partNumber || !partDescription || !dateOfProcurement || !storageLocation) {
    return res.status(400).json({
      success: false,
      message: "Part number, part description, date of procurement and storage location are required.",
    });
  }
  const prev = stockAvailability[idx];
  const item = {
    ...prev,
    partNumber: String(partNumber).trim(),
    partDescription: String(partDescription).trim(),
    dateOfProcurement: String(dateOfProcurement).trim(),
    storageLocation: String(storageLocation).trim(),
    qrCode: String(qrCode || "").trim(),
    department:
      department !== undefined && department !== null && String(department).trim() !== ""
        ? normalizeBusinessDepartment(department)
        : normalizeBusinessDepartment(prev.department),
  };
  stockAvailability[idx] = item;
  logActivity(req.user, {
    section: "Stock availability",
    action: "Updated stock item",
    details: `${item.partNumber} - ${item.partDescription}`,
  });
  res.json(withStockDepartment(item));
});

app.delete("/api/stock-availability/:id", requireCanEdit, (req, res) => {
  const idx = stockAvailability.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Not found." });
  const removed = stockAvailability[idx];
  stockAvailability.splice(idx, 1);
  logActivity(req.user, {
    section: "Stock availability",
    action: "Deleted stock item",
    details: removed ? `${removed.partNumber} - ${removed.partDescription}` : `ID ${req.params.id}`,
  });
  res.status(204).send();
});

function soldListItemWithDocFlags(item) {
  const row = withSoldDepartment(item);
  const fs = getRecordFiles("sold", row.id);
  return {
    ...row,
    hasInvoiceDoc: fs.some((f) => String(f.slot || "") === "invoice"),
    hasPurchaseOrderDoc: fs.some((f) => String(f.slot || "") === "purchase_order"),
    hasOtherDoc: fs.some((f) => String(f.slot || "") === "other"),
  };
}

app.get("/api/sold-stock", (req, res) => {
  const deptQ = req.query.department;
  let list = soldStock;
  if (deptQ && typeof deptQ === "string") {
    const n = normalizeBusinessDepartment(deptQ);
    list = list.filter((i) => normalizeBusinessDepartment(i.department) === n);
  }
  res.json(list.map(soldListItemWithDocFlags));
});

app.post("/api/sold-stock", requireCanEdit, (req, res) => {
  const {
    serialNo,
    soldEquipmentDetails,
    sellingValue,
    clientInfo,
    sellsDate,
    warranty,
    locationDescription,
    department,
    otherNotes,
  } = req.body || {};
  if (!serialNo || !soldEquipmentDetails || sellingValue == null || sellingValue === "" || !clientInfo || !sellsDate) {
    return res.status(400).json({
      success: false,
      message: "Serial no, sold equipment details, selling value, client information and sells date are required.",
    });
  }
  const item = {
    id: id(),
    serialNo: String(serialNo).trim(),
    soldEquipmentDetails: String(soldEquipmentDetails).trim(),
    sellingValue: String(sellingValue).trim(),
    clientInfo: String(clientInfo).trim(),
    sellsDate: String(sellsDate).trim(),
    warranty: String(warranty || "").trim(),
    locationDescription: String(locationDescription || "").trim(),
    otherNotes: String(otherNotes || "").trim(),
    department: normalizeBusinessDepartment(department),
  };
  soldStock.push(item);
  logActivity(req.user, {
    section: "Sold stock",
    action: "Added sold record",
    details: `${item.serialNo} - ${item.soldEquipmentDetails}`,
  });
  res.status(201).json(soldListItemWithDocFlags(item));
});

app.get("/api/sold-stock/:id", (req, res) => {
  const item = soldStock.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ success: false, message: "Not found." });
  res.json(soldListItemWithDocFlags(item));
});

app.put("/api/sold-stock/:id", requireCanEdit, (req, res) => {
  const idx = soldStock.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Not found." });
  const {
    serialNo,
    soldEquipmentDetails,
    sellingValue,
    clientInfo,
    sellsDate,
    warranty,
    locationDescription,
    department,
    otherNotes,
  } = req.body || {};
  if (!serialNo || !soldEquipmentDetails || sellingValue == null || sellingValue === "" || !clientInfo || !sellsDate) {
    return res.status(400).json({
      success: false,
      message: "Serial no, sold equipment details, selling value, client information and sells date are required.",
    });
  }
  const prev = soldStock[idx];
  const item = {
    ...prev,
    serialNo: String(serialNo).trim(),
    soldEquipmentDetails: String(soldEquipmentDetails).trim(),
    sellingValue: String(sellingValue).trim(),
    clientInfo: String(clientInfo).trim(),
    sellsDate: String(sellsDate).trim(),
    warranty: String(warranty || "").trim(),
    locationDescription: String(locationDescription || "").trim(),
    otherNotes: otherNotes !== undefined ? String(otherNotes || "").trim() : String(prev.otherNotes || "").trim(),
    department:
      department !== undefined && department !== null && String(department).trim() !== ""
        ? normalizeBusinessDepartment(department)
        : normalizeBusinessDepartment(prev.department),
  };
  soldStock[idx] = item;
  logActivity(req.user, {
    section: "Sold stock",
    action: "Updated sold record",
    details: `${item.serialNo} - ${item.soldEquipmentDetails}`,
  });
  res.json(soldListItemWithDocFlags(item));
});

app.delete("/api/sold-stock/:id", requireCanEdit, (req, res) => {
  const idx = soldStock.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Not found." });
  const removed = soldStock[idx];
  soldStock.splice(idx, 1);
  logActivity(req.user, {
    section: "Sold stock",
    action: "Deleted sold record",
    details: removed ? `${removed.serialNo} - ${removed.soldEquipmentDetails}` : `ID ${req.params.id}`,
  });
  res.status(204).send();
});

app.get("/api/equipment", (req, res) => {
  let list = equipment;
  const typeFilter = req.query.type;
  if (typeFilter && typeof typeFilter === "string" && EQUIPMENT_TYPES.includes(typeFilter.toLowerCase())) {
    list = equipment.filter((e) => e.type === typeFilter.toLowerCase());
  }
  res.json(list);
});

app.post("/api/equipment", requireCanEdit, (req, res) => {
  const body = req.body || {};
  const fields = equipmentFields(body, {});
  if (!fields.name || !fields.location) {
    return res.status(400).json({
      success: false,
      message: "Name and location are required.",
    });
  }
  const item = { id: id(), ...fields };
  equipment.push(item);
  logActivity(req.user, {
    section: "Equipment",
    action: "Added equipment record",
    details: `${item.type} - ${item.name}${item.serialNumber ? ` (Serial: ${item.serialNumber})` : ""}`,
  });
  res.status(201).json(item);
});

app.get("/api/equipment/:id", (req, res) => {
  const item = equipment.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ success: false, message: "Not found." });
  const client = item.clientId ? clients.find((c) => c.id === item.clientId) : null;
  const project = item.projectId ? projects.find((p) => p.id === item.projectId) : null;
  res.json({
    ...item,
    clientName: client ? client.name : null,
    projectName: project ? project.name : null,
  });
});

app.put("/api/equipment/:id", requireCanEdit, (req, res) => {
  const idx = equipment.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Not found." });
  const body = req.body || {};
  const fields = equipmentFields(body, equipment[idx]);
  if (!fields.name || !fields.location) {
    return res.status(400).json({
      success: false,
      message: "Name and location are required.",
    });
  }
  const item = { ...equipment[idx], ...fields };
  equipment[idx] = item;
  logActivity(req.user, {
    section: "Equipment",
    action: "Updated equipment record",
    details: `${item.type} - ${item.name}${item.serialNumber ? ` (Serial: ${item.serialNumber})` : ""}`,
  });
  res.json(item);
});

app.delete("/api/equipment/:id", requireCanEdit, (req, res) => {
  const idx = equipment.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Not found." });
  const removed = equipment[idx];
  const equipmentId = equipment[idx].id;
  equipment.splice(idx, 1);
  serviceHistory = serviceHistory.filter((s) => (s.equipmentId || s.craneId) !== equipmentId);
  logActivity(req.user, {
    section: "Equipment",
    action: "Deleted equipment record",
    details: removed ? `${removed.type} - ${removed.name}` : `ID ${req.params.id}`,
  });
  res.status(204).send();
});

app.get("/api/clients", (req, res) => {
  res.json(clients);
});

app.post("/api/clients", requireCanEdit, (req, res) => {
  const { name, contactName, email, phone, address } = req.body || {};
  const nameVal = String(name || "").trim();
  const contactNameVal = String(contactName || "").trim();
  const emailVal = String(email || "").trim();
  const phoneVal = String(phone || "").trim();
  const addressVal = String(address || "").trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\d{7,15}$/;

  if (!nameVal || !contactNameVal || !emailVal || !phoneVal || !addressVal) {
    return res.status(400).json({ success: false, message: "Client name, contact name, email, phone and address are required." });
  }
  if (!emailRegex.test(emailVal)) {
    return res.status(400).json({ success: false, message: "Enter a valid email address." });
  }
  if (!phoneRegex.test(phoneVal)) {
    return res.status(400).json({ success: false, message: "Phone must contain only numbers (7-15 digits)." });
  }
  const item = {
    id: id(),
    name: nameVal,
    contactName: contactNameVal,
    email: emailVal,
    phone: phoneVal,
    address: addressVal,
  };
  clients.push(item);
  logActivity(req.user, {
    section: "Clients",
    action: "Added client",
    details: `${item.name}`,
  });
  res.status(201).json(item);
});

app.get("/api/clients/:id", (req, res) => {
  const item = clients.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ success: false, message: "Not found." });
  res.json(item);
});

app.put("/api/clients/:id", requireCanEdit, (req, res) => {
  const idx = clients.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Not found." });
  const { name, contactName, email, phone, address } = req.body || {};
  const nameVal = String(name || "").trim();
  const contactNameVal = String(contactName || "").trim();
  const emailVal = String(email || "").trim();
  const phoneVal = String(phone || "").trim();
  const addressVal = String(address || "").trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\d{7,15}$/;

  if (!nameVal || !contactNameVal || !emailVal || !phoneVal || !addressVal) {
    return res.status(400).json({ success: false, message: "Client name, contact name, email, phone and address are required." });
  }
  if (!emailRegex.test(emailVal)) {
    return res.status(400).json({ success: false, message: "Enter a valid email address." });
  }
  if (!phoneRegex.test(phoneVal)) {
    return res.status(400).json({ success: false, message: "Phone must contain only numbers (7-15 digits)." });
  }

  clients[idx] = {
    ...clients[idx],
    name: nameVal,
    contactName: contactNameVal,
    email: emailVal,
    phone: phoneVal,
    address: addressVal,
  };
  logActivity(req.user, {
    section: "Clients",
    action: "Updated client",
    details: `${clients[idx].name}`,
  });
  res.json(clients[idx]);
});

app.delete("/api/clients/:id", requireCanEdit, (req, res) => {
  const idx = clients.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Not found." });
  const removed = clients[idx];
  const cid = String(removed?.id || req.params.id || "").trim();
  clients.splice(idx, 1);
  if (cid) {
    const toDrop = recordFiles.filter((f) => normalizeEntityType(f.entityType) === "client" && String(f.entityId || "").trim() === cid);
    toDrop.forEach((f) => {
      const fi = recordFiles.findIndex((x) => x.id === f.id);
      if (fi !== -1) recordFiles.splice(fi, 1);
      if (f.storedName) {
        const p = path.join(UPLOADS_DIR, f.storedName);
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {}
      }
    });
    if (toDrop.length) persistData();
  }
  logActivity(req.user, {
    section: "Clients",
    action: "Deleted client",
    details: removed ? `${removed.name}` : `ID ${req.params.id}`,
  });
  res.status(204).send();
});

app.get("/api/projects", (req, res) => {
  res.json(projects);
});

app.post("/api/projects", requireCanEdit, (req, res) => {
  const { name, clientId, projectValue, description, startDate, endDate, status } = req.body || {};
  if (!name) {
    return res.status(400).json({ success: false, message: "Project name is required." });
  }
  const item = {
    id: id(),
    name: String(name).trim(),
    clientId: clientId || null,
    projectValue: String(projectValue || "").trim(),
    description: String(description || "").trim(),
    startDate: String(startDate || "").trim(),
    endDate: String(endDate || "").trim(),
    status: String(status || "active").trim(),
  };
  projects.push(item);
  logActivity(req.user, {
    section: "Projects",
    action: "Added project",
    details: `${item.name}`,
  });
  res.status(201).json(item);
});

app.get("/api/projects/:id", (req, res) => {
  const item = projects.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ success: false, message: "Not found." });
  res.json(item);
});

app.put("/api/projects/:id", requireCanEdit, (req, res) => {
  const idx = projects.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Not found." });
  const { name, clientId, projectValue, description, startDate, endDate, status } = req.body || {};
  if (!name) return res.status(400).json({ success: false, message: "Project name is required." });
  projects[idx] = {
    ...projects[idx],
    name: String(name).trim(),
    clientId: clientId || null,
    projectValue: String(projectValue || "").trim(),
    description: String(description || "").trim(),
    startDate: String(startDate || "").trim(),
    endDate: String(endDate || "").trim(),
    status: String(status || "active").trim(),
  };
  logActivity(req.user, {
    section: "Projects",
    action: "Updated project",
    details: `${projects[idx].name}`,
  });
  res.json(projects[idx]);
});

app.delete("/api/projects/:id", requireCanEdit, (req, res) => {
  const idx = projects.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Not found." });
  const removed = projects[idx];
  const pid = String(removed?.id || req.params.id || "").trim();
  projects.splice(idx, 1);
  if (pid) {
    const toDrop = recordFiles.filter((f) => normalizeEntityType(f.entityType) === "project" && String(f.entityId || "").trim() === pid);
    toDrop.forEach((f) => {
      const fi = recordFiles.findIndex((x) => x.id === f.id);
      if (fi !== -1) recordFiles.splice(fi, 1);
      if (f.storedName) {
        const p = path.join(UPLOADS_DIR, f.storedName);
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {}
      }
    });
    if (toDrop.length) persistData();
  }
  logActivity(req.user, {
    section: "Projects",
    action: "Deleted project",
    details: removed ? `${removed.name}` : `ID ${req.params.id}`,
  });
  res.status(204).send();
});

app.get("/api/equipment/:id/services", (req, res) => {
  const item = equipment.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ success: false, message: "Equipment not found." });
  const list = serviceHistory
    .filter((s) => (s.equipmentId || s.craneId) === req.params.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  res.json(list);
});

app.post("/api/equipment/:id/services", requireCanEdit, (req, res) => {
  const eqIdx = equipment.findIndex((i) => i.id === req.params.id);
  if (eqIdx === -1) return res.status(404).json({ success: false, message: "Equipment not found." });
  const { date, type, description, performedBy, nextDueDate } = req.body || {};
  if (!date || !type) {
    return res.status(400).json({ success: false, message: "Date and type are required." });
  }
  const entry = {
    id: id(),
    equipmentId: req.params.id,
    date: String(date).trim(),
    type: String(type).trim(),
    description: String(description || "").trim(),
    performedBy: String(performedBy || "").trim(),
    nextDueDate: String(nextDueDate || "").trim(),
  };
  serviceHistory.push(entry);
  equipment[eqIdx] = { ...equipment[eqIdx], lastServiceDate: entry.date };
  logActivity(req.user, {
    section: "Maintenance",
    action: "Added maintenance entry",
    details: `${entry.type} on ${entry.date}${entry.nextDueDate ? ` (next due: ${entry.nextDueDate})` : ""}`,
  });
  res.status(201).json(entry);
});

app.delete("/api/equipment/:equipmentId/services/:serviceId", requireCanEdit, (req, res) => {
  const idx = serviceHistory.findIndex(
    (s) => (s.equipmentId || s.craneId) === req.params.equipmentId && s.id === req.params.serviceId
  );
  if (idx === -1) return res.status(404).json({ success: false, message: "Not found." });
  const removed = serviceHistory[idx];
  serviceHistory.splice(idx, 1);
  logActivity(req.user, {
    section: "Maintenance",
    action: "Deleted maintenance entry",
    details: removed ? `${removed.type} on ${removed.date}` : `Service ID ${req.params.serviceId}`,
  });
  res.status(204).send();
});

app.get("/api/alerts", (req, res) => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const in3 = new Date(now);
  in3.setDate(in3.getDate() + 3);
  const in14 = new Date(now);
  in14.setDate(in14.getDate() + 14);
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);
  const in90 = new Date(now);
  in90.setDate(in90.getDate() + 90);
  const alerts = [];

  equipment.forEach((e) => {
    if (e.warrantyExpiry && e.warrantyExpiry <= in90.toISOString().slice(0, 10) && e.warrantyExpiry >= today) {
      alerts.push({
        type: "warranty_expiring",
        severity: e.warrantyExpiry <= in14.toISOString().slice(0, 10) ? "high" : "medium",
        entityType: "equipment",
        entityId: e.id,
        entityName: e.name,
        dueDate: e.warrantyExpiry,
        message: `Warranty expires for ${e.name} (${e.type})`,
      });
    }
    if (e.warrantyExpiry && e.warrantyExpiry < today) {
      alerts.push({
        type: "warranty_expired",
        severity: "high",
        entityType: "equipment",
        entityId: e.id,
        entityName: e.name,
        dueDate: e.warrantyExpiry,
        message: `Warranty expired for ${e.name} (${e.type})`,
      });
    }
    if (e.nextInspectionDate && e.nextInspectionDate <= in30.toISOString().slice(0, 10) && e.nextInspectionDate >= today) {
      alerts.push({
        type: "inspection_due",
        severity: e.nextInspectionDate <= in14.toISOString().slice(0, 10) ? "high" : "medium",
        entityType: "equipment",
        entityId: e.id,
        entityName: e.name,
        dueDate: e.nextInspectionDate,
        message: `Inspection due for ${e.name} (${e.type})`,
      });
    }
    if (e.nextInspectionDate && e.nextInspectionDate < today) {
      alerts.push({
        type: "inspection_overdue",
        severity: "high",
        entityType: "equipment",
        entityId: e.id,
        entityName: e.name,
        dueDate: e.nextInspectionDate,
        message: `Inspection overdue for ${e.name} (${e.type})`,
      });
    }
  });

  serviceHistory.forEach((s) => {
    const eqId = s.equipmentId || s.craneId;
    if (!eqId) return;
    if (s.nextDueDate && s.nextDueDate <= in14.toISOString().slice(0, 10) && s.nextDueDate >= today) {
      const eq = equipment.find((e) => e.id === eqId);
      alerts.push({
        type: "maintenance_due",
        severity: "medium",
        entityType: "equipment",
        entityId: eqId,
        entityName: eq ? eq.name : eqId,
        dueDate: s.nextDueDate,
        message: `Maintenance due for ${eq ? eq.name : eqId}`,
      });
    }
    if (s.nextDueDate && s.nextDueDate < today) {
      const eq = equipment.find((e) => e.id === eqId);
      alerts.push({
        type: "maintenance_overdue",
        severity: "high",
        entityType: "equipment",
        entityId: eqId,
        entityName: eq ? eq.name : eqId,
        dueDate: s.nextDueDate,
        message: `Maintenance overdue for ${eq ? eq.name : eqId}`,
      });
    }
  });

  // Delivery alerts from sold stock records (interpreting sell date as planned delivery window).
  soldStock.forEach((item) => {
    const deliveryDate = String(item.sellsDate || "").trim();
    if (!deliveryDate) return;
    if (deliveryDate < today) return;
    if (deliveryDate > in14.toISOString().slice(0, 10)) return;

    const label = item.soldEquipmentDetails || item.serialNo || "Sold item";
    alerts.push({
      type: "delivery_due",
      severity: deliveryDate <= in3.toISOString().slice(0, 10) ? "high" : "medium",
      entityType: "sold_stock",
      entityId: item.id,
      entityName: label,
      dueDate: deliveryDate,
      message: `Delivery due for ${label}`,
    });
  });

  // Stock level alerts from current stock availability.
  alerts.push(...buildStockLevelAlerts(today));

  res.json(alerts);
});

app.get("/api/activity/recent", requireCanEdit, (req, res) => {
  const limitRaw = req.query.limit;
  let limit = Number.parseInt(String(limitRaw || "6"), 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 6;
  limit = Math.min(limit, 25);
  res.json(activityLog.slice(0, limit));
});

function searchHaystackIncludes(needleLower, ...parts) {
  const blob = parts.map((p) => String(p || "").toLowerCase()).join(" ");
  return blob.includes(needleLower);
}

/** Normalize IDs from URLs / JSON (unicode dashes, case) so lookup always matches stored UUIDs. */
function normalizeSearchRecordId(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/[\u2010\u2011\u2012\u2013\u2014\uFE58\uFE63\uFF0D\u2212]/g, "-")
    .toLowerCase();
}

function findByIdNormalized(arr, idRaw) {
  const want = normalizeSearchRecordId(idRaw);
  if (!want) return null;
  return arr.find((x) => normalizeSearchRecordId(x.id) === want) || null;
}

function searchFindClient(cid) {
  return findByIdNormalized(clients, cid) || null;
}

function searchFindProject(pid) {
  return findByIdNormalized(projects, pid) || null;
}

/** Same shape as rows returned by GET /api/search (for full-page detail view). */
function buildSearchResultRowForRecord(entityRaw, idRaw) {
  const entity = normalizeEntityType(String(entityRaw || ""));
  const id = String(idRaw || "").trim();
  if (!id || !ALLOWED_ENTITY_TYPES.has(entity)) return null;

  if (entity === "client") {
    const c = findByIdNormalized(clients, id);
    if (!c) return null;
    const folders = [];
    const eqList = equipment.filter((e) => e.clientId === c.id);
    if (eqList.length) {
      folders.push({
        key: "equipment",
        items: eqList.map((e) => ({
          path: `/equipment/${e.id}`,
          title: e.name || e.model || e.type,
          subtitle: [e.serialNumber, e.type].filter(Boolean).join(" · "),
        })),
      });
    }
    const projList = projects.filter((p) => p.clientId === c.id);
    if (projList.length) {
      folders.push({
        key: "projects",
        items: projList.map((p) => ({
          path: "/projects",
          title: p.name,
          subtitle: p.status || "",
        })),
      });
    }
    const nameLower = String(c.name || "").toLowerCase();
    const phoneDigits = String(c.phone || "").replace(/\D/g, "");
    const soldRelated = soldStock.filter((s) => {
      const info = String(s.clientInfo || "").toLowerCase();
      if (nameLower && info.includes(nameLower)) return true;
      if (phoneDigits.length >= 6 && String(s.clientInfo || "").replace(/\D/g, "").includes(phoneDigits)) return true;
      return false;
    });
    if (soldRelated.length) {
      folders.push({
        key: "soldStock",
        items: soldRelated.slice(0, 20).map((s) => ({
          path: `/sold-stock/${encodeURIComponent(String(s.id || ""))}`,
          title: s.serialNo || String(s.soldEquipmentDetails || "").slice(0, 48),
          subtitle: String(s.clientInfo || "").slice(0, 80),
        })),
      });
    }
    const clientFilesFolder = buildFilesFolder("client", c.id);
    if (clientFilesFolder) folders.push(clientFilesFolder);
    return {
      entity: "client",
      id: c.id,
      headline: c.name,
      subline: [c.email, c.phone].filter(Boolean).join(" · "),
      details: {
        recordId: c.id,
        name: c.name,
        contactName: c.contactName,
        email: c.email,
        phone: c.phone,
        address: c.address,
      },
      folders,
    };
  }

  if (entity === "equipment") {
    const e = findByIdNormalized(equipment, id);
    if (!e) return null;
    const cl = e.clientId ? searchFindClient(e.clientId) : null;
    const pr = e.projectId ? searchFindProject(e.projectId) : null;
    const folders = [];
    if (cl) {
      folders.push({
        key: "client",
        items: [
          {
            path: "/clients",
            title: cl.name,
            subtitle: [cl.phone, cl.email].filter(Boolean).join(" · "),
          },
        ],
      });
    }
    if (pr) {
      folders.push({
        key: "project",
        items: [{ path: "/projects", title: pr.name, subtitle: pr.status || "" }],
      });
    }
    const svc = serviceHistory.filter((s) => (s.equipmentId || s.craneId) === e.id);
    if (svc.length) {
      folders.push({
        key: "serviceRecords",
        items: [
          {
            path: `/equipment/${e.id}`,
            title: String(svc.length),
            subtitle: "",
          },
        ],
      });
    }
    const soldBySerial = soldStock.filter((s) => {
      if (!e.serialNumber) return false;
      return String(s.serialNo || "").toLowerCase().includes(String(e.serialNumber).toLowerCase());
    });
    if (soldBySerial.length) {
      folders.push({
        key: "soldStock",
        items: soldBySerial.map((s) => ({
          path: `/sold-stock/${encodeURIComponent(String(s.id || ""))}`,
          title: s.serialNo,
          subtitle: String(s.soldEquipmentDetails || "").slice(0, 72),
        })),
      });
    }
    folders.push({
      key: "equipmentFile",
      items: [{ path: `/equipment/${e.id}`, title: e.name, subtitle: e.serialNumber || e.model || "" }],
    });
    const equipmentFilesFolder = buildFilesFolder("equipment", e.id);
    if (equipmentFilesFolder) folders.push(equipmentFilesFolder);
    return {
      entity: "equipment",
      id: e.id,
      headline: e.name,
      subline: [e.serialNumber, e.type].filter(Boolean).join(" · "),
      details: {
        recordId: e.id,
        type: e.type,
        name: e.name,
        model: e.model,
        location: e.location,
        status: e.status,
        serialNumber: e.serialNumber,
        manufacturer: e.manufacturer,
        capacity: e.capacity,
        commissionDate: e.commissionDate,
        warrantyExpiry: e.warrantyExpiry,
        nextInspectionDate: e.nextInspectionDate,
        lastInspectionDate: e.lastInspectionDate,
        lastServiceDate: e.lastServiceDate,
        clientId: e.clientId || "",
        clientName: cl ? cl.name : "",
        projectId: e.projectId || "",
        projectName: pr ? pr.name : "",
        notes: e.notes || "",
        complianceNotes: e.complianceNotes || "",
      },
      folders,
    };
  }

  if (entity === "stock") {
    const raw = findByIdNormalized(stockAvailability, id);
    if (!raw) return null;
    const row = withStockDepartment(raw);
    const folders = [
      {
        key: "stockFile",
        items: [
          {
            path: "/stock-availability",
            title: row.partNumber,
            subtitle: row.partDescription,
          },
        ],
      },
    ];
    const stockFilesFolder = buildFilesFolder("stock", row.id);
    if (stockFilesFolder) folders.push(stockFilesFolder);
    return {
      entity: "stock",
      id: row.id,
      headline: row.partNumber,
      subline: row.partDescription,
      details: {
        recordId: row.id,
        partNumber: row.partNumber,
        partDescription: row.partDescription,
        dateOfProcurement: row.dateOfProcurement,
        storageLocation: row.storageLocation,
        qrCode: row.qrCode || "",
        department: row.department,
      },
      folders,
    };
  }

  if (entity === "sold") {
    const raw = findByIdNormalized(soldStock, id);
    if (!raw) return null;
    const row = withSoldDepartment(raw);
    const folders = [];
    const eqMatch = equipment.find(
      (e) =>
        e.serialNumber &&
        String(e.serialNumber).toLowerCase() === String(row.serialNo || "").toLowerCase()
    );
    if (eqMatch) {
      folders.push({
        key: "equipment",
        items: [
          {
            path: `/equipment/${eqMatch.id}`,
            title: eqMatch.name,
            subtitle: eqMatch.serialNumber,
          },
        ],
      });
    }
    folders.push({
      key: "soldFile",
      items: [{ path: `/sold-stock/${encodeURIComponent(String(row.id || ""))}`, title: row.serialNo, subtitle: row.clientInfo }],
    });
    folders.push({
      key: "registry",
      items: [{ path: "/clients", title: row.clientInfo, subtitle: row.sellsDate }],
    });
    const soldFilesFolder = buildFilesFolder("sold", row.id);
    if (soldFilesFolder) folders.push(soldFilesFolder);
    return {
      entity: "sold",
      id: row.id,
      headline: row.serialNo,
      subline: String(row.soldEquipmentDetails || "").slice(0, 100),
      details: {
        recordId: row.id,
        serialNo: row.serialNo,
        soldEquipmentDetails: row.soldEquipmentDetails,
        sellingValue: row.sellingValue,
        clientInfo: row.clientInfo,
        sellsDate: row.sellsDate,
        warranty: row.warranty || "",
        locationDescription: row.locationDescription || "",
        department: row.department,
        otherNotes: row.otherNotes || "",
      },
      folders,
    };
  }

  if (entity === "project") {
    const p = findByIdNormalized(projects, id);
    if (!p) return null;
    const cl = p.clientId ? searchFindClient(p.clientId) : null;
    const folders = [];
    if (cl) {
      folders.push({
        key: "client",
        items: [{ path: "/clients", title: cl.name, subtitle: cl.phone || cl.email }],
      });
    }
    const eqOnProject = equipment.filter((e) => e.projectId === p.id);
    if (eqOnProject.length) {
      folders.push({
        key: "equipment",
        items: eqOnProject.map((e) => ({
          path: `/equipment/${e.id}`,
          title: e.name,
          subtitle: e.serialNumber || e.type,
        })),
      });
    }
    folders.push({
      key: "projectFile",
      items: [{ path: "/projects", title: p.name, subtitle: p.status || "" }],
    });
    const projectFilesFolder = buildFilesFolder("project", p.id);
    if (projectFilesFolder) folders.push(projectFilesFolder);
    return {
      entity: "project",
      id: p.id,
      headline: p.name,
      subline: cl ? cl.name : "",
      details: {
        recordId: p.id,
        name: p.name,
        clientId: p.clientId || "",
        clientName: cl ? cl.name : "",
        projectValue: p.projectValue,
        description: p.description,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
      },
      folders,
    };
  }

  return null;
}

/** Query form avoids path/proxy edge cases with UUIDs: GET /api/search/record?entity=client&id=<uuid> */
app.get("/api/search/record", (req, res) => {
  const entity = String(req.query.entity || "").trim();
  const id = req.query.id != null ? String(req.query.id).trim() : "";
  if (!entity || !id) {
    return res.status(400).json({ success: false, message: "Missing entity or id query parameters." });
  }
  const row = buildSearchResultRowForRecord(entity, id);
  if (!row) {
    return res.status(404).json({ success: false, message: "Record not found." });
  }
  res.json({ success: true, result: row });
});

app.get("/api/search/record/:entity/:id", (req, res) => {
  const row = buildSearchResultRowForRecord(req.params.entity, req.params.id);
  if (!row) {
    return res.status(404).json({ success: false, message: "Record not found." });
  }
  res.json({ success: true, result: row });
});

app.get("/api/search", (req, res) => {
  const qRaw = String(req.query.q || "").trim();
  const qLower = qRaw.toLowerCase();
  if (!qRaw || qRaw.length < 2) {
    return res.json({ query: qRaw, results: [] });
  }

  const maxResults = 24;
  const seen = new Set();
  const results = [];

  const pushResult = (dedupeKey, row) => {
    if (seen.has(dedupeKey) || results.length >= maxResults) return;
    seen.add(dedupeKey);
    results.push(row);
  };

  clients.forEach((c) => {
    if (
      !searchHaystackIncludes(
        qLower,
        c.id,
        c.name,
        c.contactName,
        c.email,
        c.phone,
        c.address
      )
    ) {
      return;
    }
    const folders = [];
    const eqList = equipment.filter((e) => e.clientId === c.id);
    if (eqList.length) {
      folders.push({
        key: "equipment",
        items: eqList.map((e) => ({
          path: `/equipment/${e.id}`,
          title: e.name || e.model || e.type,
          subtitle: [e.serialNumber, e.type].filter(Boolean).join(" · "),
        })),
      });
    }
    const projList = projects.filter((p) => p.clientId === c.id);
    if (projList.length) {
      folders.push({
        key: "projects",
        items: projList.map((p) => ({
          path: "/projects",
          title: p.name,
          subtitle: p.status || "",
        })),
      });
    }
    const nameLower = String(c.name || "").toLowerCase();
    const phoneDigits = String(c.phone || "").replace(/\D/g, "");
    const soldRelated = soldStock.filter((s) => {
      const info = String(s.clientInfo || "").toLowerCase();
      if (nameLower && info.includes(nameLower)) return true;
      if (phoneDigits.length >= 6 && String(s.clientInfo || "").replace(/\D/g, "").includes(phoneDigits)) return true;
      return false;
    });
    if (soldRelated.length) {
      folders.push({
        key: "soldStock",
        items: soldRelated.slice(0, 20).map((s) => ({
          path: `/sold-stock/${encodeURIComponent(String(s.id || ""))}`,
          title: s.serialNo || String(s.soldEquipmentDetails || "").slice(0, 48),
          subtitle: String(s.clientInfo || "").slice(0, 80),
        })),
      });
    }
    const clientFilesFolder = buildFilesFolder("client", c.id);
    if (clientFilesFolder) folders.push(clientFilesFolder);

    pushResult(`client:${c.id}`, {
      entity: "client",
      id: c.id,
      headline: c.name,
      subline: [c.email, c.phone].filter(Boolean).join(" · "),
      details: {
        recordId: c.id,
        name: c.name,
        contactName: c.contactName,
        email: c.email,
        phone: c.phone,
        address: c.address,
      },
      folders,
    });
  });

  equipment.forEach((e) => {
    if (
      !searchHaystackIncludes(
        qLower,
        e.id,
        e.name,
        e.model,
        e.serialNumber,
        e.manufacturer,
        e.location,
        e.type,
        e.capacity,
        e.notes,
        e.complianceNotes
      )
    ) {
      return;
    }
    const cl = e.clientId ? searchFindClient(e.clientId) : null;
    const pr = e.projectId ? searchFindProject(e.projectId) : null;
    const folders = [];

    if (cl) {
      folders.push({
        key: "client",
        items: [
          {
            path: "/clients",
            title: cl.name,
            subtitle: [cl.phone, cl.email].filter(Boolean).join(" · "),
          },
        ],
      });
    }
    if (pr) {
      folders.push({
        key: "project",
        items: [{ path: "/projects", title: pr.name, subtitle: pr.status || "" }],
      });
    }

    const svc = serviceHistory.filter((s) => (s.equipmentId || s.craneId) === e.id);
    if (svc.length) {
      folders.push({
        key: "serviceRecords",
        items: [
          {
            path: `/equipment/${e.id}`,
            title: String(svc.length),
            subtitle: "",
          },
        ],
      });
    }

    const soldBySerial = soldStock.filter((s) => {
      if (!e.serialNumber) return false;
      return String(s.serialNo || "").toLowerCase().includes(String(e.serialNumber).toLowerCase());
    });
    if (soldBySerial.length) {
      folders.push({
        key: "soldStock",
        items: soldBySerial.map((s) => ({
          path: `/sold-stock/${encodeURIComponent(String(s.id || ""))}`,
          title: s.serialNo,
          subtitle: String(s.soldEquipmentDetails || "").slice(0, 72),
        })),
      });
    }

    folders.push({
      key: "equipmentFile",
      items: [{ path: `/equipment/${e.id}`, title: e.name, subtitle: e.serialNumber || e.model || "" }],
    });
    const equipmentFilesFolder = buildFilesFolder("equipment", e.id);
    if (equipmentFilesFolder) folders.push(equipmentFilesFolder);

    pushResult(`equipment:${e.id}`, {
      entity: "equipment",
      id: e.id,
      headline: e.name,
      subline: [e.serialNumber, e.type].filter(Boolean).join(" · "),
      details: {
        recordId: e.id,
        type: e.type,
        name: e.name,
        model: e.model,
        location: e.location,
        status: e.status,
        serialNumber: e.serialNumber,
        manufacturer: e.manufacturer,
        capacity: e.capacity,
        commissionDate: e.commissionDate,
        warrantyExpiry: e.warrantyExpiry,
        nextInspectionDate: e.nextInspectionDate,
        lastInspectionDate: e.lastInspectionDate,
        lastServiceDate: e.lastServiceDate,
        clientId: e.clientId || "",
        clientName: cl ? cl.name : "",
        projectId: e.projectId || "",
        projectName: pr ? pr.name : "",
        notes: e.notes || "",
        complianceNotes: e.complianceNotes || "",
      },
      folders,
    });
  });

  stockAvailability.forEach((item) => {
    const row = withStockDepartment(item);
    if (
      !searchHaystackIncludes(
        qLower,
        row.id,
        row.partNumber,
        row.partDescription,
        row.qrCode,
        row.storageLocation,
        row.department
      )
    ) {
      return;
    }
    const folders = [
      {
        key: "stockFile",
        items: [
          {
            path: "/stock-availability",
            title: row.partNumber,
            subtitle: row.partDescription,
          },
        ],
      },
    ];
    const stockFilesFolder = buildFilesFolder("stock", row.id);
    if (stockFilesFolder) folders.push(stockFilesFolder);
    pushResult(`stock:${row.id}`, {
      entity: "stock",
      id: row.id,
      headline: row.partNumber,
      subline: row.partDescription,
      details: {
        recordId: row.id,
        partNumber: row.partNumber,
        partDescription: row.partDescription,
        dateOfProcurement: row.dateOfProcurement,
        storageLocation: row.storageLocation,
        qrCode: row.qrCode || "",
        department: row.department,
      },
      folders,
    });
  });

  // If the user searches by a client ID, sold records only contain the client *name/text*
  // in `clientInfo`. So we build aliases from clients whose IDs match the query.
  const clientAliasesById = clients.filter((c) => {
    const cid = String(c?.id || "").toLowerCase();
    if (!cid) return false;
    return cid.includes(qLower);
  });
  const clientAliasNames = clientAliasesById.map((c) => String(c?.name || "").toLowerCase()).filter(Boolean);
  const clientAliasPhoneDigits = clientAliasesById
    .map((c) => String(c?.phone || "").replace(/\D/g, ""))
    .filter((d) => d.length >= 6);

  soldStock.forEach((item) => {
    const row = withSoldDepartment(item);
    const infoLower = String(row.clientInfo || "").toLowerCase();
    const soldPhoneDigits = String(row.clientInfo || "").replace(/\D/g, "");

    const qMatches =
      searchHaystackIncludes(
        qLower,
        row.id,
        row.serialNo,
        row.soldEquipmentDetails,
        row.clientInfo,
        row.sellingValue,
        row.sellsDate,
        row.warranty,
        row.locationDescription,
        row.department,
        row.otherNotes
      ) ||
      (clientAliasNames.length > 0 && clientAliasNames.some((n) => n && infoLower.includes(n))) ||
      (clientAliasPhoneDigits.length > 0 && soldPhoneDigits.length >= 6 && clientAliasPhoneDigits.some((d) => soldPhoneDigits.includes(d)));

    if (!qMatches) return;
    const folders = [];
    const eqMatch = equipment.find(
      (e) =>
        e.serialNumber &&
        String(e.serialNumber).toLowerCase() === String(row.serialNo || "").toLowerCase()
    );
    if (eqMatch) {
      folders.push({
        key: "equipment",
        items: [
          {
            path: `/equipment/${eqMatch.id}`,
            title: eqMatch.name,
            subtitle: eqMatch.serialNumber,
          },
        ],
      });
    }
    folders.push({
      key: "soldFile",
      items: [{ path: `/sold-stock/${encodeURIComponent(String(row.id || ""))}`, title: row.serialNo, subtitle: row.clientInfo }],
    });
    folders.push({
      key: "registry",
      items: [{ path: "/clients", title: row.clientInfo, subtitle: row.sellsDate }],
    });
    const soldFilesFolder = buildFilesFolder("sold", row.id);
    if (soldFilesFolder) folders.push(soldFilesFolder);

    pushResult(`sold:${row.id}`, {
      entity: "sold",
      id: row.id,
      headline: row.serialNo,
      subline: String(row.soldEquipmentDetails || "").slice(0, 100),
      details: {
        recordId: row.id,
        serialNo: row.serialNo,
        soldEquipmentDetails: row.soldEquipmentDetails,
        sellingValue: row.sellingValue,
        clientInfo: row.clientInfo,
        sellsDate: row.sellsDate,
        warranty: row.warranty || "",
        locationDescription: row.locationDescription || "",
        department: row.department,
        otherNotes: row.otherNotes || "",
      },
      folders,
    });
  });

  projects.forEach((p) => {
    if (
      !searchHaystackIncludes(
        qLower,
        p.id,
        p.name,
        p.description,
        p.projectValue,
        p.status,
        p.startDate,
        p.endDate,
        p.clientId
      )
    ) {
      return;
    }
    const cl = p.clientId ? searchFindClient(p.clientId) : null;
    const folders = [];
    if (cl) {
      folders.push({
        key: "client",
        items: [{ path: "/clients", title: cl.name, subtitle: cl.phone || cl.email }],
      });
    }
    const eqOnProject = equipment.filter((e) => e.projectId === p.id);
    if (eqOnProject.length) {
      folders.push({
        key: "equipment",
        items: eqOnProject.map((e) => ({
          path: `/equipment/${e.id}`,
          title: e.name,
          subtitle: e.serialNumber || e.type,
        })),
      });
    }
    folders.push({
      key: "projectFile",
      items: [{ path: "/projects", title: p.name, subtitle: p.status || "" }],
    });
    const projectFilesFolder = buildFilesFolder("project", p.id);
    if (projectFilesFolder) folders.push(projectFilesFolder);

    pushResult(`project:${p.id}`, {
      entity: "project",
      id: p.id,
      headline: p.name,
      subline: cl ? cl.name : "",
      details: {
        recordId: p.id,
        name: p.name,
        clientId: p.clientId || "",
        clientName: cl ? cl.name : "",
        projectValue: p.projectValue,
        description: p.description,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
      },
      folders,
    });
  });

  res.json({ query: qRaw, results });
});

app.post("/api/alerts/stock-email/test", requireManager, async (_req, res) => {
  try {
    const result = await sendStockLevelEmailAlerts({ forTest: true });
    if (result.skipped) {
      return res.status(400).json({
        success: false,
        reason: result.reason,
        message: stockMailSkipReasonMessage(result.reason),
      });
    }
    res.json({
      success: true,
      message: "Test email sent. Check manager/procurement inboxes (and spam).",
      sent: result.sent,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[stock-email/test]", msg);
    res.status(500).json({
      success: false,
      message: "SMTP send failed.",
      detail: msg,
    });
  }
});

function scheduleStockAlertEmailDailyLoop() {
  if (!STOCK_ALERT_MAIL_ENABLED) return;
  const { hour, minute } = parseStockAlertDailyAt(process.env.STOCK_ALERT_MAIL_DAILY_AT);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const tick = () => {
    (async () => {
      const previousCompany = activeCompanyId;
      for (const companyId of COMPANY_IDS) {
        bindCompanyData(companyId);
        await sendStockLevelEmailAlerts().catch(() => {});
      }
      bindCompanyData(previousCompany);
    })()
      .catch(() => {})
      .finally(() => {
        const delay = msUntilNextStockAlertDailyRun(hour, minute);
        setTimeout(tick, delay);
      });
  };
  const firstDelay = msUntilNextStockAlertDailyRun(hour, minute);
  console.log(
    `[env] Stock alert email: once per day at ${hh}:${mm} (server local time). Next run in ~${Math.max(1, Math.round(firstDelay / 60000))} min.`
  );
  setTimeout(tick, firstDelay);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "inventory-api" });
});

async function startServer() {
  if (MONGODB_URI) {
    try {
      await initMongoPersistence();
      console.log(`[db] Connected to MongoDB (${MONGODB_DB}.${MONGODB_COLLECTION})`);
    } catch (err) {
      console.error("[db] MongoDB initialization failed:", err?.message || err);
      process.exit(1);
    }
  } else if (!USE_LOCAL_DATA_FILE) {
    console.warn("[db] USE_LOCAL_DATA_FILE=false but MONGODB_URI is missing; data persistence disabled.");
  }

  app.listen(PORT, () => {
    console.log(`Inventory Control System API running at http://localhost:${PORT}`);
    scheduleStockAlertEmailDailyLoop();
  });
}

startServer();
