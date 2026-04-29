export type TrainingAudience = "regular" | "lead";

export type TrainingLesson = {
  id: string;
  title: string;
  duration: string;
  summary: string;
  embedUrl: string | null;
  videoUrl: string | null;
  takeaways: string[];
};

export type TrainingQuestion = {
  id: string;
  prompt: string;
  options: { id: string; label: string }[];
  correctOptionId: string;
  explanation: string;
};

export type TrainingCourse = {
  id: string;
  dbId?: string;
  title: string;
  audience: TrainingAudience[];
  description: string;
  summary: string;
  estimatedTime: string;
  isRequired: boolean;
  statusLabel?: string;
  note?: string;
  isPublished?: boolean;
  lessons: TrainingLesson[];
  questions?: TrainingQuestion[];
};

export const TRAINING_PASSING_SCORE = 80;
export const PRIMARY_TRAINING_COURSE_ID = "volunteer-orientation";

export const TRAINING_COURSES: TrainingCourse[] = [
  {
    id: "volunteer-orientation",
    title: "Volunteer Orientation",
    audience: ["regular", "lead"],
    description:
      "The base course for every volunteer. Use this for your intro videos, role expectations, and the core quiz.",
    summary: "Start here. Core onboarding for all volunteers.",
    estimatedTime: "20-25 min",
    isRequired: true,
    note:
      "Replace the lesson video URLs in trainingCourseContent.ts when your final videos are ready.",
    lessons: [
      {
        id: "mission-and-safety",
        title: "1. Mission and Safety Basics",
        duration: "6 min",
        summary:
          "Introduce the organization, explain volunteer expectations, and cover the safety rules every volunteer should follow before interacting with animals or guests.",
        embedUrl: null,
        videoUrl: null,
        takeaways: [
          "Start every shift by checking instructions from a lead or admin.",
          "Do not improvise safety procedures when animals or visitors are involved.",
          "Ask questions early instead of guessing.",
        ],
      },
      {
        id: "shift-flow",
        title: "2. Shift Flow and Communication",
        duration: "8 min",
        summary:
          "Walk through what volunteers do when they arrive, how handoffs work, and how to communicate issues during a shift.",
        embedUrl: null,
        videoUrl: null,
        takeaways: [
          "Arrive ready to help and review the plan for the shift.",
          "Communicate concerns to a lead right away.",
          "Leave clear notes when something needs follow-up.",
        ],
      },
      {
        id: "guest-and-animal-care",
        title: "3. Guest Interactions and Animal Care",
        duration: "7 min",
        summary:
          "Cover the standards for speaking with guests, handling animals appropriately, and escalating anything outside your role.",
        embedUrl: null,
        videoUrl: null,
        takeaways: [
          "Be calm, clear, and friendly with guests.",
          "Stay inside your role and escalate uncertain situations.",
          "Protect the animals first, then document issues clearly.",
        ],
      },
    ],
    questions: [
      {
        id: "ask-lead",
        prompt: "If you are unsure how to handle a situation during a shift, what should you do first?",
        options: [
          { id: "a", label: "Ask a lead or admin for direction" },
          { id: "b", label: "Try what seems most efficient" },
          { id: "c", label: "Wait and hope another volunteer handles it" },
        ],
        correctOptionId: "a",
        explanation: "Volunteers should escalate uncertainty quickly instead of improvising.",
      },
      {
        id: "communication",
        prompt: "Why are shift notes and handoff details important?",
        options: [
          { id: "a", label: "They are optional if the shift felt normal" },
          { id: "b", label: "They help the next volunteer or lead know what happened" },
          { id: "c", label: "They are mainly for tracking volunteer speed" },
        ],
        correctOptionId: "b",
        explanation: "Good notes preserve context and reduce avoidable mistakes between shifts.",
      },
      {
        id: "guest-interaction",
        prompt: "What is the best approach when speaking with guests?",
        options: [
          { id: "a", label: "Be calm, respectful, and clear" },
          { id: "b", label: "Keep answers short even if they are incomplete" },
          { id: "c", label: "Avoid interacting unless directly required" },
        ],
        correctOptionId: "a",
        explanation: "Guest interactions should be friendly, clear, and professional.",
      },
      {
        id: "animal-care",
        prompt: "When should a volunteer go beyond the normal process with an animal or guest issue?",
        options: [
          { id: "a", label: "Whenever they think it will save time" },
          { id: "b", label: "Only after checking with a lead or admin when needed" },
          { id: "c", label: "Only if no one is watching" },
        ],
        correctOptionId: "b",
        explanation: "Unusual situations should be escalated rather than handled ad hoc.",
      },
      {
        id: "safety-priority",
        prompt: "What should take priority if a situation feels unsafe?",
        options: [
          { id: "a", label: "Finishing the task quickly" },
          { id: "b", label: "Safety for animals, guests, and volunteers" },
          { id: "c", label: "Avoiding interrupting the schedule" },
        ],
        correctOptionId: "b",
        explanation: "Safety overrides convenience and schedule pressure.",
      },
    ],
  },
  {
    id: "cleaning-and-closing",
    title: "Cleaning and Closing Duties",
    audience: ["regular", "lead"],
    description:
      "A placeholder course for cleaning standards, end-of-shift reset, and opening/closing checklists.",
    summary: "Placeholder structure for operational training.",
    estimatedTime: "10-12 min",
    isRequired: true,
    statusLabel: "Build next",
    lessons: [
      {
        id: "closing-placeholder",
        title: "Closing checklist overview",
        duration: "5 min",
        summary: "Add your cleaning and reset walkthrough here.",
        embedUrl: null,
        videoUrl: null,
        takeaways: [
          "Show the exact close-out sequence.",
          "Call out sanitation requirements.",
          "Document what must be left for the next shift.",
        ],
      },
    ],
  },
  {
    id: "lead-handoff-and-escalation",
    title: "Lead Handoff and Escalation",
    audience: ["lead"],
    description:
      "A lead-only course for shift ownership, volunteer guidance, and escalation protocols.",
    summary: "Lead-only dashboard course.",
    estimatedTime: "15-18 min",
    isRequired: true,
    statusLabel: "Lead only",
    lessons: [
      {
        id: "lead-escalation",
        title: "Running the shift and escalating issues",
        duration: "7 min",
        summary: "Add the lead workflow, escalation rules, and communication expectations here.",
        embedUrl: null,
        videoUrl: null,
        takeaways: [
          "Define what leads own during a shift.",
          "Show when to escalate to admin.",
          "Set the standard for volunteer coaching.",
        ],
      },
    ],
  },
  {
    id: "lead-safety-review",
    title: "Lead Safety Review",
    audience: ["lead"],
    description:
      "A lead-only course for higher-stakes safety judgment calls and incident follow-up.",
    summary: "Lead-only safety refresher placeholder.",
    estimatedTime: "8-10 min",
    isRequired: false,
    statusLabel: "Optional",
    lessons: [
      {
        id: "lead-safety-placeholder",
        title: "Lead safety case review",
        duration: "6 min",
        summary: "Add case-study based training here for leads.",
        embedUrl: null,
        videoUrl: null,
        takeaways: [
          "Review real edge cases.",
          "Clarify decision thresholds.",
          "Document follow-up expectations.",
        ],
      },
    ],
  },
];
