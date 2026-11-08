import type { NewsletterDraftInput } from "./newsletter";

type NewsletterTemplate = NewsletterDraftInput & {
  id: string;
  name: string;
  description: string;
};

export const NEWSLETTER_TEMPLATES: readonly NewsletterTemplate[] = [
  {
    id: "monthly",
    name: "Monthly community update",
    description:
      "A roundup of activities, volunteer opportunities, and chapter news.",
    subject: "YouthServe Community Update — [Month Year]",
    previewText:
      "Discover this month's activities, opportunities, and community highlights.",
    content: `Hello YouthServe community,

Here's what is happening across Youth Service Philippines this [month].

THIS MONTH'S HIGHLIGHTS
[Share two or three achievements and the people who made them possible.]

UPCOMING ACTIVITIES
[Activity name] — [Date and time, Philippine time]
[Location and registration link]

VOLUNTEER OPPORTUNITIES
[Describe an opportunity, who can join, and how to sign up.]

CHAPTER SPOTLIGHT
[Chapter name]: [Share a short story and its impact.]

GET INVOLVED
Explore opportunities: https://youthserviceph.org/volunteer

Thank you for being part of our community.
Youth Service Philippines`,
  },
  {
    id: "volunteer",
    name: "Volunteer recruitment",
    description:
      "Invite people to join a specific service opportunity with clear next steps.",
    subject: "Volunteer with YSP: [Opportunity name]",
    previewText:
      "Put your passion into action. See the roles, schedule, and how to join.",
    content: `Hello YouthServe community,

We are looking for volunteers for [opportunity name] in [location]. Together, we can [describe the community goal].

THE OPPORTUNITY
[Explain the activity and who it will support.]

WHEN AND WHERE
Date: [Date]
Time: [Start and end time, Philippine time]
Location: [Venue or online platform]

HOW YOU CAN HELP
[List volunteer roles and any relevant requirements.]

WHAT TO EXPECT
[Include orientation, accessibility details, and what volunteers should bring.]

JOIN US
Register by [deadline]: [Registration link]
Questions? Contact [organizer and contact details].

Thank you for choosing to serve.
Youth Service Philippines`,
  },
  {
    id: "event",
    name: "Event invitation",
    description:
      "Promote a gathering, training, or community activity with registration details.",
    subject: "You're invited: [Event name]",
    previewText:
      "Join us for [event name]. Find the schedule, venue, and registration details inside.",
    content: `Hello YouthServe community,

You are invited to [event name], a [brief description of the event and its purpose].

EVENT DETAILS
Date: [Date]
Time: [Start and end time, Philippine time]
Venue: [Full address or online platform]
Who can attend: [Intended participants]
Participation fee: [Free or fee details]

WHAT'S IN STORE
[Session or activity 1]
[Session or activity 2]
[Session or activity 3]

RESERVE YOUR PLACE
Register here: [Registration link]
Registration closes: [Deadline]

NEED ASSISTANCE?
[Contact details and accessibility or participation information]

We look forward to seeing you there.
Youth Service Philippines`,
  },
  {
    id: "spotlight",
    name: "Chapter spotlight",
    description:
      "Celebrate a chapter's project, volunteers, and community impact.",
    subject: "Chapter Spotlight: [Chapter name]",
    previewText:
      "Meet the people behind [project name] and discover their community's story.",
    content: `Hello YouthServe community,

This edition celebrates [chapter name] and their work on [project name].

THE COMMUNITY AND THE CHALLENGE
[Introduce the community need and why the chapter chose to act.]

SERVICE IN ACTION
[Describe what the chapter and its volunteers did, when, and where.]

THE IMPACT
[Share verified outcomes. Include numbers only when confirmed.]

VOICES FROM THE CHAPTER
"[Approved quote from a volunteer or community partner.]"
— [Name and role, with permission]

THANK YOU
[Recognize volunteers and partners with their permission.]

KEEP THE MOMENTUM GOING
[Explain how readers can support the chapter or join its next activity.]
[Project story or chapter link]

Youth Service Philippines`,
  },
  {
    id: "announcement",
    name: "Important announcement",
    description:
      "Share an organizational update, deadline, or change that needs attention.",
    subject: "YSP Announcement: [Topic]",
    previewText:
      "What is changing, who it affects, and what you need to do next.",
    content: `Hello YouthServe community,

We are sharing an important update about [topic].

WHAT YOU NEED TO KNOW
[Explain the announcement clearly and briefly.]

WHO THIS AFFECTS
[Identify the relevant members, chapters, or participants.]

KEY DATES
Effective date: [Date and time, Philippine time]
Deadline, if applicable: [Date and time, Philippine time]

YOUR NEXT STEP
[State the action readers should take. If no action is needed, say so.]
[Relevant link]

QUESTIONS?
Please contact [team or person] at [contact details].

Thank you for your attention and continued involvement.
Youth Service Philippines`,
  },
  {
    id: "thanks",
    name: "Impact recap and thank-you",
    description:
      "Close an activity with verified results, appreciation, and ways to stay involved.",
    subject: "Thank you for making [Activity name] possible",
    previewText: "Celebrate what we achieved together and see what comes next.",
    content: `Hello YouthServe community,

Thank you to everyone who supported [activity name] on [date] in [location]. Your time and effort helped us [describe the shared goal].

WHAT WE ACCOMPLISHED
[Summarize confirmed outcomes and community feedback.]

THE PEOPLE BEHIND THE WORK
[Recognize volunteers, organizers, and partners with their permission.]

MOMENTS TO REMEMBER
[Share a short story or approved reflection from the activity.]
View the recap: [Published recap or photo link]

WHAT COMES NEXT
[Describe the follow-up activity or next opportunity to participate.]
Get involved: https://youthserviceph.org/volunteer

Thank you for being part of Youth Service Philippines. We look forward to serving with you again.

Youth Service Philippines`,
  },
];
