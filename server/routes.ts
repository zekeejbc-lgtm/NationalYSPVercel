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
  insertChapterKpiSchema
} from "@shared/schema";
import { fromZodError } from "zod-validation-error";

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

declare module "express-session" {
  interface SessionData {
    userId?: string;
    role?: "admin" | "chapter";
    chapterId?: string;
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
    res.json({ success: true, user: { id: user.id, username: user.username, role: "admin" } });
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

    res.json({ authenticated: false });
  });

  app.post("/api/auth/change-password", requireChapterAuth, async (req, res) => {
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updated = await storage.updateChapterUser(req.session.userId!, {
      password: hashedPassword,
      mustChangePassword: false
    });

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
      const validationError = fromZodError(error);
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
      const validationError = fromZodError(error);
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
      const validationError = fromZodError(error);
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
      const validationError = fromZodError(error);
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
      const validationError = fromZodError(error);
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
      const validationError = fromZodError(error);
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

  app.post("/api/volunteer-opportunities", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertVolunteerOpportunitySchema.parse(req.body);
      const opportunity = await storage.createVolunteerOpportunity(validated);
      res.json(opportunity);
    } catch (error: any) {
      const validationError = fromZodError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/volunteer-opportunities/:id", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertVolunteerOpportunitySchema.partial().parse(req.body);
      const opportunity = await storage.updateVolunteerOpportunity(req.params.id, validated);
      if (!opportunity) {
        return res.status(404).json({ error: "Volunteer opportunity not found" });
      }
      res.json(opportunity);
    } catch (error: any) {
      const validationError = fromZodError(error);
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
      const validationError = fromZodError(error);
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
      const validationError = fromZodError(error);
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
      const validationError = fromZodError(error);
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
      const validationError = fromZodError(error);
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
      const validationError = fromZodError(error);
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
      const validationError = fromZodError(error);
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
      const validationError = fromZodError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.get("/api/leaderboard", async (req, res) => {
    const leaderboard = await storage.getLeaderboard();
    res.json(leaderboard);
  });

  await storage.initializeDefaultData();

  const httpServer = createServer(app);

  return httpServer;
}
