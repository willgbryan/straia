import { v4 as uuidv4 } from 'uuid'

/**
 * These enums and type definitions should match those in the editor package
 * Once the analyst.js module is properly exported, we can import these directly
 */
export enum ClarificationStatus {
  Idle = 'IDLE',
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED',
}

export enum AnalystStage {
  Initial = 'INITIAL',
  Clarification = 'CLARIFICATION',
  Result = 'RESULT',
}

export type ClarificationOption = {
  id: string
  label: string
  description?: string
  value: string
  selected: boolean
}

export type Clarification = {
  id: string
  question: string
  options: ClarificationOption[]
  status: ClarificationStatus
  completed: boolean
}

export type AnalystVisualization = {
  type: 'bar_chart' | 'line_chart' | 'pie_chart'
  title: string
  data: Record<string, number>
}

export type AnalystResult = {
  summary: string
  visualizations: AnalystVisualization[]
  methodologyNote: string
}

// Sample education dataset fields - these would be used by the language model
// to understand what data is available for analysis
export const educationDataSchema = {
  students: {
    student_id: 'string',
    first_name: 'string',
    last_name: 'string',
    email: 'string',
    gender: 'string',
    date_of_birth: 'date',
    enrollment_date: 'date',
    expected_graduation: 'date',
    major: 'string',
    gpa: 'number',
    credits_completed: 'number',
    parent_education_level: 'string', // For first-gen identification
    housing_status: 'string', // 'on_campus', 'off_campus'
    zip_code: 'string',
    is_international: 'boolean',
    financial_aid_status: 'string',
  },
  courses: {
    course_id: 'string',
    course_code: 'string',
    course_name: 'string',
    department: 'string', 
    credits: 'number',
    term_id: 'string',
  },
  enrollments: {
    enrollment_id: 'string',
    student_id: 'string',
    course_id: 'string',
    term_id: 'string',
    grade: 'string',
    attendance_rate: 'number',
    last_login: 'date',
    assignment_completion: 'number', // percentage
  },
  advisors: {
    advisor_id: 'string',
    first_name: 'string',
    last_name: 'string',
    department: 'string',
    students_assigned: 'number',
  },
  advising_sessions: {
    session_id: 'string',
    student_id: 'string',
    advisor_id: 'string',
    date: 'date',
    duration_minutes: 'number',
    notes: 'string',
    status: 'string', // 'attended', 'missed', 'rescheduled'
  },
  terms: {
    term_id: 'string',
    name: 'string', // e.g., "Fall 2024"
    start_date: 'date',
    end_date: 'date',
    is_current: 'boolean',
  },
}

// Sample questions for the Analyst block
export const sampleQuestions = [
  "Who are the first-gen commuter students at risk this semester?",
  "What majors have the highest retention rates over the past 3 years?",
  "How does attendance affect GPA for students receiving financial aid?",
  "Which courses have the highest drop rates after the first exam?",
  "Are international students more likely to use tutoring services than domestic students?"
]

// Sample analyses context - these would help the language model understand how to create insights
export const analysisContextExamples = [
  {
    question: "Who are the first-gen commuter students at risk this semester?",
    context: "VP of Enrollment Management needing to identify at-risk students",
    goal: "Target retention interventions more effectively",
    keyDataPoints: [
      "First-generation status (parent education)",
      "Commuter status (housing + ZIP)",
      "Risk factors (GPA, attendance, LMS activity)",
    ],
    relevantVisualizationsTypes: [
      "Breakdown of risk factors",
      "Comparison to overall student body",
      "Geographic distribution"
    ]
  },
  {
    question: "What majors have the highest retention rates?",
    context: "Academic planning committee evaluating program effectiveness",
    goal: "Identify successful practices to implement across departments",
    keyDataPoints: [
      "Retention by major/department",
      "Year-over-year trends",
      "Contributing factors to retention"
    ],
    relevantVisualizationsTypes: [
      "Bar chart of top/bottom majors by retention",
      "Line chart showing trends over time",
      "Correlation with other factors (class size, etc.)"
    ]
  }
]

// Sample clarifications based on the VP of Enrollment Management use case
export const sampleClarifications: Clarification[] = [
  {
    id: uuidv4(),
    question: "When you say 'at risk', what outcome are you concerned about?",
    options: [
      {
        id: uuidv4(),
        label: "🎓 GPA Risk",
        description: "Flag students with GPAs below a defined threshold. This helps assess academic performance concerns.",
        value: "gpa_risk",
        selected: false
      },
      {
        id: uuidv4(),
        label: "🧭 Engagement Risk",
        description: "Looks at LMS activity, advisor check-ins, or missed deadlines. Great for identifying students slipping through the cracks.",
        value: "engagement_risk",
        selected: false
      },
      {
        id: uuidv4(),
        label: "🔁 Retention Risk",
        description: "Predicts likelihood of student departure based on multi-factor indicators.",
        value: "retention_risk",
        selected: false
      }
    ],
    status: ClarificationStatus.InProgress,
    completed: false
  },
  {
    id: uuidv4(),
    question: "Which definition of 'first-gen' would you like to use?",
    options: [
      {
        id: uuidv4(),
        label: "🧬 Parent Education Level = No Bachelor's Degree",
        description: "Common federal definition. Based on self-reported parent education.",
        value: "parent_education",
        selected: false
      },
      {
        id: uuidv4(),
        label: "📄 Self-Identified First-Gen Flag",
        description: "If students indicated 'first-gen' during application or intake.",
        value: "self_identified",
        selected: false
      },
      {
        id: uuidv4(),
        label: "🧠 Institutional Custom Logic",
        description: "Defined by your data team. May include edge cases.",
        value: "custom_logic",
        selected: false
      }
    ],
    status: ClarificationStatus.Idle,
    completed: false
  },
  {
    id: uuidv4(),
    question: "How should we define 'commuter' students?",
    options: [
      {
        id: uuidv4(),
        label: "🏠 Students Living Off-Campus",
        description: "Residence hall status marked as 'off-campus' or 'not in university housing.'",
        value: "off_campus",
        selected: false
      },
      {
        id: uuidv4(),
        label: "🧾 Students with Local ZIP Codes",
        description: "Home ZIP within 30 miles of campus (e.g. for urban schools).",
        value: "local_zip",
        selected: false
      },
      {
        id: uuidv4(),
        label: "📊 Hybrid Method (Recommended)",
        description: "Combines housing + ZIP code logic. Captures most commuters accurately.",
        value: "hybrid",
        selected: false
      }
    ],
    status: ClarificationStatus.Idle,
    completed: false
  },
  {
    id: uuidv4(),
    question: "Which term should we use for 'this semester'?",
    options: [
      {
        id: uuidv4(),
        label: "📅 Spring 2025 (in progress)",
        description: "Use current registration, attendance, and activity.",
        value: "spring_2025",
        selected: false
      },
      {
        id: uuidv4(),
        label: "📈 Fall 2024 (most recently completed)",
        description: "More complete outcomes data is available (grades, retention).",
        value: "fall_2024",
        selected: false
      }
    ],
    status: ClarificationStatus.Idle,
    completed: false
  }
]

// Sample results based on the VP of Enrollment Management use case
export const sampleResults = {
  summary: "First-gen commuter students are currently retaining at 76%, compared to 84% for all undergraduates this semester. Predictive risk indicators suggest a higher chance of departure, particularly among students who: missed 2+ advising check-ins, have not logged into LMS in past 10 days, or are enrolled in fewer than 12 credit hours.",
  visualizations: [
    {
      type: "bar_chart" as const,
      title: "Retention Rate: First-Gen Commuters vs. All Undergraduates",
      data: {
        "First-Gen Commuters": 76,
        "All Undergraduates": 84
      }
    },
    {
      type: "bar_chart" as const,
      title: "Risk Factors Among First-Gen Commuter Students",
      data: {
        "Missed Advising Check-ins": 42,
        "Low LMS Activity": 38,
        "Low Credit Hours": 29
      }
    }
  ],
  methodologyNote: "Retention is calculated as re-enrollment in the next consecutive term. Students are defined as first-gen using parent education, and as commuters using a hybrid model (off-campus + ZIP codes). Risk prediction is based on historical patterns of student engagement and academic progress."
} 