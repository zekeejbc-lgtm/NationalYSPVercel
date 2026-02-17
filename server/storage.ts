import { 
  type AdminUser, 
  type InsertAdminUser,
  type ChapterUser,
  type InsertChapterUser,
  type BarangayUser,
  type InsertBarangayUser,
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
  type Member,
  type InsertMember,
  type ChapterOfficer,
  type InsertChapterOfficer,
  type KpiTemplate,
  type InsertKpiTemplate,
  type KpiCompletion,
  type InsertKpiCompletion,
  type ImportantDocument,
  type InsertImportantDocument,
  type ChapterDocumentAck,
  type InsertChapterDocumentAck,
  type MouSubmission,
  type InsertMouSubmission,
  type ChapterRequest,
  type InsertChapterRequest,
  type KpiScope,
  type InsertKpiScope,
  type NationalRequest,
  type InsertNationalRequest,
  adminUsers,
  chapterUsers,
  barangayUsers,
  programs,
  chapters,
  volunteerOpportunities,
  stats,
  contactInfo,
  publications,
  projectReports,
  chapterKpis,
  members,
  chapterOfficers,
  kpiTemplates,
  kpiCompletions,
  kpiScopes,
  importantDocuments,
  chapterDocumentAck,
  mouSubmissions,
  chapterRequests,
  nationalRequests
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, asc } from "drizzle-orm";
import bcrypt from "bcryptjs";

export interface IStorage {
  getAdminUser(id: string): Promise<AdminUser | undefined>;
  getAdminUserByUsername(username: string): Promise<AdminUser | undefined>;
  createAdminUser(user: InsertAdminUser): Promise<AdminUser>;

  getChapterUser(id: string): Promise<ChapterUser | undefined>;
  getChapterUserByUsername(username: string): Promise<ChapterUser | undefined>;
  getAllChapterUsers(): Promise<ChapterUser[]>;
  getChapterUsersByChapterId(chapterId: string): Promise<ChapterUser[]>;
  createChapterUser(user: InsertChapterUser): Promise<ChapterUser>;
  updateChapterUser(id: string, user: Partial<InsertChapterUser>): Promise<ChapterUser | undefined>;
  deleteChapterUser(id: string): Promise<boolean>;

  getBarangayUsers(): Promise<BarangayUser[]>;
  getBarangayUser(id: string): Promise<BarangayUser | undefined>;
  getBarangayUserByUsername(username: string): Promise<BarangayUser | undefined>;
  getBarangayUsersByChapterId(chapterId: string): Promise<BarangayUser[]>;
  createBarangayUser(user: InsertBarangayUser): Promise<BarangayUser>;
  updateBarangayUser(id: string, user: Partial<InsertBarangayUser>): Promise<BarangayUser | undefined>;
  deleteBarangayUser(id: string): Promise<boolean>;

  getMembersByBarangay(barangayId: string): Promise<Member[]>;
  getOfficersByBarangay(barangayId: string): Promise<ChapterOfficer[]>;
  getMemberTotals(chapterId?: string, barangayId?: string): Promise<number>;
  getBirthdaysToday(): Promise<{ members: Member[]; officers: ChapterOfficer[] }>;

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

  getLeaderboard(timeframe?: string, year?: number, quarter?: number): Promise<{ chapterId: string; chapterName: string; score: number; completedKpis: number }[]>;
  getBarangayLeaderboard(chapterId: string): Promise<{ barangayId: string; barangayName: string; memberCount: number; rank: number }[]>;

  getMembers(): Promise<Member[]>;
  getMembersByChapter(chapterId: string): Promise<Member[]>;
  getMember(id: string): Promise<Member | undefined>;
  createMember(member: InsertMember): Promise<Member>;
  updateMember(id: string, member: Partial<InsertMember>): Promise<Member | undefined>;
  deleteMember(id: string): Promise<boolean>;
  getHouseholdSummary(): Promise<{ totalSubmissions: number; totalHouseholdSize: number; averageHouseholdSize: number }>;

  getChapterOfficers(chapterId: string): Promise<ChapterOfficer[]>;
  getAllOfficers(): Promise<ChapterOfficer[]>;
  getChapterOfficer(id: string): Promise<ChapterOfficer | undefined>;
  createChapterOfficer(officer: InsertChapterOfficer): Promise<ChapterOfficer>;
  updateChapterOfficer(id: string, officer: Partial<InsertChapterOfficer>): Promise<ChapterOfficer | undefined>;
  deleteChapterOfficer(id: string): Promise<boolean>;

  getKpiTemplates(year?: number, quarter?: number): Promise<KpiTemplate[]>;
  getKpiTemplatesForChapter(year?: number, chapterId?: string, quarter?: number): Promise<KpiTemplate[]>;
  getKpiTemplatesForBarangay(year?: number, barangayId?: string, chapterId?: string, quarter?: number): Promise<KpiTemplate[]>;
  getKpiTemplate(id: string): Promise<KpiTemplate | undefined>;
  createKpiTemplate(template: InsertKpiTemplate): Promise<KpiTemplate>;
  updateKpiTemplate(id: string, template: Partial<InsertKpiTemplate>): Promise<KpiTemplate | undefined>;
  deleteKpiTemplate(id: string): Promise<boolean>;

  getKpiScopesByTemplateId(kpiTemplateId: string): Promise<KpiScope[]>;
  createKpiScopes(scopes: InsertKpiScope[]): Promise<KpiScope[]>;
  deleteKpiScopesByTemplateId(kpiTemplateId: string): Promise<boolean>;

  getKpiCompletions(chapterId: string, year?: number, quarter?: number): Promise<KpiCompletion[]>;
  getKpiCompletion(id: string): Promise<KpiCompletion | undefined>;
  getKpiCompletionByTemplateAndChapter(templateId: string, chapterId: string): Promise<KpiCompletion | undefined>;
  createKpiCompletion(completion: InsertKpiCompletion): Promise<KpiCompletion>;
  updateKpiCompletion(id: string, completion: Partial<InsertKpiCompletion>): Promise<KpiCompletion | undefined>;
  markKpiCompleted(id: string): Promise<KpiCompletion | undefined>;

  getVolunteerOpportunitiesByChapter(chapterId: string): Promise<VolunteerOpportunity[]>;

  getImportantDocuments(): Promise<ImportantDocument[]>;
  getImportantDocument(id: string): Promise<ImportantDocument | undefined>;
  createImportantDocument(doc: InsertImportantDocument): Promise<ImportantDocument>;
  updateImportantDocument(id: string, doc: Partial<InsertImportantDocument>): Promise<ImportantDocument | undefined>;
  deleteImportantDocument(id: string): Promise<boolean>;

  getChapterDocumentAcks(chapterId: string): Promise<ChapterDocumentAck[]>;
  getChapterDocumentAck(chapterId: string, documentId: string): Promise<ChapterDocumentAck | undefined>;
  createChapterDocumentAck(ack: InsertChapterDocumentAck): Promise<ChapterDocumentAck>;
  acknowledgeDocument(chapterId: string, documentId: string): Promise<ChapterDocumentAck>;

  getMouSubmissions(): Promise<MouSubmission[]>;
  getMouSubmissionByChapter(chapterId: string): Promise<MouSubmission | undefined>;
  createMouSubmission(submission: InsertMouSubmission): Promise<MouSubmission>;
  updateMouSubmission(id: string, submission: Partial<InsertMouSubmission>): Promise<MouSubmission | undefined>;

  getChapterRequests(): Promise<ChapterRequest[]>;
  getChapterRequestsByChapter(chapterId: string): Promise<ChapterRequest[]>;
  getChapterRequest(id: string): Promise<ChapterRequest | undefined>;
  createChapterRequest(request: InsertChapterRequest): Promise<ChapterRequest>;
  updateChapterRequest(id: string, request: Partial<InsertChapterRequest>): Promise<ChapterRequest | undefined>;

  getNationalRequests(): Promise<NationalRequest[]>;
  getNationalRequestsBySender(senderType: string, senderId: string): Promise<NationalRequest[]>;
  getNationalRequest(id: string): Promise<NationalRequest | undefined>;
  createNationalRequest(request: InsertNationalRequest): Promise<NationalRequest>;
  updateNationalRequest(id: string, request: Partial<InsertNationalRequest>): Promise<NationalRequest | undefined>;

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

  async getAllChapterUsers(): Promise<ChapterUser[]> {
    return db.select().from(chapterUsers).orderBy(desc(chapterUsers.createdAt));
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

  async getBarangayUsers(): Promise<BarangayUser[]> {
    return db.select().from(barangayUsers).orderBy(desc(barangayUsers.createdAt));
  }

  async getBarangayUser(id: string): Promise<BarangayUser | undefined> {
    const result = await db.select().from(barangayUsers).where(eq(barangayUsers.id, id));
    return result[0];
  }

  async getBarangayUserByUsername(username: string): Promise<BarangayUser | undefined> {
    const result = await db.select().from(barangayUsers).where(eq(barangayUsers.username, username));
    return result[0];
  }

  async getBarangayUsersByChapterId(chapterId: string): Promise<BarangayUser[]> {
    return db.select().from(barangayUsers).where(eq(barangayUsers.chapterId, chapterId));
  }

  async createBarangayUser(user: InsertBarangayUser): Promise<BarangayUser> {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    const result = await db.insert(barangayUsers).values({
      ...user,
      password: hashedPassword,
    }).returning();
    return result[0];
  }

  async updateBarangayUser(id: string, user: Partial<InsertBarangayUser>): Promise<BarangayUser | undefined> {
    const result = await db.update(barangayUsers).set(user).where(eq(barangayUsers.id, id)).returning();
    return result[0];
  }

  async deleteBarangayUser(id: string): Promise<boolean> {
    const result = await db.delete(barangayUsers).where(eq(barangayUsers.id, id)).returning();
    return result.length > 0;
  }

  async getMembersByBarangay(barangayId: string): Promise<Member[]> {
    return db.select().from(members).where(eq(members.barangayId, barangayId)).orderBy(desc(members.createdAt));
  }

  async getOfficersByBarangay(barangayId: string): Promise<ChapterOfficer[]> {
    return db.select().from(chapterOfficers).where(eq(chapterOfficers.barangayId, barangayId)).orderBy(asc(chapterOfficers.position));
  }

  async getMemberTotals(chapterId?: string, barangayId?: string): Promise<number> {
    let query = db.select({ count: sql<number>`count(*)` }).from(members);
    if (barangayId) {
      query = query.where(eq(members.barangayId, barangayId)) as typeof query;
    } else if (chapterId) {
      query = query.where(eq(members.chapterId, chapterId)) as typeof query;
    }
    const result = await query;
    return Number(result[0]?.count || 0);
  }

  async getBirthdaysToday(): Promise<{ members: Member[]; officers: ChapterOfficer[] }> {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    
    const birthdayMembers = await db.select().from(members).where(
      sql`EXTRACT(MONTH FROM ${members.birthdate}) = ${month} AND EXTRACT(DAY FROM ${members.birthdate}) = ${day}`
    );
    
    const birthdayOfficers = await db.select().from(chapterOfficers).where(
      sql`EXTRACT(MONTH FROM ${chapterOfficers.birthdate}) = ${month} AND EXTRACT(DAY FROM ${chapterOfficers.birthdate}) = ${day}`
    );
    
    return { members: birthdayMembers, officers: birthdayOfficers };
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

  async getLeaderboard(timeframe?: string, year?: number, quarter?: number): Promise<{ chapterId: string; chapterName: string; score: number; completedKpis: number }[]> {
    let query = sql`
      SELECT 
        c.id as chapter_id,
        c.name as chapter_name,
        COUNT(CASE WHEN kc.is_completed = true THEN 1 END)::int as completed_kpis,
        COUNT(CASE WHEN kc.is_completed = true THEN 1 END)::int as score
      FROM chapters c
      LEFT JOIN kpi_completions kc ON c.id = kc.chapter_id
      LEFT JOIN kpi_templates kt ON kc.kpi_template_id = kt.id
      WHERE 1=1
    `;
    
    if (year) {
      query = sql`${query} AND kt.year = ${year}`;
    }
    if (timeframe && timeframe !== 'all') {
      query = sql`${query} AND kt.timeframe = ${timeframe}`;
    }
    if (quarter && timeframe === 'quarterly') {
      query = sql`${query} AND kt.quarter = ${quarter}`;
    }
    
    query = sql`${query} GROUP BY c.id, c.name ORDER BY score DESC, c.name ASC`;
    
    const result = await db.execute(query);
    return (result.rows as any[]).map(row => ({
      chapterId: row.chapter_id,
      chapterName: row.chapter_name,
      score: row.score || 0,
      completedKpis: row.completed_kpis || 0
    }));
  }

  async getBarangayLeaderboard(chapterId: string): Promise<{ barangayId: string; barangayName: string; memberCount: number; rank: number }[]> {
    const query = sql`
      SELECT 
        bu.id as barangay_id,
        bu.barangay_name,
        COUNT(m.id)::int as member_count,
        ROW_NUMBER() OVER (ORDER BY COUNT(m.id) DESC, bu.barangay_name ASC)::int as rank
      FROM barangay_users bu
      LEFT JOIN members m ON m.barangay_id = bu.id
      WHERE bu.chapter_id = ${chapterId} AND bu.is_active = true
      GROUP BY bu.id, bu.barangay_name
      ORDER BY member_count DESC, bu.barangay_name ASC
      LIMIT 20
    `;
    
    const result = await db.execute(query);
    return (result.rows as any[]).map(row => ({
      barangayId: row.barangay_id,
      barangayName: row.barangay_name,
      memberCount: row.member_count || 0,
      rank: row.rank
    }));
  }

  async getMembers(): Promise<Member[]> {
    return db.select().from(members).orderBy(desc(members.createdAt));
  }

  async getMembersByChapter(chapterId: string): Promise<Member[]> {
    return db.select().from(members).where(eq(members.chapterId, chapterId)).orderBy(members.fullName);
  }

  async getMember(id: string): Promise<Member | undefined> {
    const result = await db.select().from(members).where(eq(members.id, id));
    return result[0];
  }

  async createMember(member: InsertMember): Promise<Member> {
    const result = await db.insert(members).values(member).returning();
    return result[0];
  }

  async updateMember(id: string, member: Partial<InsertMember>): Promise<Member | undefined> {
    const result = await db.update(members).set(member).where(eq(members.id, id)).returning();
    return result[0];
  }

  async deleteMember(id: string): Promise<boolean> {
    const result = await db.delete(members).where(eq(members.id, id)).returning();
    return result.length > 0;
  }

  async getHouseholdSummary(): Promise<{ totalSubmissions: number; totalHouseholdSize: number; averageHouseholdSize: number }> {
    const allMembers = await db.select({ householdSize: members.householdSize }).from(members);
    const totalSubmissions = allMembers.length;
    const totalHouseholdSize = allMembers.reduce((sum, m) => sum + (m.householdSize || 1), 0);
    const averageHouseholdSize = totalSubmissions > 0 ? totalHouseholdSize / totalSubmissions : 0;
    return { totalSubmissions, totalHouseholdSize, averageHouseholdSize: Math.round(averageHouseholdSize * 100) / 100 };
  }

  async getChapterOfficers(chapterId: string): Promise<ChapterOfficer[]> {
    return db.select().from(chapterOfficers).where(eq(chapterOfficers.chapterId, chapterId)).orderBy(chapterOfficers.position);
  }

  async getAllOfficers(): Promise<ChapterOfficer[]> {
    return db.select().from(chapterOfficers).orderBy(chapterOfficers.chapterId, chapterOfficers.position);
  }

  async getChapterOfficer(id: string): Promise<ChapterOfficer | undefined> {
    const result = await db.select().from(chapterOfficers).where(eq(chapterOfficers.id, id));
    return result[0];
  }

  async createChapterOfficer(officer: InsertChapterOfficer): Promise<ChapterOfficer> {
    const result = await db.insert(chapterOfficers).values(officer).returning();
    return result[0];
  }

  async updateChapterOfficer(id: string, officer: Partial<InsertChapterOfficer>): Promise<ChapterOfficer | undefined> {
    const result = await db.update(chapterOfficers).set({
      ...officer,
      updatedAt: new Date()
    }).where(eq(chapterOfficers.id, id)).returning();
    return result[0];
  }

  async deleteChapterOfficer(id: string): Promise<boolean> {
    const result = await db.delete(chapterOfficers).where(eq(chapterOfficers.id, id)).returning();
    return result.length > 0;
  }

  async getKpiTemplates(year?: number, quarter?: number): Promise<KpiTemplate[]> {
    if (year && quarter) {
      return db.select().from(kpiTemplates).where(
        and(eq(kpiTemplates.year, year), eq(kpiTemplates.quarter, quarter))
      ).orderBy(kpiTemplates.name);
    } else if (year) {
      return db.select().from(kpiTemplates).where(eq(kpiTemplates.year, year)).orderBy(kpiTemplates.name);
    }
    return db.select().from(kpiTemplates).orderBy(desc(kpiTemplates.year), kpiTemplates.name);
  }

  async getKpiTemplatesForChapter(year?: number, chapterId?: string, quarter?: number): Promise<KpiTemplate[]> {
    const query = sql`
      SELECT DISTINCT kt.* FROM kpi_templates kt
      LEFT JOIN kpi_scopes ks ON kt.id = ks.kpi_template_id
      WHERE kt.is_active = true
      ${year ? sql`AND kt.year = ${year}` : sql``}
      ${quarter ? sql`AND (kt.quarter = ${quarter} OR kt.timeframe = 'yearly' OR kt.timeframe = 'both')` : sql``}
      AND (
        kt.scope = 'all_chapters_and_barangays'
        OR kt.scope = 'all_chapters'
        ${chapterId ? sql`OR (kt.scope = 'selected_chapters' AND ks.entity_type = 'chapter' AND ks.entity_id = ${chapterId})` : sql``}
      )
      ORDER BY kt.name ASC
    `;
    const result = await db.execute(query);
    return (result.rows as any[]).map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      timeframe: row.timeframe,
      inputType: row.input_type,
      year: row.year,
      quarter: row.quarter,
      targetValue: row.target_value,
      scope: row.scope,
      linkedEntityId: row.linked_entity_id,
      isActive: row.is_active,
      createdAt: row.created_at
    }));
  }

  async getKpiTemplatesForBarangay(year?: number, barangayId?: string, chapterId?: string, quarter?: number): Promise<KpiTemplate[]> {
    const query = sql`
      SELECT DISTINCT kt.* FROM kpi_templates kt
      LEFT JOIN kpi_scopes ks ON kt.id = ks.kpi_template_id
      WHERE kt.is_active = true
      ${year ? sql`AND kt.year = ${year}` : sql``}
      ${quarter ? sql`AND (kt.quarter = ${quarter} OR kt.timeframe = 'yearly' OR kt.timeframe = 'both')` : sql``}
      AND (
        kt.scope = 'all_chapters_and_barangays'
        OR kt.scope = 'all_barangays'
        ${barangayId ? sql`OR (kt.scope = 'selected_barangays' AND ks.entity_type = 'barangay' AND ks.entity_id = ${barangayId})` : sql``}
        ${chapterId ? sql`OR (kt.scope = 'selected_chapters' AND ks.entity_type = 'chapter' AND ks.entity_id = ${chapterId})` : sql``}
      )
      ORDER BY kt.name ASC
    `;
    const result = await db.execute(query);
    return (result.rows as any[]).map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      timeframe: row.timeframe,
      inputType: row.input_type,
      year: row.year,
      quarter: row.quarter,
      targetValue: row.target_value,
      scope: row.scope,
      linkedEntityId: row.linked_entity_id,
      isActive: row.is_active,
      createdAt: row.created_at
    }));
  }

  async getKpiTemplate(id: string): Promise<KpiTemplate | undefined> {
    const result = await db.select().from(kpiTemplates).where(eq(kpiTemplates.id, id));
    return result[0];
  }

  async createKpiTemplate(template: InsertKpiTemplate): Promise<KpiTemplate> {
    const result = await db.insert(kpiTemplates).values(template).returning();
    return result[0];
  }

  async updateKpiTemplate(id: string, template: Partial<InsertKpiTemplate>): Promise<KpiTemplate | undefined> {
    const result = await db.update(kpiTemplates).set(template).where(eq(kpiTemplates.id, id)).returning();
    return result[0];
  }

  async deleteKpiTemplate(id: string): Promise<boolean> {
    await db.delete(kpiScopes).where(eq(kpiScopes.kpiTemplateId, id));
    await db.delete(kpiCompletions).where(eq(kpiCompletions.kpiTemplateId, id));
    const result = await db.delete(kpiTemplates).where(eq(kpiTemplates.id, id)).returning();
    return result.length > 0;
  }

  async getKpiScopesByTemplateId(kpiTemplateId: string): Promise<KpiScope[]> {
    return db.select().from(kpiScopes).where(eq(kpiScopes.kpiTemplateId, kpiTemplateId));
  }

  async createKpiScopes(scopes: InsertKpiScope[]): Promise<KpiScope[]> {
    if (scopes.length === 0) return [];
    const result = await db.insert(kpiScopes).values(scopes).returning();
    return result;
  }

  async deleteKpiScopesByTemplateId(kpiTemplateId: string): Promise<boolean> {
    await db.delete(kpiScopes).where(eq(kpiScopes.kpiTemplateId, kpiTemplateId));
    return true;
  }

  async getKpiCompletions(chapterId: string, year?: number, quarter?: number): Promise<KpiCompletion[]> {
    return db.select().from(kpiCompletions).where(eq(kpiCompletions.chapterId, chapterId)).orderBy(desc(kpiCompletions.createdAt));
  }

  async getKpiCompletion(id: string): Promise<KpiCompletion | undefined> {
    const result = await db.select().from(kpiCompletions).where(eq(kpiCompletions.id, id));
    return result[0];
  }

  async getKpiCompletionByTemplateAndChapter(templateId: string, chapterId: string): Promise<KpiCompletion | undefined> {
    const result = await db.select().from(kpiCompletions).where(
      and(eq(kpiCompletions.kpiTemplateId, templateId), eq(kpiCompletions.chapterId, chapterId))
    );
    return result[0];
  }

  async createKpiCompletion(completion: InsertKpiCompletion): Promise<KpiCompletion> {
    const result = await db.insert(kpiCompletions).values(completion).returning();
    return result[0];
  }

  async updateKpiCompletion(id: string, completion: Partial<InsertKpiCompletion>): Promise<KpiCompletion | undefined> {
    const result = await db.update(kpiCompletions).set({
      ...completion,
      updatedAt: new Date()
    }).where(eq(kpiCompletions.id, id)).returning();
    return result[0];
  }

  async markKpiCompleted(id: string): Promise<KpiCompletion | undefined> {
    const result = await db.update(kpiCompletions).set({
      isCompleted: true,
      completedAt: new Date(),
      updatedAt: new Date()
    }).where(eq(kpiCompletions.id, id)).returning();
    return result[0];
  }

  async getVolunteerOpportunitiesByChapter(chapterId: string): Promise<VolunteerOpportunity[]> {
    return db.select().from(volunteerOpportunities).where(eq(volunteerOpportunities.chapterId, chapterId)).orderBy(volunteerOpportunities.date);
  }

  async getImportantDocuments(): Promise<ImportantDocument[]> {
    return db.select().from(importantDocuments).orderBy(desc(importantDocuments.createdAt));
  }

  async getImportantDocument(id: string): Promise<ImportantDocument | undefined> {
    const result = await db.select().from(importantDocuments).where(eq(importantDocuments.id, id));
    return result[0];
  }

  async createImportantDocument(doc: InsertImportantDocument): Promise<ImportantDocument> {
    const result = await db.insert(importantDocuments).values(doc).returning();
    return result[0];
  }

  async updateImportantDocument(id: string, doc: Partial<InsertImportantDocument>): Promise<ImportantDocument | undefined> {
    const result = await db.update(importantDocuments).set({
      ...doc,
      updatedAt: new Date()
    }).where(eq(importantDocuments.id, id)).returning();
    return result[0];
  }

  async deleteImportantDocument(id: string): Promise<boolean> {
    await db.delete(chapterDocumentAck).where(eq(chapterDocumentAck.documentId, id));
    const result = await db.delete(importantDocuments).where(eq(importantDocuments.id, id)).returning();
    return result.length > 0;
  }

  async getChapterDocumentAcks(chapterId: string): Promise<ChapterDocumentAck[]> {
    return db.select().from(chapterDocumentAck).where(eq(chapterDocumentAck.chapterId, chapterId));
  }

  async getChapterDocumentAck(chapterId: string, documentId: string): Promise<ChapterDocumentAck | undefined> {
    const result = await db.select().from(chapterDocumentAck).where(
      and(eq(chapterDocumentAck.chapterId, chapterId), eq(chapterDocumentAck.documentId, documentId))
    );
    return result[0];
  }

  async createChapterDocumentAck(ack: InsertChapterDocumentAck): Promise<ChapterDocumentAck> {
    const result = await db.insert(chapterDocumentAck).values(ack).returning();
    return result[0];
  }

  async acknowledgeDocument(chapterId: string, documentId: string): Promise<ChapterDocumentAck> {
    const existing = await this.getChapterDocumentAck(chapterId, documentId);
    if (existing) {
      const result = await db.update(chapterDocumentAck).set({
        acknowledged: true,
        readAt: new Date()
      }).where(eq(chapterDocumentAck.id, existing.id)).returning();
      return result[0];
    }
    return this.createChapterDocumentAck({
      chapterId,
      documentId,
      acknowledged: true,
      readAt: new Date()
    });
  }

  async getMouSubmissions(): Promise<MouSubmission[]> {
    return db.select().from(mouSubmissions).orderBy(desc(mouSubmissions.submittedAt));
  }

  async getMouSubmissionByChapter(chapterId: string): Promise<MouSubmission | undefined> {
    const result = await db.select().from(mouSubmissions).where(eq(mouSubmissions.chapterId, chapterId)).orderBy(desc(mouSubmissions.submittedAt));
    return result[0];
  }

  async createMouSubmission(submission: InsertMouSubmission): Promise<MouSubmission> {
    const result = await db.insert(mouSubmissions).values(submission).returning();
    return result[0];
  }

  async updateMouSubmission(id: string, submission: Partial<InsertMouSubmission>): Promise<MouSubmission | undefined> {
    const result = await db.update(mouSubmissions).set(submission).where(eq(mouSubmissions.id, id)).returning();
    return result[0];
  }

  async getChapterRequests(): Promise<ChapterRequest[]> {
    return db.select().from(chapterRequests).orderBy(desc(chapterRequests.createdAt));
  }

  async getChapterRequestsByChapter(chapterId: string): Promise<ChapterRequest[]> {
    return db.select().from(chapterRequests).where(eq(chapterRequests.chapterId, chapterId)).orderBy(desc(chapterRequests.createdAt));
  }

  async getChapterRequest(id: string): Promise<ChapterRequest | undefined> {
    const result = await db.select().from(chapterRequests).where(eq(chapterRequests.id, id));
    return result[0];
  }

  async createChapterRequest(request: InsertChapterRequest): Promise<ChapterRequest> {
    const result = await db.insert(chapterRequests).values(request).returning();
    return result[0];
  }

  async updateChapterRequest(id: string, request: Partial<InsertChapterRequest>): Promise<ChapterRequest | undefined> {
    const result = await db.update(chapterRequests).set(request).where(eq(chapterRequests.id, id)).returning();
    return result[0];
  }

  async getNationalRequests(): Promise<NationalRequest[]> {
    return db.select().from(nationalRequests).orderBy(desc(nationalRequests.createdAt));
  }

  async getNationalRequestsBySender(senderType: string, senderId: string): Promise<NationalRequest[]> {
    return db.select().from(nationalRequests)
      .where(and(eq(nationalRequests.senderType, senderType), eq(nationalRequests.senderId, senderId)))
      .orderBy(desc(nationalRequests.createdAt));
  }

  async getNationalRequest(id: string): Promise<NationalRequest | undefined> {
    const result = await db.select().from(nationalRequests).where(eq(nationalRequests.id, id));
    return result[0];
  }

  async createNationalRequest(request: InsertNationalRequest): Promise<NationalRequest> {
    const result = await db.insert(nationalRequests).values(request).returning();
    return result[0];
  }

  async updateNationalRequest(id: string, request: Partial<InsertNationalRequest>): Promise<NationalRequest | undefined> {
    const result = await db.update(nationalRequests).set({
      ...request,
      updatedAt: new Date()
    }).where(eq(nationalRequests.id, id)).returning();
    return result[0];
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
    
    const existingDocs = await this.getImportantDocuments();
    if (existingDocs.length === 0) {
      const defaultDocs = [
        {
          title: "MOU between Chapter President and YSP National",
          url: "https://docs.google.com/document/d/1IG4tFjOcb9nVn7ly60Ddj33bvS0bqv1THJP2xkTpvVI/edit?usp=sharing",
          notes: "Memorandum of Understanding that must be signed by all Chapter Presidents"
        },
        {
          title: "CODE OF CONDUCT ON THE USE OF THE YSP NAME",
          url: "https://docs.google.com/document/d/1ZvGoIb-les1sRUffLDDTj9pDb4-lfNqykggBvQu2rpg/edit?usp=sharing",
          notes: "Guidelines on proper use of YSP branding and name"
        },
        {
          title: "CODE OF CONDUCT ON FUNDRAISING FOR YSP CHAPTERS",
          url: "https://docs.google.com/document/d/1v8Ig2R6i0alLkbl93k7LWMDJjXYk5lv5UMRkRAhuA_s/edit?usp=sharing",
          notes: "Rules and procedures for chapter fundraising activities"
        },
        {
          title: "CODE OF CONDUCT IN HANDLING OFFICERS AND MEMBERS",
          url: "https://docs.google.com/document/d/1xoIYiW4ViC6nvU2YMvMZT-xDv_2vFkIg2ylY5g5W63c/edit?usp=sharing",
          notes: "Guidelines for managing officers and members within chapters"
        }
      ];
      for (const doc of defaultDocs) {
        await this.createImportantDocument(doc);
      }
    }
  }
}

export const storage = new DbStorage();
