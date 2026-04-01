import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import fs from "node:fs";
import path from "path";
import bcrypt from "bcryptjs";
import { ensureUploadsDir } from "./upload-path";
import { 
  insertProgramSchema,
  insertChapterSchema,
  insertVolunteerOpportunitySchema,
  insertStatsSchema,
  insertContactInfoSchema,
  insertPublicationSchema,
  insertProjectReportSchema,
  insertChapterUserSchema,
  insertBarangayUserSchema,
  insertChapterKpiSchema,
  insertMemberSchema,
  insertChapterOfficerSchema,
  insertKpiTemplateSchema,
  insertKpiCompletionSchema,
  insertImportantDocumentSchema,
  insertMouSubmissionSchema,
  insertChapterRequestSchema,
  insertNationalRequestSchema
} from "@shared/schema";
import { fromError } from "zod-validation-error";

function normalizeDriveUrl(url: string): string {
  if (!url || !url.includes("drive.google.com")) return url;
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const normalized = `https://drive.google.com/uc?export=view&id=${match[1]}`;
      console.log("[image] normalized drive url", {
        originalUrl: url,
        normalizedUrl: normalized,
      });
      return normalized;
    }
  }
  console.error("[image] failed to normalize drive url", { url });
  return url;
}

const imageProxyAllowedHosts = new Set([
  "ibb.co",
  "www.ibb.co",
  "imgbb.com",
  "www.imgbb.com",
  "i.ibb.co",
]);

function extractOgImageFromHtml(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

async function resolveImageProxyTarget(rawUrl: string): Promise<string> {
  const parsed = new URL(rawUrl);
  const host = parsed.hostname.toLowerCase();

  if (host === "ibb.co" || host === "www.ibb.co" || host === "imgbb.com" || host === "www.imgbb.com") {
    const pageResponse = await fetch(rawUrl, { redirect: "follow" });
    if (!pageResponse.ok) {
      throw new Error(`Image page request failed with status ${pageResponse.status}`);
    }

    const pageHtml = await pageResponse.text();
    const ogImage = extractOgImageFromHtml(pageHtml);
    if (!ogImage) {
      throw new Error("Could not find og:image on the image page");
    }

    return ogImage;
  }

  return rawUrl;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = ensureUploadsDir();
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      console.log("[image-upload] accepted file", {
        route: req.originalUrl,
        originalName: file.originalname,
        mimeType: file.mimetype,
      });
      return cb(null, true);
    } else {
      console.error("[image-upload] rejected file", {
        route: req.originalUrl,
        originalName: file.originalname,
        mimeType: file.mimetype,
      });
      cb(new Error("Only image files are allowed"));
    }
  },
});

const volunteerUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = ensureUploadsDir();
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, "volunteer-" + uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      console.log("[volunteer-image-upload] accepted file", {
        route: req.originalUrl,
        originalName: file.originalname,
        mimeType: file.mimetype,
      });
      return cb(null, true);
    } else {
      console.error("[volunteer-image-upload] rejected file", {
        route: req.originalUrl,
        originalName: file.originalname,
        mimeType: file.mimetype,
      });
      cb(new Error("Only jpg, png, or webp images under 2MB are allowed"));
    }
  },
});

declare module "express-session" {
  interface SessionData {
    userId?: string;
    role?: "admin" | "chapter" | "barangay";
    chapterId?: string;
    barangayId?: string;
    barangayName?: string;
  }
}

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function requireAdminAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId || req.session.role !== "admin") {
    return res.status(401).json({ error: "Admin access required" });
  }
  next();
}

function requireChapterAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId || req.session.role !== "chapter") {
    return res.status(401).json({ error: "Chapter access required" });
  }
  next();
}

function requireBarangayAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId || req.session.role !== "barangay") {
    return res.status(401).json({ error: "Barangay access required" });
  }
  next();
}

function requireChapterOrBarangayAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId || (req.session.role !== "chapter" && req.session.role !== "barangay")) {
    return res.status(401).json({ error: "Chapter or Barangay access required" });
  }
  next();
}

const PUBLIC_SITE_PATHS = [
  "/",
  "/programs",
  "/publications",
  "/membership",
  "/volunteer",
  "/contact",
];

function normalizePublicSiteOrigin(rawUrl?: string) {
  if (!rawUrl || !rawUrl.trim()) {
    return "https://youthserviceph.org";
  }

  const trimmed = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    console.warn(`[startup] Invalid PUBLIC_SITE_URL \"${rawUrl}\". Falling back to https://youthserviceph.org`);
    return "https://youthserviceph.org";
  }
}

const NATIONAL_SITE_ORIGIN = normalizePublicSiteOrigin(process.env.PUBLIC_SITE_URL);
const NATIONAL_SITE_HOSTNAME = new URL(NATIONAL_SITE_ORIGIN).hostname.toLowerCase();
const INDEXABLE_HOSTS = new Set([
  NATIONAL_SITE_HOSTNAME,
  `www.${NATIONAL_SITE_HOSTNAME}`,
  "localhost",
  "127.0.0.1",
]);

function getRequestHostname(req: Request) {
  return (req.get("host") || "").split(":")[0].toLowerCase();
}

function shouldAllowIndexing(req: Request) {
  return INDEXABLE_HOSTS.has(getRequestHostname(req));
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api") && !shouldAllowIndexing(req)) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }
    next();
  });

  app.get("/robots.txt", (req, res) => {
    const origin = NATIONAL_SITE_ORIGIN;

    if (!shouldAllowIndexing(req)) {
      const robots = [
        "User-agent: *",
        "Disallow: /",
        `Sitemap: ${origin}/sitemap.xml`,
        "",
      ].join("\n");

      return res
        .type("text/plain")
        .set("Cache-Control", "public, max-age=3600")
        .send(robots);
    }

    const robots = [
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /chapter-dashboard",
      "Disallow: /barangay-dashboard",
      "Disallow: /login",
      `Sitemap: ${origin}/sitemap.xml`,
      "",
    ].join("\n");

    res
      .type("text/plain")
      .set("Cache-Control", "public, max-age=3600")
      .send(robots);
  });

  app.get("/sitemap.xml", (req, res) => {
    const origin = NATIONAL_SITE_ORIGIN;
    const lastModified = new Date().toISOString();
    const urlEntries = PUBLIC_SITE_PATHS.map((sitePath) => {
      const loc = `${origin}${sitePath}`;
      return [
        "  <url>",
        `    <loc>${loc}</loc>`,
        `    <lastmod>${lastModified}</lastmod>`,
        "    <changefreq>weekly</changefreq>",
        "    <priority>0.8</priority>",
        "  </url>",
      ].join("\n");
    }).join("\n");

    const sitemap = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urlEntries,
      "</urlset>",
      "",
    ].join("\n");

    res
      .type("application/xml")
      .set("Cache-Control", "public, max-age=3600")
      .send(sitemap);
  });

  app.get("/api/image-proxy", async (req, res) => {
    try {
      const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
      if (!rawUrl) {
        return res.status(400).json({ error: "url query parameter is required" });
      }

      const parsed = new URL(rawUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return res.status(400).json({ error: "Only http/https URLs are supported" });
      }

      const host = parsed.hostname.toLowerCase();
      if (!imageProxyAllowedHosts.has(host)) {
        return res.status(403).json({ error: "Host is not allowed for image proxy" });
      }

      const resolvedUrl = await resolveImageProxyTarget(rawUrl);
      console.log("[image-proxy] resolved", { rawUrl, resolvedUrl });

      const imageResponse = await fetch(resolvedUrl, { redirect: "follow" });
      if (!imageResponse.ok) {
        return res.status(imageResponse.status).json({ error: "Failed to fetch image" });
      }

      const contentType = imageResponse.headers.get("content-type") || "application/octet-stream";
      if (!contentType.startsWith("image/")) {
        console.error("[image-proxy] resolved URL did not return an image", {
          rawUrl,
          resolvedUrl,
          contentType,
        });
        return res.status(502).json({ error: "Resolved URL did not return an image" });
      }

      const cacheHeader = imageResponse.headers.get("cache-control") || "public, max-age=3600";
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", cacheHeader);
      res.send(imageBuffer);
    } catch (error: any) {
      console.error("[image-proxy] request failed", {
        url: req.query.url,
        message: error?.message,
      });
      res.status(502).json({ error: "Failed to resolve image URL" });
    }
  });
  
  app.post("/api/auth/login/admin", async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = await storage.getAdminUserByUsername(username);
    
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    req.session.userId = user.id;
    req.session.role = "admin";
    
    req.session.save((err) => {
      if (err) {
        console.error("[Auth] Session save error:", err);
        return res.status(500).json({ error: "Failed to save session" });
      }
      res.json({ success: true, user: { id: user.id, username: user.username, role: "admin" } });
    });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const normalizedUsername = username.trim();

    const admin = await storage.getAdminUserByUsername(normalizedUsername);
    if (admin) {
      const adminPasswordMatch = await bcrypt.compare(password, admin.password);
      if (adminPasswordMatch) {
        req.session.userId = admin.id;
        req.session.role = "admin";
        req.session.chapterId = undefined;
        req.session.barangayId = undefined;
        req.session.barangayName = undefined;

        return req.session.save((err) => {
          if (err) {
            console.error("[Auth] Session save error:", err);
            return res.status(500).json({ error: "Failed to save session" });
          }
          res.json({ success: true, user: { id: admin.id, username: admin.username, role: "admin" } });
        });
      }
    }

    const chapterUser = await storage.getChapterUserByUsername(normalizedUsername);
    if (chapterUser) {
      if (!chapterUser.isActive) {
        return res.status(401).json({ error: "Account is disabled" });
      }

      if (chapterUser.lockedUntil && new Date(chapterUser.lockedUntil) > new Date()) {
        const minutesLeft = Math.ceil((new Date(chapterUser.lockedUntil).getTime() - Date.now()) / 60000);
        return res.status(423).json({ error: `Account is locked. Try again in ${minutesLeft} minute(s).` });
      }

      const chapterPasswordMatch = await bcrypt.compare(password, chapterUser.password);
      if (!chapterPasswordMatch) {
        const attempts = (chapterUser.failedLoginAttempts || 0) + 1;
        const updateData: any = { failedLoginAttempts: attempts };
        if (attempts >= 3) {
          updateData.lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
          console.log("[Auth] Chapter account locked due to 3 failed attempts:", chapterUser.username);
        }
        await storage.updateChapterUser(chapterUser.id, updateData);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      await storage.updateChapterUser(chapterUser.id, { failedLoginAttempts: 0, lockedUntil: null } as any);
      const chapter = await storage.getChapter(chapterUser.chapterId);

      req.session.userId = chapterUser.id;
      req.session.role = "chapter";
      req.session.chapterId = chapterUser.chapterId;
      req.session.barangayId = undefined;
      req.session.barangayName = undefined;

      return req.session.save((err) => {
        if (err) {
          console.error("[Auth] Session save error:", err);
          return res.status(500).json({ error: "Failed to save session" });
        }
        res.json({
          success: true,
          user: {
            id: chapterUser.id,
            username: chapterUser.username,
            role: "chapter",
            chapterId: chapterUser.chapterId,
            chapterName: chapter?.name || "",
            mustChangePassword: chapterUser.mustChangePassword,
          },
        });
      });
    }

    const barangayUser = await storage.getBarangayUserByUsername(normalizedUsername);
    if (barangayUser) {
      if (!barangayUser.isActive) {
        return res.status(401).json({ error: "Account is inactive" });
      }

      if (barangayUser.lockedUntil && new Date(barangayUser.lockedUntil) > new Date()) {
        const minutesLeft = Math.ceil((new Date(barangayUser.lockedUntil).getTime() - Date.now()) / 60000);
        return res.status(423).json({ error: `Account is locked. Try again in ${minutesLeft} minute(s).` });
      }

      const barangayPasswordMatch = await bcrypt.compare(password, barangayUser.password);
      if (!barangayPasswordMatch) {
        const attempts = (barangayUser.failedLoginAttempts || 0) + 1;
        const updateData: any = { failedLoginAttempts: attempts };
        if (attempts >= 3) {
          updateData.lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
          console.log("[Auth] Barangay account locked due to 3 failed attempts:", barangayUser.username);
        }
        await storage.updateBarangayUser(barangayUser.id, updateData);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      await storage.updateBarangayUser(barangayUser.id, { failedLoginAttempts: 0, lockedUntil: null } as any);
      const chapter = await storage.getChapter(barangayUser.chapterId);

      req.session.userId = barangayUser.id;
      req.session.role = "barangay";
      req.session.chapterId = barangayUser.chapterId;
      req.session.barangayId = barangayUser.id;
      req.session.barangayName = barangayUser.barangayName;

      return req.session.save((err) => {
        if (err) {
          console.error("[Auth] Session save error:", err);
          return res.status(500).json({ error: "Failed to save session" });
        }
        res.json({
          success: true,
          user: {
            id: barangayUser.id,
            username: barangayUser.username,
            role: "barangay",
            chapterId: barangayUser.chapterId,
            chapterName: chapter?.name || "",
            barangayName: barangayUser.barangayName,
            mustChangePassword: barangayUser.mustChangePassword,
          },
        });
      });
    }

    return res.status(401).json({ error: "Invalid credentials" });
  });

  app.post("/api/auth/login/chapter", async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const normalizedUsername = username.trim();
    const user = await storage.getChapterUserByUsername(normalizedUsername);
    
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: "Account is disabled" });
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
      return res.status(423).json({ error: `Account is locked. Try again in ${minutesLeft} minute(s).` });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const updateData: any = { failedLoginAttempts: attempts };
      if (attempts >= 3) {
        updateData.lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
        console.log("[Auth] Chapter account locked due to 3 failed attempts:", user.username);
      }
      await storage.updateChapterUser(user.id, updateData);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    await storage.updateChapterUser(user.id, { failedLoginAttempts: 0, lockedUntil: null } as any);

    const chapter = await storage.getChapter(user.chapterId);

    req.session.userId = user.id;
    req.session.role = "chapter";
    req.session.chapterId = user.chapterId;
    
    req.session.save((err) => {
      if (err) {
        console.error("[Auth] Session save error:", err);
        return res.status(500).json({ error: "Failed to save session" });
      }
      res.json({ 
        success: true, 
        user: { 
          id: user.id, 
          username: user.username, 
          role: "chapter",
          chapterId: user.chapterId,
          chapterName: chapter?.name || "",
          mustChangePassword: user.mustChangePassword
        } 
      });
    });
  });

  app.post("/api/auth/login/barangay", async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const normalizedUsername = username.trim();
    const user = await storage.getBarangayUserByUsername(normalizedUsername);
    
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: "Account is inactive" });
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
      return res.status(423).json({ error: `Account is locked. Try again in ${minutesLeft} minute(s).` });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const updateData: any = { failedLoginAttempts: attempts };
      if (attempts >= 3) {
        updateData.lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
        console.log("[Auth] Barangay account locked due to 3 failed attempts:", user.username);
      }
      await storage.updateBarangayUser(user.id, updateData);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    await storage.updateBarangayUser(user.id, { failedLoginAttempts: 0, lockedUntil: null } as any);

    const chapter = await storage.getChapter(user.chapterId);

    req.session.userId = user.id;
    req.session.role = "barangay";
    req.session.chapterId = user.chapterId;
    req.session.barangayId = user.id;
    req.session.barangayName = user.barangayName;
    
    req.session.save((err) => {
      if (err) {
        console.error("[Auth] Session save error:", err);
        return res.status(500).json({ error: "Failed to save session" });
      }
      res.json({ 
        success: true, 
        user: { 
          id: user.id, 
          username: user.username, 
          role: "barangay",
          chapterId: user.chapterId,
          chapterName: chapter?.name || "",
          barangayName: user.barangayName,
          mustChangePassword: user.mustChangePassword
        } 
      });
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/check", async (req, res) => {
    if (!req.session.userId) {
      return res.json({ authenticated: false });
    }
    
    if (req.session.role === "admin") {
      const user = await storage.getAdminUser(req.session.userId);
      if (!user) {
        return res.json({ authenticated: false });
      }
      return res.json({ 
        authenticated: true, 
        user: { id: user.id, username: user.username, role: "admin" } 
      });
    }

    if (req.session.role === "chapter") {
      const user = await storage.getChapterUser(req.session.userId);
      if (!user) {
        return res.json({ authenticated: false });
      }
      const chapter = await storage.getChapter(user.chapterId);
      return res.json({ 
        authenticated: true, 
        user: { 
          id: user.id, 
          username: user.username, 
          role: "chapter",
          chapterId: user.chapterId,
          chapterName: chapter?.name || "",
          mustChangePassword: user.mustChangePassword
        } 
      });
    }

    if (req.session.role === "barangay") {
      const user = await storage.getBarangayUser(req.session.userId);
      if (!user) {
        return res.json({ authenticated: false });
      }
      const chapter = await storage.getChapter(user.chapterId);
      return res.json({ 
        authenticated: true, 
        user: { 
          id: user.id, 
          username: user.username, 
          role: "barangay",
          chapterId: user.chapterId,
          chapterName: chapter?.name || "",
          barangayId: user.id,
          barangayName: user.barangayName,
          mustChangePassword: user.mustChangePassword
        } 
      });
    }

    res.json({ authenticated: false });
  });

  app.post("/api/auth/change-password", requireChapterOrBarangayAuth, async (req, res) => {
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const now = new Date();
    
    let updated;
    if (req.session.role === "barangay") {
      updated = await storage.updateBarangayUser(req.session.userId!, {
        password: hashedPassword,
        mustChangePassword: false,
        passwordChangedAt: now
      } as any);
    } else {
      updated = await storage.updateChapterUser(req.session.userId!, {
        password: hashedPassword,
        mustChangePassword: false,
        passwordChangedAt: now
      } as any);
    }

    if (!updated) {
      console.log("[Auth] Change password failed for user:", req.session.userId);
      return res.status(500).json({ error: "Failed to update password" });
    }

    console.log("[Auth] Password updated for user:", req.session.userId, "role:", req.session.role);
    res.json({ success: true, message: "Password Updated Successfully." });
  });

  app.get("/api/programs", async (req, res) => {
    const programs = await storage.getPrograms();
    res.json(programs);
  });

  app.get("/api/programs/:id", async (req, res) => {
    const program = await storage.getProgram(req.params.id);
    if (!program) {
      return res.status(404).json({ error: "Program not found" });
    }
    res.json(program);
  });

  app.post("/api/programs", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertProgramSchema.parse(req.body);
      if (validated.image) {
        validated.image = normalizeDriveUrl(validated.image);
      }
      const program = await storage.createProgram(validated);
      res.json(program);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/programs/:id", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertProgramSchema.partial().parse(req.body);
      if (validated.image) {
        validated.image = normalizeDriveUrl(validated.image);
      }
      const program = await storage.updateProgram(req.params.id, validated);
      if (!program) {
        return res.status(404).json({ error: "Program not found" });
      }
      res.json(program);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/programs/:id", requireAdminAuth, async (req, res) => {
    const deleted = await storage.deleteProgram(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Program not found" });
    }
    res.json({ success: true });
  });

  app.get("/api/chapters", async (req, res) => {
    const chapters = await storage.getChapters();
    res.json(chapters);
  });

  app.get("/api/chapters/:id", async (req, res) => {
    const chapter = await storage.getChapter(req.params.id);
    if (!chapter) {
      return res.status(404).json({ error: "Chapter not found" });
    }
    res.json(chapter);
  });

  app.get("/api/chapters/:id/barangays", async (req, res) => {
    const barangays = await storage.getBarangayUsersByChapterId(req.params.id);
    res.json(barangays.filter(b => b.isActive).map(b => ({ 
      id: b.id, 
      barangayName: b.barangayName,
      chapterId: b.chapterId 
    })));
  });

  app.post("/api/chapters", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertChapterSchema.parse(req.body);
      const chapter = await storage.createChapter(validated);
      res.json(chapter);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/chapters/:id", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertChapterSchema.partial().parse(req.body);
      const chapter = await storage.updateChapter(req.params.id, validated);
      if (!chapter) {
        return res.status(404).json({ error: "Chapter not found" });
      }
      res.json(chapter);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/chapters/:id", requireAdminAuth, async (req, res) => {
    try {
      // Check for dependent records before attempting delete
      const members = await storage.getMembersByChapter(req.params.id);
      const officers = await storage.getChapterOfficers(req.params.id);
      const chapterUsers = await storage.getChapterUsersByChapterId(req.params.id);
      const barangayUsers = await storage.getBarangayUsersByChapterId(req.params.id);
      
      const dependentCounts = [];
      if (members.length > 0) dependentCounts.push(`${members.length} member(s)`);
      if (officers.length > 0) dependentCounts.push(`${officers.length} officer(s)`);
      if (chapterUsers.length > 0) dependentCounts.push(`${chapterUsers.length} chapter account(s)`);
      if (barangayUsers.length > 0) dependentCounts.push(`${barangayUsers.length} barangay account(s)`);
      
      if (dependentCounts.length > 0) {
        return res.status(400).json({ 
          error: `Cannot delete chapter: has ${dependentCounts.join(", ")}. Please remove these records first.` 
        });
      }
      
      const deleted = await storage.deleteChapter(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Chapter not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete chapter error:", error);
      if (error.code === '23503') {
        return res.status(400).json({ error: "Cannot delete chapter: it has dependent records. Please remove related data first." });
      }
      res.status(500).json({ error: "Failed to delete chapter" });
    }
  });

  app.get("/api/chapters/:id/users", requireAdminAuth, async (req, res) => {
    const users = await storage.getChapterUsersByChapterId(req.params.id);
    res.json(users.map(u => ({ ...u, password: undefined })));
  });

  app.get("/api/all-accounts", requireAdminAuth, async (req, res) => {
    const allChapterUsers = await storage.getAllChapterUsers();
    const allBarangayUsers = await storage.getBarangayUsers();
    const chapters = await storage.getChapters();
    const chapterMap = new Map(chapters.map(c => [c.id, c.name]));

    const accounts = [
      ...allChapterUsers.map(u => ({
        id: u.id,
        accountName: chapterMap.get(u.chapterId) || "Unknown Chapter",
        accountType: "Chapter" as const,
        username: u.username,
        isActive: u.isActive,
        mustChangePassword: u.mustChangePassword,
        failedLoginAttempts: u.failedLoginAttempts || 0,
        lockedUntil: u.lockedUntil,
        passwordChangedAt: u.passwordChangedAt,
        createdAt: u.createdAt,
      })),
      ...allBarangayUsers.map(u => ({
        id: u.id,
        accountName: `${u.barangayName} (${chapterMap.get(u.chapterId) || "Unknown"})`,
        accountType: "Barangay" as const,
        username: u.username,
        isActive: u.isActive,
        mustChangePassword: u.mustChangePassword,
        failedLoginAttempts: u.failedLoginAttempts || 0,
        lockedUntil: u.lockedUntil,
        passwordChangedAt: u.passwordChangedAt,
        createdAt: u.createdAt,
      })),
    ];

    res.json(accounts);
  });

  app.post("/api/reset-password/:accountType/:id", requireAdminAuth, async (req, res) => {
    const { accountType, id } = req.params;
    const tempPassword = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 4).toUpperCase();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    let updated;
    if (accountType === "chapter") {
      updated = await storage.updateChapterUser(id, {
        password: hashedPassword,
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null
      } as any);
    } else if (accountType === "barangay") {
      updated = await storage.updateBarangayUser(id, {
        password: hashedPassword,
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null
      } as any);
    }

    if (!updated) {
      return res.status(404).json({ error: "Account not found" });
    }

    console.log("[Auth] Admin reset password for", accountType, "account:", id);
    res.json({ success: true, temporaryPassword: tempPassword });
  });

  app.post("/api/unlock-account/:accountType/:id", requireAdminAuth, async (req, res) => {
    const { accountType, id } = req.params;

    let updated;
    if (accountType === "chapter") {
      updated = await storage.updateChapterUser(id, { failedLoginAttempts: 0, lockedUntil: null } as any);
    } else if (accountType === "barangay") {
      updated = await storage.updateBarangayUser(id, { failedLoginAttempts: 0, lockedUntil: null } as any);
    }

    if (!updated) {
      return res.status(404).json({ error: "Account not found" });
    }

    res.json({ success: true });
  });

  app.post("/api/chapter-users", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertChapterUserSchema.parse(req.body);
      const hashedPassword = await bcrypt.hash(validated.password, 10);
      const user = await storage.createChapterUser({ ...validated, password: hashedPassword });
      res.json({ ...user, password: undefined });
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(400).json({ error: "Username already exists" });
      }
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/chapter-users/:id", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertChapterUserSchema.partial().parse(req.body);
      let updateData = validated;
      if (validated.password) {
        const hashedPassword = await bcrypt.hash(validated.password, 10);
        updateData = { ...validated, password: hashedPassword };
      }
      const user = await storage.updateChapterUser(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ ...user, password: undefined });
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/chapter-users/:id", requireAdminAuth, async (req, res) => {
    const deleted = await storage.deleteChapterUser(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true });
  });

  // Barangay user management routes
  app.get("/api/barangay-users", requireAdminAuth, async (req, res) => {
    const { chapterId } = req.query;
    let users;
    if (chapterId) {
      users = await storage.getBarangayUsersByChapterId(chapterId as string);
    } else {
      users = await storage.getBarangayUsers();
    }
    res.json(users.map(u => ({ ...u, password: undefined })));
  });

  app.get("/api/chapters/:id/barangay-users", requireAdminAuth, async (req, res) => {
    const users = await storage.getBarangayUsersByChapterId(req.params.id);
    res.json(users.map(u => ({ ...u, password: undefined })));
  });

  app.post("/api/barangay-users", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertBarangayUserSchema.parse(req.body);
      const user = await storage.createBarangayUser(validated);
      res.json({ ...user, password: undefined });
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(400).json({ error: "Username already exists" });
      }
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/barangay-users/:id", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertBarangayUserSchema.partial().parse(req.body);
      if (validated.password) {
        validated.password = await bcrypt.hash(validated.password, 10);
      }
      const user = await storage.updateBarangayUser(req.params.id, validated);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ ...user, password: undefined });
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/barangay-users/:id", requireAdminAuth, async (req, res) => {
    const deleted = await storage.deleteBarangayUser(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true });
  });

  // Member totals and birthdays endpoints
  app.get("/api/member-totals", requireAdminAuth, async (req, res) => {
    const { chapterId, barangayId } = req.query;
    const total = await storage.getMemberTotals(
      chapterId as string | undefined, 
      barangayId as string | undefined
    );
    res.json({ total });
  });

  app.get("/api/birthdays-today", requireAdminAuth, async (req, res) => {
    const result = await storage.getBirthdaysToday();
    res.json(result);
  });

  app.get("/api/volunteer-opportunities", async (req, res) => {
    const opportunities = await storage.getVolunteerOpportunities();
    res.json(opportunities);
  });

  app.get("/api/volunteer-opportunities/:id", async (req, res) => {
    const opportunity = await storage.getVolunteerOpportunity(req.params.id);
    if (!opportunity) {
      return res.status(404).json({ error: "Volunteer opportunity not found" });
    }
    res.json(opportunity);
  });

  app.post("/api/volunteer-opportunities", requireAdminAuth, volunteerUpload.single("photo"), async (req, res) => {
    try {
      const photoUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
      console.log("[volunteer-image-upload] admin create", {
        route: req.originalUrl,
        hasFile: Boolean(req.file),
        photoUrl,
      });
      const validated = insertVolunteerOpportunitySchema.parse({
        ...req.body,
        photoUrl
      });
      const opportunity = await storage.createVolunteerOpportunity(validated);
      res.json(opportunity);
    } catch (error: any) {
      console.error("[volunteer-image-upload] admin create failed", {
        route: req.originalUrl,
        message: error?.message,
      });
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/volunteer-opportunities/:id", requireAdminAuth, volunteerUpload.single("photo"), async (req, res) => {
    try {
      const photoUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
      console.log("[volunteer-image-upload] admin update", {
        route: req.originalUrl,
        hasFile: Boolean(req.file),
        photoUrl,
      });
      const updateData = { ...req.body };
      if (photoUrl) {
        updateData.photoUrl = photoUrl;
      }
      const validated = insertVolunteerOpportunitySchema.partial().parse(updateData);
      const opportunity = await storage.updateVolunteerOpportunity(req.params.id, validated);
      if (!opportunity) {
        return res.status(404).json({ error: "Volunteer opportunity not found" });
      }
      res.json(opportunity);
    } catch (error: any) {
      console.error("[volunteer-image-upload] admin update failed", {
        route: req.originalUrl,
        message: error?.message,
      });
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/volunteer-opportunities/:id", requireAdminAuth, async (req, res) => {
    const deleted = await storage.deleteVolunteerOpportunity(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Volunteer opportunity not found" });
    }
    res.json({ success: true });
  });

  app.get("/api/stats", async (req, res) => {
    const stats = await storage.getStats();
    res.json(stats);
  });

  app.put("/api/stats", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertStatsSchema.parse(req.body);
      const stats = await storage.updateStats(validated);
      res.json(stats);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.get("/api/contact-info", async (req, res) => {
    const info = await storage.getContactInfo();
    res.json(info);
  });

  app.put("/api/contact-info", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertContactInfoSchema.parse(req.body);
      const info = await storage.updateContactInfo(validated);
      res.json(info);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.post("/api/upload", requireAuth, upload.single("image"), (req, res) => {
    if (!req.file) {
      console.error("[image-upload] no file received", { route: req.originalUrl });
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    const imageUrl = `/uploads/${req.file.filename}`;
    console.log("[image-upload] upload success", {
      route: req.originalUrl,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      imageUrl,
    });
    res.json({ url: imageUrl });
  });

  app.get("/api/publications", async (req, res) => {
    const chapterId = req.query.chapterId as string | undefined;
    const publications = chapterId 
      ? await storage.getPublicationsByChapter(chapterId)
      : await storage.getPublications();
    res.json(publications);
  });

  app.get("/api/publications/:id", async (req, res) => {
    const publication = await storage.getPublication(req.params.id);
    if (!publication) {
      return res.status(404).json({ error: "Publication not found" });
    }
    res.json(publication);
  });

  app.post("/api/publications", requireAdminAuth, async (req, res) => {
    try {
      const payload: Record<string, unknown> = { ...req.body };
      const incomingPhotoUrl =
        typeof payload.photoUrl === "string"
          ? payload.photoUrl
          : typeof payload.imageUrl === "string"
            ? payload.imageUrl
            : undefined;

      if (incomingPhotoUrl !== undefined) {
        const trimmed = incomingPhotoUrl.trim();
        payload.photoUrl = trimmed ? normalizeDriveUrl(trimmed) : null;
      }

      delete payload.imageUrl;

      const validated = insertPublicationSchema.parse(payload);
      const publication = await storage.createPublication(validated);
      res.json(publication);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/publications/:id", requireAdminAuth, async (req, res) => {
    try {
      const payload: Record<string, unknown> = { ...req.body };
      const incomingPhotoUrl =
        typeof payload.photoUrl === "string"
          ? payload.photoUrl
          : typeof payload.imageUrl === "string"
            ? payload.imageUrl
            : undefined;

      if (incomingPhotoUrl !== undefined) {
        const trimmed = incomingPhotoUrl.trim();
        payload.photoUrl = trimmed ? normalizeDriveUrl(trimmed) : null;
      }

      delete payload.imageUrl;

      const validated = insertPublicationSchema.partial().parse(payload);
      const publication = await storage.updatePublication(req.params.id, validated);
      if (!publication) {
        return res.status(404).json({ error: "Publication not found" });
      }
      res.json(publication);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/publications/:id", requireAdminAuth, async (req, res) => {
    const deleted = await storage.deletePublication(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Publication not found" });
    }
    res.json({ success: true });
  });

  app.get("/api/project-reports", requireAuth, async (req, res) => {
    const chapterId = req.query.chapterId as string | undefined;
    const reports = chapterId 
      ? await storage.getProjectReportsByChapter(chapterId)
      : await storage.getProjectReports();
    res.json(reports);
  });

  app.get("/api/project-reports/:id", requireAuth, async (req, res) => {
    const report = await storage.getProjectReport(req.params.id);
    if (!report) {
      return res.status(404).json({ error: "Project report not found" });
    }
    res.json(report);
  });

  app.post("/api/project-reports", requireChapterAuth, async (req, res) => {
    try {
      const chapterId = req.session.chapterId!;
      const validated = insertProjectReportSchema.parse({
        ...req.body,
        chapterId
      });
      
      const report = await storage.createProjectReport(validated);
      
      const chapter = await storage.getChapter(chapterId);
      await storage.createPublication({
        chapterId,
        sourceProjectReportId: report.id,
        title: report.projectName,
        content: report.projectWriteup,
        photoUrl: report.photoUrl,
        facebookLink: report.facebookPostLink
      });
      
      res.json(report);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.get("/api/chapter-kpis", requireAuth, async (req, res) => {
    const chapterId = req.query.chapterId as string;
    if (!chapterId) {
      return res.status(400).json({ error: "chapterId required" });
    }
    const kpis = await storage.getChapterKpis(chapterId);
    res.json(kpis);
  });

  app.get("/api/chapter-kpis/:chapterId/:year", requireAuth, async (req, res) => {
    const kpi = await storage.getChapterKpiByYear(req.params.chapterId, parseInt(req.params.year));
    if (!kpi) {
      return res.status(404).json({ error: "KPI not found" });
    }
    res.json(kpi);
  });

  app.post("/api/chapter-kpis", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertChapterKpiSchema.parse(req.body);
      
      const existing = await storage.getChapterKpiByYear(validated.chapterId, validated.year);
      if (existing) {
        const updated = await storage.updateChapterKpi(existing.id, validated);
        return res.json(updated);
      }
      
      const kpi = await storage.createChapterKpi(validated);
      res.json(kpi);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/chapter-kpis/:id", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertChapterKpiSchema.partial().parse(req.body);
      const kpi = await storage.updateChapterKpi(req.params.id, validated);
      if (!kpi) {
        return res.status(404).json({ error: "KPI not found" });
      }
      res.json(kpi);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.get("/api/leaderboard", async (req, res) => {
    const timeframe = req.query.timeframe as string | undefined;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const quarter = req.query.quarter ? parseInt(req.query.quarter as string) : undefined;
    const leaderboard = await storage.getLeaderboard(timeframe, year, quarter);
    res.json(leaderboard);
  });

  app.get("/api/barangay-leaderboard", requireChapterOrBarangayAuth, async (req, res) => {
    const userChapterId = req.session.chapterId;
    if (!userChapterId) {
      return res.status(400).json({ error: "Chapter ID not found in session" });
    }
    const leaderboard = await storage.getBarangayLeaderboard(userChapterId);
    res.json(leaderboard);
  });

  app.get("/api/members", requireAuth, async (req, res) => {
    const chapterId = req.query.chapterId as string | undefined;
    const barangayId = req.query.barangayId as string | undefined;
    
    if (req.session.role === "admin") {
      const members = chapterId && chapterId !== "all"
        ? await storage.getMembersByChapter(chapterId)
        : await storage.getMembers();
      res.json(members);
    } else if (req.session.role === "chapter") {
      const members = await storage.getMembersByChapter(req.session.chapterId!);
      res.json(members);
    } else if (req.session.role === "barangay") {
      const members = await storage.getMembersByBarangay(req.session.barangayId!);
      res.json(members);
    } else {
      res.status(403).json({ error: "Access denied" });
    }
  });

  app.get("/api/household-summary", requireAdminAuth, async (req, res) => {
    const summary = await storage.getHouseholdSummary();
    res.json(summary);
  });

  app.post("/api/members", async (req, res) => {
    try {
      const memberData = {
        ...req.body,
        isActive: req.body.isActive ?? false
      };
      const validated = insertMemberSchema.parse(memberData);
      const member = await storage.createMember(validated);
      res.json(member);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.patch("/api/members/:id", requireAuth, async (req, res) => {
    try {
      const member = await storage.getMember(req.params.id);
      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }
      
      if (req.session.role === "chapter" && member.chapterId !== req.session.chapterId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const allowedFields = ["isActive", "registeredVoter", "fullName", "age", "contactNumber", "facebookLink", "chapterId"];
      const updateData: Record<string, any> = {};
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }
      
      const updated = await storage.updateMember(req.params.id, updateData);
      res.json(updated);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/members/:id", requireAdminAuth, async (req, res) => {
    const deleted = await storage.deleteMember(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Member not found" });
    }
    res.json({ success: true });
  });

  app.get("/api/officers", requireAdminAuth, async (req, res) => {
    const officers = await storage.getAllOfficers();
    res.json(officers);
  });

  app.get("/api/chapter-officers", requireAuth, async (req, res) => {
    const chapterId = req.query.chapterId as string;
    const barangayId = req.query.barangayId as string | undefined;
    const level = req.query.level as string | undefined;
    
    if (!chapterId) {
      return res.status(400).json({ error: "chapterId required" });
    }
    
    if (barangayId && level === "barangay") {
      const officers = await storage.getOfficersByBarangay(barangayId);
      res.json(officers);
    } else {
      const officers = await storage.getChapterOfficers(chapterId);
      res.json(officers);
    }
  });

  app.post("/api/chapter-officers", requireChapterOrBarangayAuth, async (req, res) => {
    try {
      const chapterId = req.session.chapterId!;
      const barangayId = req.session.role === "barangay" ? req.session.barangayId : req.body.barangayId;
      const level = req.session.role === "barangay" ? "barangay" : (req.body.level || "chapter");
      
      const validated = insertChapterOfficerSchema.parse({
        ...req.body,
        chapterId,
        barangayId: barangayId || null,
        level
      });
      const officer = await storage.createChapterOfficer(validated);
      res.json(officer);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/chapter-officers/:id", requireChapterOrBarangayAuth, async (req, res) => {
    try {
      const validated = insertChapterOfficerSchema.partial().parse(req.body);
      const officer = await storage.updateChapterOfficer(req.params.id, validated);
      if (!officer) {
        return res.status(404).json({ error: "Officer not found" });
      }
      res.json(officer);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/chapter-officers/:id", requireChapterOrBarangayAuth, async (req, res) => {
    const deleted = await storage.deleteChapterOfficer(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Officer not found" });
    }
    res.json({ success: true });
  });

  app.get("/api/kpi-templates", requireAuth, async (req, res) => {
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const quarter = req.query.quarter ? parseInt(req.query.quarter as string) : undefined;
    const barangayScope = req.query.barangayScope === "true";
    const barangayId = req.query.barangayId as string | undefined;
    const chapterId = req.query.chapterId as string | undefined;
    const chapterScope = req.query.chapterScope === "true";
    
    if (barangayScope && barangayId) {
      const templates = await storage.getKpiTemplatesForBarangay(year, barangayId, chapterId, quarter);
      res.json(templates);
    } else if (chapterScope && chapterId) {
      const templates = await storage.getKpiTemplatesForChapter(year, chapterId, quarter);
      res.json(templates);
    } else {
      const templates = await storage.getKpiTemplates(year, quarter);
      res.json(templates);
    }
  });

  app.get("/api/kpi-templates/:id", requireAuth, async (req, res) => {
    const template = await storage.getKpiTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: "KPI template not found" });
    }
    res.json(template);
  });

  app.get("/api/kpi-templates/:id/scopes", requireAdminAuth, async (req, res) => {
    const scopes = await storage.getKpiScopesByTemplateId(req.params.id);
    res.json(scopes);
  });

  app.post("/api/kpi-templates", requireAdminAuth, async (req, res) => {
    try {
      const { selectedEntityIds, ...templateData } = req.body;
      const validated = insertKpiTemplateSchema.parse(templateData);
      const template = await storage.createKpiTemplate(validated);
      
      if (selectedEntityIds && selectedEntityIds.length > 0 && 
          (validated.scope === "selected_chapters" || validated.scope === "selected_barangays")) {
        const entityType = validated.scope === "selected_chapters" ? "chapter" : "barangay";
        const scopes = selectedEntityIds.map((entityId: string) => ({
          kpiTemplateId: template.id,
          entityType,
          entityId
        }));
        await storage.createKpiScopes(scopes);
      }
      
      res.json(template);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/kpi-templates/:id", requireAdminAuth, async (req, res) => {
    try {
      const { selectedEntityIds, ...templateData } = req.body;
      const validated = insertKpiTemplateSchema.partial().parse(templateData);
      const template = await storage.updateKpiTemplate(req.params.id, validated);
      if (!template) {
        return res.status(404).json({ error: "KPI template not found" });
      }
      
      if (validated.scope === "selected_chapters" || validated.scope === "selected_barangays") {
        await storage.deleteKpiScopesByTemplateId(req.params.id);
        if (selectedEntityIds && selectedEntityIds.length > 0) {
          const entityType = validated.scope === "selected_chapters" ? "chapter" : "barangay";
          const scopes = selectedEntityIds.map((entityId: string) => ({
            kpiTemplateId: template.id,
            entityType,
            entityId
          }));
          await storage.createKpiScopes(scopes);
        }
      } else if (validated.scope) {
        await storage.deleteKpiScopesByTemplateId(req.params.id);
      }
      
      res.json(template);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/kpi-templates/:id", requireAdminAuth, async (req, res) => {
    const deleted = await storage.deleteKpiTemplate(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "KPI template not found" });
    }
    res.json({ success: true });
  });

  app.get("/api/kpi-completions", requireAuth, async (req, res) => {
    const chapterId = req.query.chapterId as string;
    if (!chapterId) {
      return res.status(400).json({ error: "chapterId required" });
    }
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const quarter = req.query.quarter ? parseInt(req.query.quarter as string) : undefined;
    const completions = await storage.getKpiCompletions(chapterId, year, quarter);
    res.json(completions);
  });

  app.post("/api/kpi-completions", requireChapterAuth, async (req, res) => {
    try {
      const chapterId = req.session.chapterId!;
      const validated = insertKpiCompletionSchema.parse({
        ...req.body,
        chapterId
      });
      
      const existing = await storage.getKpiCompletionByTemplateAndChapter(validated.kpiTemplateId, chapterId);
      if (existing) {
        const updated = await storage.updateKpiCompletion(existing.id, validated);
        return res.json(updated);
      }
      
      const completion = await storage.createKpiCompletion(validated);
      res.json(completion);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/kpi-completions/:id", requireChapterAuth, async (req, res) => {
    try {
      const validated = insertKpiCompletionSchema.partial().parse(req.body);
      const completion = await storage.updateKpiCompletion(req.params.id, validated);
      if (!completion) {
        return res.status(404).json({ error: "KPI completion not found" });
      }
      res.json(completion);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.post("/api/kpi-completions/:id/mark-complete", requireChapterAuth, async (req, res) => {
    const completion = await storage.markKpiCompleted(req.params.id);
    if (!completion) {
      return res.status(404).json({ error: "KPI completion not found" });
    }
    res.json(completion);
  });

  app.put("/api/chapters/:id/social-media", requireChapterAuth, async (req, res) => {
    const chapterId = req.session.chapterId!;
    if (chapterId !== req.params.id) {
      return res.status(403).json({ error: "Cannot update another chapter's social media" });
    }
    
    try {
      const { facebookLink, instagramLink } = req.body;
      const chapter = await storage.updateChapter(req.params.id, { facebookLink, instagramLink });
      if (!chapter) {
        return res.status(404).json({ error: "Chapter not found" });
      }
      res.json(chapter);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/volunteer-opportunities/chapter", requireChapterAuth, volunteerUpload.single("photo"), async (req, res) => {
    try {
      const chapterId = req.session.chapterId!;
      const chapter = await storage.getChapter(chapterId);
      const photoUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
      console.log("[volunteer-image-upload] chapter create", {
        route: req.originalUrl,
        chapterId,
        hasFile: Boolean(req.file),
        photoUrl,
      });
      
      const validated = insertVolunteerOpportunitySchema.parse({
        ...req.body,
        chapterId,
        chapter: chapter?.name || "",
        sdgs: req.body.sdgs || "",
        photoUrl
      });
      const opportunity = await storage.createVolunteerOpportunity(validated);
      res.json(opportunity);
    } catch (error: any) {
      console.error("[volunteer-image-upload] chapter create failed", {
        route: req.originalUrl,
        message: error?.message,
      });
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.get("/api/volunteer-opportunities/by-chapter", requireAuth, async (req, res) => {
    const chapterId = req.query.chapterId as string;
    if (!chapterId) {
      return res.status(400).json({ error: "chapterId required" });
    }
    const opportunities = await storage.getVolunteerOpportunitiesByChapter(chapterId);
    res.json(opportunities);
  });

  app.get("/api/important-documents", requireAuth, async (req, res) => {
    const documents = await storage.getImportantDocuments();
    res.json(documents);
  });

  app.post("/api/important-documents", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertImportantDocumentSchema.parse(req.body);
      const document = await storage.createImportantDocument(validated);
      res.json(document);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.patch("/api/important-documents/:id", requireAdminAuth, async (req, res) => {
    try {
      const document = await storage.updateImportantDocument(req.params.id, req.body);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/important-documents/:id", requireAdminAuth, async (req, res) => {
    const deleted = await storage.deleteImportantDocument(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Document not found" });
    }
    res.json({ success: true });
  });

  app.get("/api/chapter-document-acks", requireChapterAuth, async (req, res) => {
    const chapterId = req.session.chapterId!;
    const acks = await storage.getChapterDocumentAcks(chapterId);
    res.json(acks);
  });

  app.post("/api/chapter-document-acks/:documentId/acknowledge", requireChapterAuth, async (req, res) => {
    const chapterId = req.session.chapterId!;
    const documentId = req.params.documentId;
    const ack = await storage.acknowledgeDocument(chapterId, documentId);
    res.json(ack);
  });

  app.get("/api/mou-submissions", requireAdminAuth, async (req, res) => {
    const submissions = await storage.getMouSubmissions();
    res.json(submissions);
  });

  app.get("/api/mou-submissions/my-submission", requireChapterAuth, async (req, res) => {
    const chapterId = req.session.chapterId!;
    const submission = await storage.getMouSubmissionByChapter(chapterId);
    res.json(submission || null);
  });

  app.post("/api/mou-submissions", requireChapterAuth, async (req, res) => {
    try {
      const chapterId = req.session.chapterId!;
      const validated = insertMouSubmissionSchema.parse({
        ...req.body,
        chapterId,
        driveFolderUrl: "https://drive.google.com/drive/folders/1eAi3sB1KBGZ9nKffbwJbGnaD6N7NIYkY?usp=sharing"
      });
      const submission = await storage.createMouSubmission(validated);
      res.json(submission);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.patch("/api/mou-submissions/:id", requireChapterAuth, async (req, res) => {
    try {
      const submission = await storage.updateMouSubmission(req.params.id, req.body);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }
      res.json(submission);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/chapter-requests", requireAdminAuth, async (req, res) => {
    const requests = await storage.getChapterRequests();
    res.json(requests);
  });

  app.get("/api/chapter-requests/my-requests", requireChapterAuth, async (req, res) => {
    const chapterId = req.session.chapterId!;
    const requests = await storage.getChapterRequestsByChapter(chapterId);
    res.json(requests);
  });

  app.post("/api/chapter-requests", requireChapterAuth, async (req, res) => {
    try {
      const chapterId = req.session.chapterId!;
      const validated = insertChapterRequestSchema.parse({
        ...req.body,
        chapterId,
        status: "new"
      });
      const request = await storage.createChapterRequest(validated);
      res.json(request);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.patch("/api/chapter-requests/:id", requireAdminAuth, async (req, res) => {
    try {
      const request = await storage.updateChapterRequest(req.params.id, req.body);
      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }
      res.json(request);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // National Request routes (messaging system)
  app.get("/api/national-requests", requireAdminAuth, async (req, res) => {
    const requests = await storage.getNationalRequests();
    res.json(requests);
  });

  app.get("/api/national-requests/my-requests", async (req, res) => {
    let senderType: string;
    let senderId: string;
    
    if (req.session.chapterId) {
      senderType = "chapter";
      senderId = req.session.chapterId;
    } else if (req.session.barangayId) {
      senderType = "barangay";
      senderId = req.session.barangayId;
    } else {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const requests = await storage.getNationalRequestsBySender(senderType, senderId);
    res.json(requests);
  });

  app.post("/api/national-requests", async (req, res) => {
    try {
      let senderType: string;
      let senderId: string;
      
      if (req.session.chapterId) {
        senderType = "chapter";
        senderId = req.session.chapterId;
      } else if (req.session.barangayId) {
        senderType = "barangay";
        senderId = req.session.barangayId;
      } else {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const validated = insertNationalRequestSchema.parse({
        ...req.body,
        senderType,
        senderId,
        dateNeeded: new Date(req.body.dateNeeded),
        status: "NEW"
      });
      const request = await storage.createNationalRequest(validated);
      res.json(request);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.patch("/api/national-requests/:id", requireAdminAuth, async (req, res) => {
    try {
      const updateData: any = { ...req.body };
      if (req.body.adminReply) {
        updateData.repliedAt = new Date();
        updateData.processedByAdminId = req.session.userId;
      }
      const request = await storage.updateNationalRequest(req.params.id, updateData);
      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }
      res.json(request);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  if (process.env.DATABASE_URL) {
    await storage.initializeDefaultData();
  } else if (process.env.NODE_ENV === "development") {
    console.warn(
      "[startup] DATABASE_URL is not set; skipping database initialization in development.",
    );
  }

  const httpServer = createServer(app);

  return httpServer;
}
