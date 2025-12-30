import { 
  type AdminUser, 
  type InsertAdminUser,
  type ChapterUser,
  type InsertChapterUser,
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
  type ProjectReport,
  type InsertProjectReport,
  type ChapterKpi,
  type InsertChapterKpi,
  adminUsers,
  chapterUsers,
  programs,
  chapters,
  volunteerOpportunities,
  stats,
  contactInfo,
  publications,
  projectReports,
  chapterKpis
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

export interface IStorage {
  getAdminUser(id: string): Promise<AdminUser | undefined>;
  getAdminUserByUsername(username: string): Promise<AdminUser | undefined>;
  createAdminUser(user: InsertAdminUser): Promise<AdminUser>;

  getChapterUser(id: string): Promise<ChapterUser | undefined>;
  getChapterUserByUsername(username: string): Promise<ChapterUser | undefined>;
  getChapterUsersByChapterId(chapterId: string): Promise<ChapterUser[]>;
  createChapterUser(user: InsertChapterUser): Promise<ChapterUser>;
  updateChapterUser(id: string, user: Partial<InsertChapterUser>): Promise<ChapterUser | undefined>;
  deleteChapterUser(id: string): Promise<boolean>;

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
  getPublicationsByChapter(chapterId: string): Promise<Publication[]>;
  getPublication(id: string): Promise<Publication | undefined>;
  createPublication(publication: InsertPublication): Promise<Publication>;
  updatePublication(id: string, publication: Partial<InsertPublication>): Promise<Publication | undefined>;
  deletePublication(id: string): Promise<boolean>;

  getProjectReports(): Promise<ProjectReport[]>;
  getProjectReportsByChapter(chapterId: string): Promise<ProjectReport[]>;
  getProjectReport(id: string): Promise<ProjectReport | undefined>;
  createProjectReport(report: InsertProjectReport): Promise<ProjectReport>;
  updateProjectReport(id: string, report: Partial<InsertProjectReport>): Promise<ProjectReport | undefined>;
  deleteProjectReport(id: string): Promise<boolean>;

  getChapterKpis(chapterId: string): Promise<ChapterKpi[]>;
  getChapterKpiByYear(chapterId: string, year: number): Promise<ChapterKpi | undefined>;
  createChapterKpi(kpi: InsertChapterKpi): Promise<ChapterKpi>;
  updateChapterKpi(id: string, kpi: Partial<InsertChapterKpi>): Promise<ChapterKpi | undefined>;

  getLeaderboard(): Promise<{ chapterId: string; chapterName: string; reportCount: number }[]>;

  initializeDefaultData(): Promise<void>;
}

export class DbStorage implements IStorage {
  async getAdminUser(id: string): Promise<AdminUser | undefined> {
    const result = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    return result[0];
  }

  async getAdminUserByUsername(username: string): Promise<AdminUser | undefined> {
    const result = await db.select().from(adminUsers).where(eq(adminUsers.username, username));
    return result[0];
  }

  async createAdminUser(insertUser: InsertAdminUser): Promise<AdminUser> {
    const result = await db.insert(adminUsers).values(insertUser).returning();
    return result[0];
  }

  async getChapterUser(id: string): Promise<ChapterUser | undefined> {
    const result = await db.select().from(chapterUsers).where(eq(chapterUsers.id, id));
    return result[0];
  }

  async getChapterUserByUsername(username: string): Promise<ChapterUser | undefined> {
    const result = await db.select().from(chapterUsers).where(eq(chapterUsers.username, username));
    return result[0];
  }

  async getChapterUsersByChapterId(chapterId: string): Promise<ChapterUser[]> {
    return db.select().from(chapterUsers).where(eq(chapterUsers.chapterId, chapterId));
  }

  async createChapterUser(user: InsertChapterUser): Promise<ChapterUser> {
    const result = await db.insert(chapterUsers).values(user).returning();
    return result[0];
  }

  async updateChapterUser(id: string, user: Partial<InsertChapterUser>): Promise<ChapterUser | undefined> {
    const result = await db.update(chapterUsers).set(user).where(eq(chapterUsers.id, id)).returning();
    return result[0];
  }

  async deleteChapterUser(id: string): Promise<boolean> {
    const result = await db.delete(chapterUsers).where(eq(chapterUsers.id, id)).returning();
    return result.length > 0;
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
    const result = await db.update(chapters).set({
      ...chapter,
      updatedAt: new Date()
    }).where(eq(chapters.id, id)).returning();
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

  async getPublicationsByChapter(chapterId: string): Promise<Publication[]> {
    return db.select().from(publications).where(eq(publications.chapterId, chapterId)).orderBy(desc(publications.publishedAt));
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

  async getProjectReports(): Promise<ProjectReport[]> {
    return db.select().from(projectReports).orderBy(desc(projectReports.createdAt));
  }

  async getProjectReportsByChapter(chapterId: string): Promise<ProjectReport[]> {
    return db.select().from(projectReports).where(eq(projectReports.chapterId, chapterId)).orderBy(desc(projectReports.createdAt));
  }

  async getProjectReport(id: string): Promise<ProjectReport | undefined> {
    const result = await db.select().from(projectReports).where(eq(projectReports.id, id));
    return result[0];
  }

  async createProjectReport(report: InsertProjectReport): Promise<ProjectReport> {
    const result = await db.insert(projectReports).values(report).returning();
    return result[0];
  }

  async updateProjectReport(id: string, report: Partial<InsertProjectReport>): Promise<ProjectReport | undefined> {
    const result = await db.update(projectReports).set(report).where(eq(projectReports.id, id)).returning();
    return result[0];
  }

  async deleteProjectReport(id: string): Promise<boolean> {
    const result = await db.delete(projectReports).where(eq(projectReports.id, id)).returning();
    return result.length > 0;
  }

  async getChapterKpis(chapterId: string): Promise<ChapterKpi[]> {
    return db.select().from(chapterKpis).where(eq(chapterKpis.chapterId, chapterId)).orderBy(desc(chapterKpis.year));
  }

  async getChapterKpiByYear(chapterId: string, year: number): Promise<ChapterKpi | undefined> {
    const result = await db.select().from(chapterKpis).where(
      and(eq(chapterKpis.chapterId, chapterId), eq(chapterKpis.year, year))
    );
    return result[0];
  }

  async createChapterKpi(kpi: InsertChapterKpi): Promise<ChapterKpi> {
    const result = await db.insert(chapterKpis).values(kpi).returning();
    return result[0];
  }

  async updateChapterKpi(id: string, kpi: Partial<InsertChapterKpi>): Promise<ChapterKpi | undefined> {
    const result = await db.update(chapterKpis).set({
      ...kpi,
      updatedAt: new Date()
    }).where(eq(chapterKpis.id, id)).returning();
    return result[0];
  }

  async getLeaderboard(): Promise<{ chapterId: string; chapterName: string; reportCount: number }[]> {
    const result = await db.execute(sql`
      SELECT 
        c.id as chapter_id,
        c.name as chapter_name,
        COUNT(pr.id)::int as report_count
      FROM chapters c
      LEFT JOIN project_reports pr ON c.id = pr.chapter_id
      GROUP BY c.id, c.name
      ORDER BY report_count DESC
      LIMIT 5
    `);
    return (result.rows as any[]).map(row => ({
      chapterId: row.chapter_id,
      chapterName: row.chapter_name,
      reportCount: row.report_count || 0
    }));
  }

  async initializeDefaultData(): Promise<void> {
    const existingAdmin = await this.getAdminUserByUsername("admin");
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await this.createAdminUser({
        username: "admin",
        password: hashedPassword
      });
    }
    await this.getStats();
    await this.getContactInfo();
  }
}

export const storage = new DbStorage();
