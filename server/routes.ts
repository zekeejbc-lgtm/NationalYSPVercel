import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import bcrypt from "bcryptjs";
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
  insertChapterRequestSchema
} from "@shared/schema";
import { fromError } from "zod-validation-error";

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, "client/public/uploads");
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
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const volunteerUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, "client/public/uploads");
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
      return cb(null, true);
    } else {
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

export async function registerRoutes(app: Express): Promise<Server> {
  
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

  app.post("/api/auth/login/chapter", async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = await storage.getChapterUserByUsername(username);
    
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: "Account is disabled" });
    }

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

    const user = await storage.getBarangayUserByUsername(username);
    
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: "Account is inactive" });
    }

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
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    let updated;
    if (req.session.role === "barangay") {
      updated = await storage.updateBarangayUser(req.session.userId!, {
        password: hashedPassword,
        mustChangePassword: false
      });
    } else {
      updated = await storage.updateChapterUser(req.session.userId!, {
        password: hashedPassword,
        mustChangePassword: false
      });
    }

    if (!updated) {
      return res.status(500).json({ error: "Failed to update password" });
    }

    res.json({ success: true });
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
    const deleted = await storage.deleteChapter(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Chapter not found" });
    }
    res.json({ success: true });
  });

  app.get("/api/chapters/:id/users", requireAdminAuth, async (req, res) => {
    const users = await storage.getChapterUsersByChapterId(req.params.id);
    res.json(users.map(u => ({ ...u, password: undefined })));
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
      const validated = insertVolunteerOpportunitySchema.parse({
        ...req.body,
        photoUrl
      });
      const opportunity = await storage.createVolunteerOpportunity(validated);
      res.json(opportunity);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/volunteer-opportunities/:id", requireAdminAuth, volunteerUpload.single("photo"), async (req, res) => {
    try {
      const photoUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
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
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    const imageUrl = `/uploads/${req.file.filename}`;
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
      const validated = insertPublicationSchema.parse(req.body);
      const publication = await storage.createPublication(validated);
      res.json(publication);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/publications/:id", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertPublicationSchema.partial().parse(req.body);
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
    
    if (barangayScope && barangayId) {
      const templates = await storage.getKpiTemplatesForBarangay(year, barangayId, chapterId);
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

  app.post("/api/kpi-templates", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertKpiTemplateSchema.parse(req.body);
      const template = await storage.createKpiTemplate(validated);
      res.json(template);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/kpi-templates/:id", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertKpiTemplateSchema.partial().parse(req.body);
      const template = await storage.updateKpiTemplate(req.params.id, validated);
      if (!template) {
        return res.status(404).json({ error: "KPI template not found" });
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

  await storage.initializeDefaultData();

  const httpServer = createServer(app);

  return httpServer;
}
