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
  type InsertContactInfo
} from "@shared/schema";
import { randomUUID } from "crypto";

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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private programs: Map<string, Program>;
  private chapters: Map<string, Chapter>;
  private volunteerOpportunities: Map<string, VolunteerOpportunity>;
  private stats: Stats;
  private contactInfo: ContactInfo;

  constructor() {
    this.users = new Map();
    this.programs = new Map();
    this.chapters = new Map();
    this.volunteerOpportunities = new Map();
    
    this.stats = {
      id: randomUUID(),
      projects: 150,
      chapters: 25,
      members: 5000,
      updatedAt: new Date(),
    };

    this.contactInfo = {
      id: randomUUID(),
      email: "phyouthservice@gmail.com",
      phone: "09177798413",
      facebook: "https://www.facebook.com/YOUTHSERVICEPHILIPPINES",
      updatedAt: new Date(),
    };

    const defaultAdmin: User = {
      id: randomUUID(),
      username: "admin",
      password: "admin123",
    };
    this.users.set(defaultAdmin.id, defaultAdmin);
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getPrograms(): Promise<Program[]> {
    return Array.from(this.programs.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getProgram(id: string): Promise<Program | undefined> {
    return this.programs.get(id);
  }

  async createProgram(program: InsertProgram): Promise<Program> {
    const id = randomUUID();
    const newProgram: Program = { 
      ...program, 
      id,
      createdAt: new Date()
    };
    this.programs.set(id, newProgram);
    return newProgram;
  }

  async updateProgram(id: string, program: Partial<InsertProgram>): Promise<Program | undefined> {
    const existing = this.programs.get(id);
    if (!existing) return undefined;
    
    const updated: Program = { ...existing, ...program };
    this.programs.set(id, updated);
    return updated;
  }

  async deleteProgram(id: string): Promise<boolean> {
    return this.programs.delete(id);
  }

  async getChapters(): Promise<Chapter[]> {
    return Array.from(this.chapters.values()).sort((a, b) => 
      a.name.localeCompare(b.name)
    );
  }

  async getChapter(id: string): Promise<Chapter | undefined> {
    return this.chapters.get(id);
  }

  async createChapter(chapter: InsertChapter): Promise<Chapter> {
    const id = randomUUID();
    const newChapter: Chapter = { 
      ...chapter,
      email: chapter.email ?? null,
      photo: chapter.photo ?? null,
      representative: chapter.representative ?? null,
      id,
      createdAt: new Date()
    };
    this.chapters.set(id, newChapter);
    return newChapter;
  }

  async updateChapter(id: string, chapter: Partial<InsertChapter>): Promise<Chapter | undefined> {
    const existing = this.chapters.get(id);
    if (!existing) return undefined;
    
    const updated: Chapter = { ...existing, ...chapter };
    this.chapters.set(id, updated);
    return updated;
  }

  async deleteChapter(id: string): Promise<boolean> {
    return this.chapters.delete(id);
  }

  async getVolunteerOpportunities(): Promise<VolunteerOpportunity[]> {
    return Array.from(this.volunteerOpportunities.values()).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  async getVolunteerOpportunity(id: string): Promise<VolunteerOpportunity | undefined> {
    return this.volunteerOpportunities.get(id);
  }

  async createVolunteerOpportunity(opportunity: InsertVolunteerOpportunity): Promise<VolunteerOpportunity> {
    const id = randomUUID();
    const newOpportunity: VolunteerOpportunity = { 
      ...opportunity,
      contactEmail: opportunity.contactEmail ?? null,
      id,
      createdAt: new Date()
    };
    this.volunteerOpportunities.set(id, newOpportunity);
    return newOpportunity;
  }

  async updateVolunteerOpportunity(id: string, opportunity: Partial<InsertVolunteerOpportunity>): Promise<VolunteerOpportunity | undefined> {
    const existing = this.volunteerOpportunities.get(id);
    if (!existing) return undefined;
    
    const updated: VolunteerOpportunity = { ...existing, ...opportunity };
    this.volunteerOpportunities.set(id, updated);
    return updated;
  }

  async deleteVolunteerOpportunity(id: string): Promise<boolean> {
    return this.volunteerOpportunities.delete(id);
  }

  async getStats(): Promise<Stats> {
    return this.stats;
  }

  async updateStats(stats: InsertStats): Promise<Stats> {
    this.stats = {
      ...this.stats,
      ...stats,
      updatedAt: new Date()
    };
    return this.stats;
  }

  async getContactInfo(): Promise<ContactInfo> {
    return this.contactInfo;
  }

  async updateContactInfo(info: InsertContactInfo): Promise<ContactInfo> {
    this.contactInfo = {
      ...this.contactInfo,
      ...info,
      updatedAt: new Date()
    };
    return this.contactInfo;
  }
}

export const storage = new MemStorage();
