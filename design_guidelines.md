# Design Guidelines: Youth Service Philippines NGO Website

## Design Approach

**Reference-Based Strategy**: Drawing inspiration from modern NGO websites like charity:water, Habitat for Humanity, and UNICEF - focusing on emotional connection, trust-building, and clear calls-to-action.

**Core Principle**: Balance inspiration with accessibility - the design should motivate action while making information easily digestible.

---

## Typography

**Font Selection**: 
- Headings: Inter or DM Sans (via Google Fonts) - bold, confident, modern
- Body: Inter (Regular/Medium) - clean, highly readable
- Hierarchy: H1 (3xl-4xl), H2 (2xl-3xl), H3 (xl-2xl), Body (base-lg)

---

## Layout System

**Spacing Primitives**: Tailwind units of 4, 6, 8, 12, 16, 20, 24 (e.g., p-4, gap-8, my-12, py-20)

**Container Strategy**:
- Max width: max-w-7xl for main content areas
- Full-width sections with inner padding px-4 md:px-8 lg:px-12
- Generous vertical rhythm: py-16 md:py-20 lg:py-24 for major sections

**Grid Systems**:
- Program cards: 1-2-3 column grid (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
- Chapter listings: 1-2-4 column grid for compact cards
- Stats: 3-column grid (mobile stacks to 1)

---

## Component Library

### Navigation
- Sticky header with logo left, nav links center/right
- Mobile: Hamburger menu with slide-in drawer
- Orange underline animation on active/hover states
- CTA button (orange background) for "Become a Member" in header

### Hero Section (Home)
- Full-width, 70vh minimum height
- Large background image showing YSP volunteers in action (young people helping communities)
- Overlay: dark gradient (bottom to top, opacity 60%)
- Content: Centered, bold headline + tagline + dual CTAs ("Join Us" + "Learn More")
- CTAs: Buttons with backdrop-blur-md background for legibility

### Program Cards
- Card design: Image top (aspect-ratio-4/3), content below
- Hover: Subtle lift (transform scale-105) and shadow enhancement
- Content: Program title (font-semibold), short description (2-3 lines), "Learn More" link
- Click behavior: Modal or dedicated detail view with full program info

### Stats Section
- Prominent placement below hero on Home page
- 3-column layout: Projects | Chapters | Members
- Large numbers (4xl-5xl font), descriptive label below
- Orange accent for numbers, subtle background card for each stat

### Chapter Cards
- Grid layout with location pin icon
- Chapter name, location, contact info, representative photo
- Consistent card height, subtle border, hover state

### Volunteer Opportunities List
- Table or card-based list view
- Columns/Fields: Event Name | Date | Chapter | SDGs (icons/badges) | Contact
- SDG badges: Small colored pills with SDG numbers
- Filterable by chapter or SDG (optional enhancement)

### Forms Section (Membership & Chapters)
- Two-column layout on desktop (Become a Member | Create a Chapter)
- Embedded Google Forms with adequate iframe height (min-h-[800px])
- Clear section headers with orange accent borders
- Note text in muted gray below Create a Chapter form

### Contact Page
- Clean layout with contact methods as large, tappable cards
- Email, Facebook, Mobile each in separate card with icon
- Icons: Heroicons (envelope, at-symbol for Facebook, phone)
- Links styled in orange, hover underline

### Admin Panel
- Clean, functional interface - minimal styling
- Simple login form: centered card with orange submit button
- Dashboard: Card-based layout for different content sections
- Forms: Standard inputs with orange focus states, clear labels
- Image upload: Drag-drop or file input with preview

### Footer
- Multi-column layout: About YSP | Quick Links | Contact | Social
- Newsletter signup optional
- Social media icons linked to Facebook
- Copyright notice at bottom

---

## Visual Treatment

**Orange Accent Usage**:
- Primary CTAs: orange background (e.g., #FF6B35 or #F97316)
- Links and active states: orange text/underline
- Section dividers: thin orange accent lines
- Hover states: orange highlight
- Icons and badges: orange fills where appropriate

**Imagery Strategy**:
- Hero: Large, inspiring image of YSP volunteers (young Filipinos engaged in community service)
- Programs: High-quality photos for each program showcasing activities
- Chapters: Representative photos or group photos of chapter members
- Authentic, candid photography preferred over stock images

**Cards & Containers**:
- Subtle shadows: shadow-sm default, shadow-lg on hover
- Rounded corners: rounded-lg for cards, rounded-xl for larger sections
- White/light backgrounds for cards on neutral page background

**Whitespace Philosophy**:
- Generous padding within cards (p-6 md:p-8)
- Clear section separation (my-16 md:my-20)
- Breathing room around CTAs and key content

---

## Responsive Behavior

- Mobile-first approach
- Navigation: Full menu on desktop, hamburger on mobile
- Grids: Stack to single column on mobile, expand on tablet/desktop
- Hero text: Smaller font sizes on mobile (text-3xl → text-5xl on lg)
- Forms: Full-width on mobile, contained width on desktop
- Admin panel: Simplified layout on mobile with stacked forms

---

## Animation & Interaction

**Minimal, Purposeful Animations**:
- Smooth transitions on hover (transition-all duration-300)
- Card lifts on hover (subtle scale and shadow change)
- Navigation underlines slide in on active state
- Modal/detail views: Fade in overlay, slide up content
- No complex scroll animations - keep focus on content

---

## Accessibility

- High contrast text (dark gray/black on white, white on dark overlays)
- Focus states: Orange outline (ring-2 ring-orange-500)
- Alt text for all images
- Semantic HTML for screen readers
- Minimum touch targets 44px on mobile