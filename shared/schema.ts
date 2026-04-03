import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const adminUsers = pgTable("admin_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chapters = pgTable("chapters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  location: text("location").notNull(),
  contact: text("contact").notNull(),
  contactPerson: text("contact_person"),
  email: text("email"),
  facebookLink: text("facebook_link"),
  instagramLink: text("instagram_link"),
  nextgenBatch: text("nextgen_batch"),
  photo: text("photo"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const members = pgTable("members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationReferenceId: text("application_reference_id").unique(),
  applicationStatus: text("application_status").default("pending").notNull(),
  fullName: text("full_name").notNull(),
  age: integer("age").notNull(),
  birthdate: timestamp("birthdate"),
  chapterId: varchar("chapter_id").references(() => chapters.id),
  barangayId: varchar("barangay_id"),
  contactNumber: text("contact_number").notNull(),
  email: text("email"),
  registeredVoter: boolean("registered_voter").default(false).notNull(),
  facebookLink: text("facebook_link"),
  photoUrl: text("photo_url"),
  isActive: boolean("is_active").default(false).notNull(),
  householdSize: integer("household_size").default(1).notNull(),
  householdVoters: integer("household_voters"),
  newsletterOptIn: boolean("newsletter_opt_in").default(false).notNull(),
  sector: text("sector"),
  sectorOther: text("sector_other"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chapterOfficers = pgTable("chapter_officers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chapterId: varchar("chapter_id").notNull().references(() => chapters.id),
  barangayId: varchar("barangay_id"),
  level: text("level").notNull().default("chapter"),
  position: text("position").notNull(),
  fullName: text("full_name").notNull(),
  birthdate: timestamp("birthdate"),
  contactNumber: text("contact_number").notNull(),
  chapterEmail: text("chapter_email").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const kpiTemplates = pgTable("kpi_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  timeframe: text("timeframe").notNull(),
  inputType: text("input_type").notNull().default("numeric"),
  year: integer("year").notNull(),
  quarter: integer("quarter"),
  targetValue: integer("target_value"),
  scope: text("scope").notNull().default("chapter"),
  linkedEntityId: varchar("linked_entity_id"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const kpiCompletions = pgTable("kpi_completions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kpiTemplateId: varchar("kpi_template_id").notNull().references(() => kpiTemplates.id),
  chapterId: varchar("chapter_id").notNull().references(() => chapters.id),
  barangayId: varchar("barangay_id").references(() => barangayUsers.id),
  numericValue: integer("numeric_value"),
  textValue: text("text_value"),
  isCompleted: boolean("is_completed").default(false).notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const kpiScopes = pgTable("kpi_scopes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kpiTemplateId: varchar("kpi_template_id").notNull().references(() => kpiTemplates.id),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chapterUsers = pgTable("chapter_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chapterId: varchar("chapter_id").notNull().references(() => chapters.id),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  mustChangePassword: boolean("must_change_password").default(true).notNull(),
  failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
  lockedUntil: timestamp("locked_until"),
  passwordChangedAt: timestamp("password_changed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const barangayUsers = pgTable("barangay_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chapterId: varchar("chapter_id").notNull().references(() => chapters.id),
  barangayName: text("barangay_name").notNull(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  mustChangePassword: boolean("must_change_password").default(true).notNull(),
  failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
  lockedUntil: timestamp("locked_until"),
  passwordChangedAt: timestamp("password_changed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projectReports = pgTable("project_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chapterId: varchar("chapter_id").notNull().references(() => chapters.id),
  barangayId: varchar("barangay_id").references(() => barangayUsers.id),
  projectName: text("project_name").notNull(),
  projectWriteup: text("project_writeup").notNull(),
  photoUrl: text("photo_url"),
  facebookPostLink: text("facebook_post_link").notNull(),
  collaborationType: varchar("collaboration_type").default("NONE").notNull(),
  collaboratingChapterId: varchar("collaborating_chapter_id").references(() => chapters.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const nationalRequests = pgTable("national_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderType: varchar("sender_type").notNull(),
  senderId: varchar("sender_id").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  dateNeeded: timestamp("date_needed").notNull(),
  status: varchar("status").default("NEW").notNull(),
  adminReply: text("admin_reply"),
  repliedAt: timestamp("replied_at"),
  processedByAdminId: varchar("processed_by_admin_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const publications = pgTable("publications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chapterId: varchar("chapter_id").references(() => chapters.id),
  sourceProjectReportId: varchar("source_project_report_id").references(() => projectReports.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  photoUrl: text("photo_url"),
  facebookLink: text("facebook_link"),
  isApproved: boolean("is_approved").default(true).notNull(),
  approvedAt: timestamp("approved_at"),
  approvedByAdminId: varchar("approved_by_admin_id").references(() => adminUsers.id),
  publishedAt: timestamp("published_at").defaultNow().notNull(),
});

export const chapterKpis = pgTable("chapter_kpis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chapterId: varchar("chapter_id").notNull().references(() => chapters.id),
  year: integer("year").notNull(),
  kpisJson: jsonb("kpis_json").notNull().default({}),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const programs = pgTable("programs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  fullDescription: text("full_description").notNull(),
  image: text("image").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const volunteerOpportunities = pgTable("volunteer_opportunities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chapterId: varchar("chapter_id").references(() => chapters.id),
  barangayId: varchar("barangay_id").references(() => barangayUsers.id),
  barangayIds: text("barangay_ids"),
  eventName: text("event_name").notNull(),
  date: timestamp("date").notNull(),
  time: text("time").notNull(),
  venue: text("venue").notNull(),
  chapter: text("chapter").notNull(),
  description: text("description"),
  sdgs: text("sdgs"),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone").notNull(),
  contactEmail: text("contact_email"),
  learnMoreUrl: text("learn_more_url"),
  applyUrl: text("apply_url"),
  deadlineAt: timestamp("deadline_at"),
  ageRequirement: text("age_requirement").default("18+").notNull(),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const stats = pgTable("stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projects: integer("projects").notNull().default(0),
  chapters: integer("chapters").notNull().default(0),
  members: integer("members").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const contactInfo = pgTable("contact_info", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  facebook: text("facebook").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const importantDocuments = pgTable("important_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  url: text("url").notNull(),
  notes: text("notes"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chapterDocumentAck = pgTable("chapter_document_ack", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chapterId: varchar("chapter_id").notNull().references(() => chapters.id),
  documentId: varchar("document_id").notNull().references(() => importantDocuments.id),
  acknowledged: boolean("acknowledged").default(false).notNull(),
  readAt: timestamp("read_at"),
});

export const mouSubmissions = pgTable("mou_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chapterId: varchar("chapter_id").notNull().references(() => chapters.id),
  driveFolderUrl: text("drive_folder_url").notNull().default("https://drive.google.com/drive/folders/1eAi3sB1KBGZ9nKffbwJbGnaD6N7NIYkY?usp=sharing"),
  driveFileLink: text("drive_file_link"),
  uploadedFileUrl: text("uploaded_file_url"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});

export const chapterRequests = pgTable("chapter_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chapterId: varchar("chapter_id").notNull().references(() => chapters.id),
  type: text("type").notNull().default("funding_request"),
  proposedActivityName: text("proposed_activity_name"),
  date: timestamp("date"),
  time: text("time"),
  rationale: text("rationale"),
  howNationalCanHelp: text("how_national_can_help"),
  details: text("details"),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAdminUserSchema = createInsertSchema(adminUsers).pick({
  username: true,
  password: true,
});

export const insertChapterSchema = createInsertSchema(chapters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChapterUserSchema = createInsertSchema(chapterUsers).omit({
  id: true,
  createdAt: true,
});

export const insertBarangayUserSchema = createInsertSchema(barangayUsers).omit({
  id: true,
  createdAt: true,
});

export const insertProjectReportSchema = createInsertSchema(projectReports).omit({
  id: true,
  createdAt: true,
});

export const insertNationalRequestSchema = createInsertSchema(nationalRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPublicationSchema = createInsertSchema(publications).omit({
  id: true,
  publishedAt: true,
});

export const insertChapterKpiSchema = createInsertSchema(chapterKpis).omit({
  id: true,
  updatedAt: true,
});

export const insertProgramSchema = createInsertSchema(programs).omit({
  id: true,
  createdAt: true,
});

export const insertVolunteerOpportunitySchema = createInsertSchema(volunteerOpportunities).omit({
  id: true,
  createdAt: true,
}).extend({
  date: z.preprocess(
    (val) => (typeof val === "string" ? new Date(val) : val),
    z.date()
  ),
  deadlineAt: z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === "") {
        return undefined;
      }
      return typeof val === "string" ? new Date(val) : val;
    },
    z.date().optional()
  ),
});

export const insertStatsSchema = createInsertSchema(stats).omit({
  id: true,
  updatedAt: true,
});

export const insertContactInfoSchema = createInsertSchema(contactInfo).omit({
  id: true,
  updatedAt: true,
});

export const insertMemberSchema = createInsertSchema(members).omit({
  id: true,
  createdAt: true,
}).extend({
  birthdate: z.preprocess(
    (val) => (typeof val === "string" && val ? new Date(val) : val),
    z.date().nullable().optional()
  ),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  photoUrl: z.preprocess(
    (val) => (typeof val === "string" ? val.trim() || null : val),
    z.string().max(2048).nullable().optional()
  ),
});

export const insertChapterOfficerSchema = createInsertSchema(chapterOfficers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  birthdate: z.preprocess(
    (val) => (typeof val === "string" && val ? new Date(val) : val),
    z.date().nullable().optional()
  ),
});

export const insertKpiTemplateSchema = createInsertSchema(kpiTemplates).omit({
  id: true,
  createdAt: true,
});

export const insertKpiCompletionSchema = createInsertSchema(kpiCompletions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertKpiScopeSchema = createInsertSchema(kpiScopes).omit({
  id: true,
  createdAt: true,
});

export const insertImportantDocumentSchema = createInsertSchema(importantDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChapterDocumentAckSchema = createInsertSchema(chapterDocumentAck).omit({
  id: true,
});

export const insertMouSubmissionSchema = createInsertSchema(mouSubmissions).omit({
  id: true,
  submittedAt: true,
});

export const insertChapterRequestSchema = createInsertSchema(chapterRequests).omit({
  id: true,
  createdAt: true,
}).extend({
  date: z.preprocess(
    (val) => (typeof val === "string" ? new Date(val) : val),
    z.date().optional()
  ),
});

export type AdminUser = typeof adminUsers.$inferSelect;
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;

export type Chapter = typeof chapters.$inferSelect;
export type InsertChapter = z.infer<typeof insertChapterSchema>;

export type ChapterUser = typeof chapterUsers.$inferSelect;
export type InsertChapterUser = z.infer<typeof insertChapterUserSchema>;

export type BarangayUser = typeof barangayUsers.$inferSelect;
export type InsertBarangayUser = z.infer<typeof insertBarangayUserSchema>;

export type ProjectReport = typeof projectReports.$inferSelect;
export type InsertProjectReport = z.infer<typeof insertProjectReportSchema>;

export type NationalRequest = typeof nationalRequests.$inferSelect;
export type InsertNationalRequest = z.infer<typeof insertNationalRequestSchema>;

export type Publication = typeof publications.$inferSelect;
export type InsertPublication = z.infer<typeof insertPublicationSchema>;

export type ChapterKpi = typeof chapterKpis.$inferSelect;
export type InsertChapterKpi = z.infer<typeof insertChapterKpiSchema>;

export type Program = typeof programs.$inferSelect;
export type InsertProgram = z.infer<typeof insertProgramSchema>;

export type VolunteerOpportunity = typeof volunteerOpportunities.$inferSelect;
export type InsertVolunteerOpportunity = z.infer<typeof insertVolunteerOpportunitySchema>;

export type Stats = typeof stats.$inferSelect;
export type InsertStats = z.infer<typeof insertStatsSchema>;

export type ContactInfo = typeof contactInfo.$inferSelect;
export type InsertContactInfo = z.infer<typeof insertContactInfoSchema>;

export type Member = typeof members.$inferSelect;
export type InsertMember = z.infer<typeof insertMemberSchema>;

export type ChapterOfficer = typeof chapterOfficers.$inferSelect;
export type InsertChapterOfficer = z.infer<typeof insertChapterOfficerSchema>;

export type KpiTemplate = typeof kpiTemplates.$inferSelect;
export type InsertKpiTemplate = z.infer<typeof insertKpiTemplateSchema>;

export type KpiCompletion = typeof kpiCompletions.$inferSelect;
export type InsertKpiCompletion = z.infer<typeof insertKpiCompletionSchema>;

export type KpiScope = typeof kpiScopes.$inferSelect;
export type InsertKpiScope = z.infer<typeof insertKpiScopeSchema>;

export type KpisData = {
  projectsCompleted?: number;
  volunteers?: number;
  beneficiaries?: number;
  fundsRaised?: number;
  [key: string]: number | undefined;
};

export type ImportantDocument = typeof importantDocuments.$inferSelect;
export type InsertImportantDocument = z.infer<typeof insertImportantDocumentSchema>;

export type ChapterDocumentAck = typeof chapterDocumentAck.$inferSelect;
export type InsertChapterDocumentAck = z.infer<typeof insertChapterDocumentAckSchema>;

export type MouSubmission = typeof mouSubmissions.$inferSelect;
export type InsertMouSubmission = z.infer<typeof insertMouSubmissionSchema>;

export type ChapterRequest = typeof chapterRequests.$inferSelect;
export type InsertChapterRequest = z.infer<typeof insertChapterRequestSchema>;
