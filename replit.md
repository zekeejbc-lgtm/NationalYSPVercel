# Youth Service Philippines NGO Website

## Overview

This is a full-stack web application for Youth Service Philippines (YSP), a non-governmental organization dedicated to empowering Filipino youth through community service. The website serves as an information hub and engagement platform, featuring programs, chapters, volunteer opportunities, and membership registration. The site includes both a public-facing interface and an admin panel for content management.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System:**
- React 18+ with TypeScript for type-safe component development
- Vite as the build tool and development server, providing fast HMR (Hot Module Replacement)
- Wouter for client-side routing (lightweight alternative to React Router)
- React Query (@tanstack/react-query) for server state management and data fetching

**UI Component System:**
- Shadcn/ui component library (New York style variant) built on Radix UI primitives
- Tailwind CSS for utility-first styling with custom design tokens
- Component variants managed via class-variance-authority (CVA)
- Path aliases configured for clean imports (@/, @shared/, @assets/)

**Design Approach:**
- Mobile-first responsive design inspired by modern NGO websites (charity:water, Habitat for Humanity, UNICEF)
- Typography: Inter/DM Sans font family from Google Fonts
- Color scheme: Orange primary color (#FF6B35 range) representing energy and community engagement
- Spacing: Consistent Tailwind spacing units (4, 6, 8, 12, 16, 20, 24)
- Layout: Max-width containers (max-w-7xl) with responsive padding

**Key Pages & Features:**
- Home: Hero section with call-to-action, stats display, featured programs and chapters
- Programs: Browsable program catalog with detailed modal views
- Publications: Blog-style page displaying organization news/articles ordered by newest first
- Membership: Built-in membership registration form with dynamic chapter dropdown and privacy consent modal, plus interactive Leaflet map showing chapter locations. New member registrations are saved as inactive by default until approved by admin. Includes household data collection for Voter's Education program (household size, household voters, sector selection, newsletter opt-in).
- Volunteer: Listings of volunteer opportunities filtered by chapter and SDG alignment, with optional photo/pubmat display
- Contact: Contact information display with email, phone, and social media links
- Admin Dashboard: Protected dashboard for content management with tabs for:
  - Programs, Chapters, Publications, Volunteer Opportunities, Stats, Contact Info
  - KPI Templates: Template-based KPI system with quarterly/yearly/both timeframes and numeric/text inputs
  - Members: View all registered YSP members across chapters with Add Member modal, toggle buttons for isActive/registeredVoter (using per-row updatingMemberId tracking to prevent disabling all buttons), search/filter by chapter, CSV export, and Household Summary card displaying total submissions, total household size, and average household size
  - Officers: View all chapter officers organized by chapter
  - Documents: CRUD management for Important Documents (4 default documents seeded: MOU, 3 Code of Conduct documents)
  - Requests: View and manage chapter funding requests with status tracking (new/in_review/approved/rejected)
- Chapter Dashboard: Role-based dashboard for chapter accounts with panels for:
  - Project Reports: Submit project reports (auto-published to Publications)
  - Officers: Manage 6 required officer positions (President, Program Dev, Finance, Secretary, Partnership, Communications)
  - KPIs: View assigned KPI templates with progress tracking and completion marking
  - Volunteer Opportunities: Create volunteer events with safety disclaimers for age requirements
  - Social Media: Manage Facebook and Instagram links
  - Publications: View organization-wide publications
  - Chapter Directory: View all YSP chapters
  - Leaderboard: Quarterly/Yearly rankings based on KPI completion scores
  - Members: View and manage chapter-scoped members with Add Member modal and toggle buttons for isActive/registeredVoter
  - Documents: View Important Documents with read acknowledgement confirmation dialogs and MOU submission to hardcoded Drive folder
  - Requests: Submit funding requests to YSP National with activity details, rationale, and requested support

### Backend Architecture

**Server Framework:**
- Express.js with TypeScript for the REST API
- Separate entry points for development (index-dev.ts with Vite SSR) and production (index-prod.ts serving static files)
- Session-based authentication using express-session
- JSON body parsing with raw body preservation for webhook scenarios

**API Design:**
- RESTful endpoints organized by resource type (/api/programs, /api/chapters, /api/volunteer-opportunities, etc.)
- Authentication middleware (requireAuth) protecting admin routes
- CRUD operations for all content entities
- Zod schema validation for request payloads
- File upload support via Multer (images limited to 5MB, JPEG/PNG/GIF/WebP formats)

**Data Layer:**
- Drizzle ORM for type-safe database queries and schema management
- PostgreSQL database (via Neon serverless driver with WebSocket support)
- Schema defined in shared/schema.ts with Zod validation schemas auto-generated via drizzle-zod
- Database migrations managed through drizzle-kit

**Database Schema:**
- Users table: Authentication credentials (username/password hash)
- Programs table: Title, description, full description, image URL, timestamps
- Chapters table: Name, location, contact info, representative details, photos, latitude/longitude for map positioning
- Publications table: Title, content, imageUrl, facebookLink, publishedAt timestamp
- Volunteer Opportunities table: Event details, date, chapter affiliation, SDG alignment, contact information
- Stats table: Global metrics (projects completed, active chapters, total members)
- Contact Info table: Organization-wide contact details (email, phone, Facebook)

**Storage Strategy:**
- Database storage interface (IStorage) with implementation (DbStorage) using PostgreSQL for permanent data persistence
- Drizzle ORM handles type-safe queries and schema management
- Auto-initialization of default data (admin user, stats, contact info) on startup
- Uploaded files stored in client/public/uploads directory (served as static assets)

### Security & Authentication

**Session Management:**
- Express-session with configurable secret (defaults to dev secret, should be overridden in production)
- HTTP-only cookies with secure flag in production
- 24-hour session timeout
- Session data typed via module augmentation (userId field)

**Route Protection:**
- requireAuth middleware checks session.userId before allowing access to admin endpoints
- 401 responses for unauthenticated requests
- Admin login page with username/password authentication
- Logout endpoint to clear sessions

**Input Validation:**
- Zod schemas for all database insert operations
- File upload restrictions (size, type, destination)
- Schema validation errors converted to user-friendly messages via zod-validation-error

### Development vs Production

**Development Mode:**
- Vite middleware integrated into Express for HMR
- Client-side hot module replacement
- Template reloading on every request
- Replit-specific plugins: cartographer (code mapping), dev-banner, runtime-error-modal

**Production Mode:**
- Pre-built static assets served from dist/public
- Express serves compiled client bundle
- Server code bundled with esbuild
- Fallback to index.html for client-side routing

## External Dependencies

### Third-Party Services
- **Neon Database**: Serverless PostgreSQL hosting with WebSocket support
- **Google Fonts**: Inter, DM Sans, Geist Mono, Fira Code, Architects Daughter
- **Google Forms**: Embedded forms for membership registration and chapter creation

### UI Component Libraries
- **Radix UI**: Comprehensive set of accessible, unstyled React primitives (accordion, dialog, dropdown, etc.)
- **Lucide React**: Icon library for consistent iconography throughout the application
- **date-fns**: Date formatting and manipulation utilities

### Development Tools
- **TypeScript**: Static type checking across client, server, and shared code
- **PostCSS & Autoprefixer**: CSS processing pipeline for Tailwind
- **ESBuild**: Fast bundling for production server code
- **Drizzle Kit**: Database migration generation and management CLI

### Image Assets
- Static images stored in attached_assets/generated_images directory
- Hero image featuring YSP volunteers in action
- Program-specific illustrations (education, environment, community)
- Logo assets in client/public/images

### Notable Package Choices
- **wouter**: Chosen over React Router for its minimal bundle size (~1KB)
- **cmdk**: Command palette primitive for future search/navigation features
- **connect-pg-simple**: PostgreSQL session store (prepared but not actively used with current session config)
- **zod-validation-error**: Converts Zod errors into human-readable format for better UX