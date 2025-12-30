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
  nextgenBatch: text("nextgen_batch"),
  photo: text("photo"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chapterUsers = pgTable("chapter_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chapterId: varchar("chapter_id").notNull().references(() => chapters.id),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  mustChangePassword: boolean("must_change_password").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projectReports = pgTable("project_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chapterId: varchar("chapter_id").notNull().references(() => chapters.id),
  projectName: text("project_name").notNull(),
  projectWriteup: text("project_writeup").notNull(),
  photoUrl: text("photo_url"),
  facebookPostLink: text("facebook_post_link").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const publications = pgTable("publications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chapterId: varchar("chapter_id").references(() => chapters.id),
  sourceProjectReportId: varchar("source_project_report_id").references(() => projectReports.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  photoUrl: text("photo_url"),
  facebookLink: text("facebook_link"),
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
  eventName: text("event_name").notNull(),
  date: timestamp("date").notNull(),
  chapter: text("chapter").notNull(),
  sdgs: text("sdgs").notNull(),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone").notNull(),
  contactEmail: text("contact_email"),
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

export const insertProjectReportSchema = createInsertSchema(projectReports).omit({
  id: true,
  createdAt: true,
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
});

export const insertStatsSchema = createInsertSchema(stats).omit({
  id: true,
  updatedAt: true,
});

export const insertContactInfoSchema = createInsertSchema(contactInfo).omit({
  id: true,
  updatedAt: true,
});

export type AdminUser = typeof adminUsers.$inferSelect;
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;

export type Chapter = typeof chapters.$inferSelect;
export type InsertChapter = z.infer<typeof insertChapterSchema>;

export type ChapterUser = typeof chapterUsers.$inferSelect;
export type InsertChapterUser = z.infer<typeof insertChapterUserSchema>;

export type ProjectReport = typeof projectReports.$inferSelect;
export type InsertProjectReport = z.infer<typeof insertProjectReportSchema>;

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

export type KpisData = {
  projectsCompleted?: number;
  volunteers?: number;
  beneficiaries?: number;
  fundsRaised?: number;
  [key: string]: number | undefined;
};
