import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import { 
  insertProgramSchema,
  insertChapterSchema,
  insertVolunteerOpportunitySchema,
  insertStatsSchema,
  insertContactInfoSchema,
  insertPublicationSchema
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
  }
}

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = await storage.getUserByUsername(username);
    
    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    req.session.userId = user.id;
    res.json({ success: true, user: { id: user.id, username: user.username } });
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
    
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.json({ authenticated: false });
    }
    
    res.json({ 
      authenticated: true, 
      user: { id: user.id, username: user.username } 
    });
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

  app.post("/api/programs", requireAuth, async (req, res) => {
    try {
      const validated = insertProgramSchema.parse(req.body);
      const program = await storage.createProgram(validated);
      res.json(program);
    } catch (error: any) {
      const validationError = fromZodError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/programs/:id", requireAuth, async (req, res) => {
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

  app.delete("/api/programs/:id", requireAuth, async (req, res) => {
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

  app.post("/api/chapters", requireAuth, async (req, res) => {
    try {
      const validated = insertChapterSchema.parse(req.body);
      const chapter = await storage.createChapter(validated);
      res.json(chapter);
    } catch (error: any) {
      const validationError = fromZodError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/chapters/:id", requireAuth, async (req, res) => {
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

  app.delete("/api/chapters/:id", requireAuth, async (req, res) => {
    const deleted = await storage.deleteChapter(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Chapter not found" });
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

  app.post("/api/volunteer-opportunities", requireAuth, async (req, res) => {
    try {
      const validated = insertVolunteerOpportunitySchema.parse(req.body);
      const opportunity = await storage.createVolunteerOpportunity(validated);
      res.json(opportunity);
    } catch (error: any) {
      const validationError = fromZodError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/volunteer-opportunities/:id", requireAuth, async (req, res) => {
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

  app.delete("/api/volunteer-opportunities/:id", requireAuth, async (req, res) => {
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

  app.put("/api/stats", requireAuth, async (req, res) => {
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

  app.put("/api/contact-info", requireAuth, async (req, res) => {
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
    const publications = await storage.getPublications();
    res.json(publications);
  });

  app.get("/api/publications/:id", async (req, res) => {
    const publication = await storage.getPublication(req.params.id);
    if (!publication) {
      return res.status(404).json({ error: "Publication not found" });
    }
    res.json(publication);
  });

  app.post("/api/publications", requireAuth, async (req, res) => {
    try {
      const validated = insertPublicationSchema.parse(req.body);
      const publication = await storage.createPublication(validated);
      res.json(publication);
    } catch (error: any) {
      const validationError = fromZodError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/publications/:id", requireAuth, async (req, res) => {
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

  app.delete("/api/publications/:id", requireAuth, async (req, res) => {
    const deleted = await storage.deletePublication(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Publication not found" });
    }
    res.json({ success: true });
  });

  await storage.initializeDefaultData();

  const httpServer = createServer(app);

  return httpServer;
}
