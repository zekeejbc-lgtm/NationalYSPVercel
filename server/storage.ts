import { 
  type User, 
  type InsertUser,
  type Program,
  type InsertProgram,
  type Chapter,
  type InsertChapter,
  type VolunteerOpportunity,
  type InsertVolunteerOpportunity,
  type Stats,
  type InsertStats,
  type ContactInfo,
  type InsertContactInfo,
  type Publication,
  type InsertPublication,
  users,
  programs,
  chapters,
  volunteerOpportunities,
  stats,
  contactInfo,
  publications
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getPrograms(): Promise<Program[]>;
  getProgram(id: string): Promise<Program | undefined>;
  createProgram(program: InsertProgram): Promise<Program>;
  updateProgram(id: string, program: Partial<InsertProgram>): Promise<Program | undefined>;
  deleteProgram(id: string): Promise<boolean>;

  getChapters(): Promise<Chapter[]>;
  getChapter(id: string): Promise<Chapter | undefined>;
  createChapter(chapter: InsertChapter): Promise<Chapter>;
  updateChapter(id: string, chapter: Partial<InsertChapter>): Promise<Chapter | undefined>;
  deleteChapter(id: string): Promise<boolean>;

  getVolunteerOpportunities(): Promise<VolunteerOpportunity[]>;
  getVolunteerOpportunity(id: string): Promise<VolunteerOpportunity | undefined>;
  createVolunteerOpportunity(opportunity: InsertVolunteerOpportunity): Promise<VolunteerOpportunity>;
  updateVolunteerOpportunity(id: string, opportunity: Partial<InsertVolunteerOpportunity>): Promise<VolunteerOpportunity | undefined>;
  deleteVolunteerOpportunity(id: string): Promise<boolean>;

  getStats(): Promise<Stats>;
  updateStats(stats: InsertStats): Promise<Stats>;

  getContactInfo(): Promise<ContactInfo>;
  updateContactInfo(info: InsertContactInfo): Promise<ContactInfo>;

  getPublications(): Promise<Publication[]>;
  getPublication(id: string): Promise<Publication | undefined>;
  createPublication(publication: InsertPublication): Promise<Publication>;
  updatePublication(id: string, publication: Partial<InsertPublication>): Promise<Publication | undefined>;
  deletePublication(id: string): Promise<boolean>;

  initializeDefaultData(): Promise<void>;
}

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async getPrograms(): Promise<Program[]> {
    return db.select().from(programs).orderBy(desc(programs.createdAt));
  }

  async getProgram(id: string): Promise<Program | undefined> {
    const result = await db.select().from(programs).where(eq(programs.id, id));
    return result[0];
  }

  async createProgram(program: InsertProgram): Promise<Program> {
    const result = await db.insert(programs).values(program).returning();
    return result[0];
  }

  async updateProgram(id: string, program: Partial<InsertProgram>): Promise<Program | undefined> {
    const result = await db.update(programs).set(program).where(eq(programs.id, id)).returning();
    return result[0];
  }

  async deleteProgram(id: string): Promise<boolean> {
    const result = await db.delete(programs).where(eq(programs.id, id)).returning();
    return result.length > 0;
  }

  async getChapters(): Promise<Chapter[]> {
    return db.select().from(chapters).orderBy(chapters.name);
  }

  async getChapter(id: string): Promise<Chapter | undefined> {
    const result = await db.select().from(chapters).where(eq(chapters.id, id));
    return result[0];
  }

  async createChapter(chapter: InsertChapter): Promise<Chapter> {
    const result = await db.insert(chapters).values(chapter).returning();
    return result[0];
  }

  async updateChapter(id: string, chapter: Partial<InsertChapter>): Promise<Chapter | undefined> {
    const result = await db.update(chapters).set(chapter).where(eq(chapters.id, id)).returning();
    return result[0];
  }

  async deleteChapter(id: string): Promise<boolean> {
    const result = await db.delete(chapters).where(eq(chapters.id, id)).returning();
    return result.length > 0;
  }

  async getVolunteerOpportunities(): Promise<VolunteerOpportunity[]> {
    return db.select().from(volunteerOpportunities).orderBy(volunteerOpportunities.date);
  }

  async getVolunteerOpportunity(id: string): Promise<VolunteerOpportunity | undefined> {
    const result = await db.select().from(volunteerOpportunities).where(eq(volunteerOpportunities.id, id));
    return result[0];
  }

  async createVolunteerOpportunity(opportunity: InsertVolunteerOpportunity): Promise<VolunteerOpportunity> {
    const result = await db.insert(volunteerOpportunities).values(opportunity).returning();
    return result[0];
  }

  async updateVolunteerOpportunity(id: string, opportunity: Partial<InsertVolunteerOpportunity>): Promise<VolunteerOpportunity | undefined> {
    const result = await db.update(volunteerOpportunities).set(opportunity).where(eq(volunteerOpportunities.id, id)).returning();
    return result[0];
  }

  async deleteVolunteerOpportunity(id: string): Promise<boolean> {
    const result = await db.delete(volunteerOpportunities).where(eq(volunteerOpportunities.id, id)).returning();
    return result.length > 0;
  }

  async getStats(): Promise<Stats> {
    const result = await db.select().from(stats).limit(1);
    if (result.length === 0) {
      const newStats = await db.insert(stats).values({
        projects: 150,
        chapters: 25,
        members: 5000
      }).returning();
      return newStats[0];
    }
    return result[0];
  }

  async updateStats(statsData: InsertStats): Promise<Stats> {
    const existing = await db.select().from(stats).limit(1);
    if (existing.length === 0) {
      const result = await db.insert(stats).values({
        ...statsData,
        updatedAt: new Date()
      }).returning();
      return result[0];
    }
    const result = await db.update(stats).set({
      ...statsData,
      updatedAt: new Date()
    }).where(eq(stats.id, existing[0].id)).returning();
    return result[0];
  }

  async getContactInfo(): Promise<ContactInfo> {
    const result = await db.select().from(contactInfo).limit(1);
    if (result.length === 0) {
      const newContact = await db.insert(contactInfo).values({
        email: "phyouthservice@gmail.com",
        phone: "09177798413",
        facebook: "https://www.facebook.com/YOUTHSERVICEPHILIPPINES"
      }).returning();
      return newContact[0];
    }
    return result[0];
  }

  async updateContactInfo(info: InsertContactInfo): Promise<ContactInfo> {
    const existing = await db.select().from(contactInfo).limit(1);
    if (existing.length === 0) {
      const result = await db.insert(contactInfo).values({
        ...info,
        updatedAt: new Date()
      }).returning();
      return result[0];
    }
    const result = await db.update(contactInfo).set({
      ...info,
      updatedAt: new Date()
    }).where(eq(contactInfo.id, existing[0].id)).returning();
    return result[0];
  }

  async getPublications(): Promise<Publication[]> {
    return db.select().from(publications).orderBy(desc(publications.publishedAt));
  }

  async getPublication(id: string): Promise<Publication | undefined> {
    const result = await db.select().from(publications).where(eq(publications.id, id));
    return result[0];
  }

  async createPublication(publication: InsertPublication): Promise<Publication> {
    const result = await db.insert(publications).values(publication).returning();
    return result[0];
  }

  async updatePublication(id: string, publication: Partial<InsertPublication>): Promise<Publication | undefined> {
    const result = await db.update(publications).set(publication).where(eq(publications.id, id)).returning();
    return result[0];
  }

  async deletePublication(id: string): Promise<boolean> {
    const result = await db.delete(publications).where(eq(publications.id, id)).returning();
    return result.length > 0;
  }

  async initializeDefaultData(): Promise<void> {
    const existingAdmin = await this.getUserByUsername("admin");
    if (!existingAdmin) {
      await this.createUser({
        username: "admin",
        password: "admin123"
      });
    }
    await this.getStats();
    await this.getContactInfo();
  }
}

export const storage = new DbStorage();
