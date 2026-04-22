import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_LANGUAGE, STEM_PROBLEMS } from './data/problems'
import { communityService, type CommunityUser, type LeaderboardEntry, type ReviewInput, type ReviewQueueItem } from './lib/community'
import { runJudge } from './lib/judge'
import { getStarterCode } from './lib/starter-code'
import { computeSubmissionScore } from './lib/scoring'
import type {
  Difficulty,
  JudgeResult,
  Language,
  SubmissionRecord,
  StemProblem,
} from './types'

type PanelTab = 'description' | 'editorial' | 'submissions' | 'notes' | 'proof'
type TopView =
  | 'problems'
  | 'daily'
  | 'contest'
  | 'mock'
  | 'profile'
  | 'teams'
  | 'submission-detail'
  | 'leaderboard'
  | 'reviews'
  | 'progress'
  | 'discuss'
  | 'plans'
type AuthMode = 'signin' | 'signup'
type StatusFilter = 'All' | 'Solved' | 'Attempted' | 'Unsolved'
type SortField = 'id' | 'title' | 'difficulty' | 'acceptance' | 'status'

interface AchievementCard {
  id: string
  title: string
  description: string
  unlocked: boolean
  progressLabel: string
}

interface TeamMember {
  userId: string
  username: string
  joinedAt: string
}

interface TeamSpace {
  id: string
  name: string
  ownerId: string
  inviteCode: string
  isPrivate: boolean
  createdAt: string
  members: TeamMember[]
}

interface ContestStandingRow {
  id: string
  username: string
  solved: number
  penalty: number
  bestRuntime: number
  lastAcceptedAtMs: number
  predictedDelta: number
  isCurrentUser: boolean
}

interface ReviewDraft {
  verdict: ReviewInput['verdict']
  correctnessScore: number
  explanationScore: number
  rigorScore: number
  comment: string
}

interface DiscussionReply {
  id: string
  author: string
  body: string
  createdAt: string
}

interface DiscussionThread {
  id: string
  problemId: string
  title: string
  body: string
  author: string
  createdAt: string
  votes: string[]
  replies: DiscussionReply[]
}

interface StudyPlan {
  id: string
  title: string
  summary: string
  problemIds: string[]
}

interface ProofChecklist {
  theoremBuilt: boolean
  edgeCasesCovered: boolean
  complexityArgued: boolean
  finalReviewDone: boolean
}

interface TopicRating {
  rating: number
  sessions: number
  updatedAt: string
}

interface TopicRatingDelta {
  topic: string
  solved: number
  total: number
  delta: number
  ratingAfter: number
}

interface RatingEvent {
  id: string
  mode: 'contest' | 'mock'
  startedAt: string
  endedAt: string
  solved: number
  total: number
  acceptedRate: number
  proofRate: number
  delta: number
  ratingAfter: number
  topicDeltas: TopicRatingDelta[]
}

interface RatingProfile {
  rating: number
  sessions: number
  history: RatingEvent[]
  topicRatings: Record<string, TopicRating>
}

const SOURCE_STORAGE_KEY = 'stem-leet-code:sources:v1'
const SUBMISSION_STORAGE_KEY = 'stem-leet-code:submissions:v1'
const BOOKMARK_STORAGE_KEY = 'stem-leet-code:bookmarks:v1'
const NOTES_STORAGE_KEY = 'stem-leet-code:notes:v1'
const PROOF_NOTES_STORAGE_KEY = 'stem-leet-code:proof-notes:v1'
const PROOF_CHECKLIST_STORAGE_KEY = 'stem-leet-code:proof-checklist:v1'
const HINT_REVEALS_STORAGE_KEY = 'stem-leet-code:hint-reveals:v1'
const CONTEST_START_STORAGE_KEY = 'stem-leet-code:contest-start:v1'
const MOCK_START_STORAGE_KEY = 'stem-leet-code:mock-start:v1'
const MOCK_PROBLEMS_STORAGE_KEY = 'stem-leet-code:mock-problems:v1'
const MOCK_TOPIC_STORAGE_KEY = 'stem-leet-code:mock-topic:v1'
const MOCK_DURATION_STORAGE_KEY = 'stem-leet-code:mock-duration:v1'
const MOCK_COMPANY_TRACK_STORAGE_KEY = 'stem-leet-code:mock-company-track:v1'
const RATING_PROFILE_STORAGE_KEY = 'stem-leet-code:rating-profile:v1'
const DISCUSSION_STORAGE_KEY = 'stem-leet-code:discussion:v1'
const DISCUSSION_VOTER_KEY = 'stem-leet-code:discussion-voter:v1'
const TEAM_SPACES_STORAGE_KEY = 'stem-leet-code:teams:v1'
const ACTIVE_TEAM_STORAGE_KEY = 'stem-leet-code:active-team:v1'
const BASE_RATING = 1500

const languageLabels: Record<Language, string> = {
  javascript: 'JavaScript',
  python: 'Python',
  cpp: 'C++',
  java: 'Java',
  lean4: 'Lean4',
}

const defaultReviewDraft: ReviewDraft = {
  verdict: 'approve',
  correctnessScore: 8,
  explanationScore: 8,
  rigorScore: 8,
  comment: '',
}

const STUDY_PLANS: StudyPlan[] = [
  {
    id: 'plan-group-core',
    title: 'Group Theory Core',
    summary: 'From additive groups to cyclic generators, inverses, and subgroup criteria.',
    problemIds: ['STEM-701', 'STEM-702', 'STEM-704', 'STEM-705', 'STEM-751', 'STEM-752', 'STEM-755', 'STEM-756', 'STEM-757', 'STEM-758'],
  },
  {
    id: 'plan-linear-core',
    title: 'Linear Algebra Core',
    summary: 'Determinants, systems, matrix products, orthogonality, and eigen basics.',
    problemIds: ['STEM-711', 'STEM-712', 'STEM-713', 'STEM-714', 'STEM-715', 'STEM-761', 'STEM-762', 'STEM-765', 'STEM-766', 'STEM-767', 'STEM-768'],
  },
  {
    id: 'plan-prob-stats',
    title: 'Probability + Statistics',
    summary: 'Discrete distributions, Bayes, expectation, confidence intervals, and correlations.',
    problemIds: [
      'STEM-721',
      'STEM-722',
      'STEM-723',
      'STEM-724',
      'STEM-725',
      'STEM-731',
      'STEM-732',
      'STEM-733',
      'STEM-734',
      'STEM-735',
      'STEM-775',
      'STEM-776',
      'STEM-777',
      'STEM-778',
      'STEM-785',
      'STEM-786',
      'STEM-787',
      'STEM-788',
    ],
  },
  {
    id: 'plan-regression-track',
    title: 'Regression Analysis Track',
    summary: 'Loss metrics, line fitting, slope/intercept, R^2, and model error diagnostics.',
    problemIds: ['STEM-771', 'STEM-772', 'STEM-773', 'STEM-774', 'STEM-791', 'STEM-792', 'STEM-793', 'STEM-794', 'STEM-795', 'STEM-796', 'STEM-797', 'STEM-798'],
  },
]

const COMPANY_TRACKS = [
  'All',
  'Jane Street Quant',
  'DeepMind Formal',
  'NVIDIA Applied Math',
  'Google Research ML',
  'SpaceX Robotics',
] as const

type CompanyTrack = typeof COMPANY_TRACKS[number]

interface CompanyMockTemplate {
  title: string
  summary: string
  problemIds: string[]
}

const COMPANY_MOCK_TEMPLATES: Record<CompanyTrack, CompanyMockTemplate> = {
  All: {
    title: 'Interdisciplinary Finals Set',
    summary: 'Balanced hard set across algebra, probability, statistics, and regression.',
    problemIds: ['STEM-758', 'STEM-767', 'STEM-776', 'STEM-788', 'STEM-797', 'STEM-806'],
  },
  'Jane Street Quant': {
    title: 'Quant Interview Circuit',
    summary: 'Probability tails, inference rigor, and high-pressure numeric precision.',
    problemIds: ['STEM-752', 'STEM-776', 'STEM-787', 'STEM-788', 'STEM-803', 'STEM-806'],
  },
  'DeepMind Formal': {
    title: 'Formal Reasoning Sprint',
    summary: 'Group and linear algebra problems aligned with theorem-driven workflows.',
    problemIds: ['STEM-755', 'STEM-758', 'STEM-799', 'STEM-800', 'STEM-767', 'STEM-802'],
  },
  'NVIDIA Applied Math': {
    title: 'Applied Math Systems Set',
    summary: 'Linear algebra stability, matrix mechanics, and optimization diagnostics.',
    problemIds: ['STEM-767', 'STEM-801', 'STEM-802', 'STEM-803', 'STEM-807', 'STEM-808'],
  },
  'Google Research ML': {
    title: 'ML Foundations Drill',
    summary: 'Statistics + probabilistic modeling with regression objective stress tests.',
    problemIds: ['STEM-776', 'STEM-803', 'STEM-804', 'STEM-806', 'STEM-807', 'STEM-808'],
  },
  'SpaceX Robotics': {
    title: 'Robotics Control Gauntlet',
    summary: 'Control math under constraints: robotics pathing, dynamics, and state uncertainty.',
    problemIds: ['STEM-623', 'STEM-767', 'STEM-801', 'STEM-802', 'STEM-805', 'STEM-806'],
  },
}

interface RatingTier {
  label: string
  className: string
}

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as T
    return parsed
  } catch {
    return fallback
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore quota/serialization issues for local persistence.
  }
}

function ratingTierFor(rating: number): RatingTier {
  if (rating >= 2300) return { label: 'Grandmaster', className: 'tier-grandmaster' }
  if (rating >= 2000) return { label: 'Master', className: 'tier-master' }
  if (rating >= 1800) return { label: 'Expert', className: 'tier-expert' }
  if (rating >= 1600) return { label: 'Specialist', className: 'tier-specialist' }
  if (rating >= 1400) return { label: 'Scholar', className: 'tier-scholar' }
  if (rating >= 1200) return { label: 'Apprentice', className: 'tier-apprentice' }
  return { label: 'Novice', className: 'tier-novice' }
}

const DEFAULT_RATING_PROFILE: RatingProfile = {
  rating: BASE_RATING,
  sessions: 0,
  history: [],
  topicRatings: {},
}

function normalizeRatingProfile(profile: RatingProfile | null): RatingProfile {
  if (!profile) return DEFAULT_RATING_PROFILE

  return {
    rating: Number.isFinite(profile.rating) ? Math.round(profile.rating) : BASE_RATING,
    sessions: Number.isFinite(profile.sessions) ? Math.max(0, Math.round(profile.sessions)) : 0,
    history: Array.isArray(profile.history)
      ? profile.history.map((event) => ({
          ...event,
          topicDeltas: event.topicDeltas ?? [],
        }))
      : [],
    topicRatings: profile.topicRatings ?? {},
  }
}

function difficultyClass(difficulty: Difficulty): string {
  if (difficulty === 'Easy') return 'diff-easy'
  if (difficulty === 'Medium') return 'diff-medium'
  return 'diff-hard'
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function buildKey(problemId: string, language: Language): string {
  return `${problemId}::${language}`
}

function ensureSourceMap(problem: StemProblem, language: Language, sources: Record<string, string>): Record<string, string> {
  const key = buildKey(problem.id, language)
  if (sources[key]) return sources
  return {
    ...sources,
    [key]: getStarterCode(problem, language),
  }
}

function scoreChipClass(score: number): string {
  if (score >= 85) return 'score-chip high'
  if (score >= 55) return 'score-chip medium'
  return 'score-chip low'
}

function toDateKey(input: Date): string {
  return input.toISOString().slice(0, 10)
}

function dailyProblemForDate(date: Date): StemProblem {
  const dayIndex = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000)
  return STEM_PROBLEMS[((dayIndex % STEM_PROBLEMS.length) + STEM_PROBLEMS.length) % STEM_PROBLEMS.length]
}

function createContestProblemSet(seed: number, count: number): StemProblem[] {
  const picked: StemProblem[] = []
  const used = new Set<number>()
  let state = seed >>> 0

  while (picked.length < Math.min(count, STEM_PROBLEMS.length)) {
    state = (1664525 * state + 1013904223) >>> 0
    const index = state % STEM_PROBLEMS.length
    if (used.has(index)) continue
    used.add(index)
    picked.push(STEM_PROBLEMS[index])
  }

  return picked
}

function minutesAndSeconds(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function stringHash(input: string): number {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0
  }
  return hash
}

function companyTracksForProblem(problem: StemProblem): CompanyTrack[] {
  const tracks = new Set<CompanyTrack>()
  tracks.add('All')

  if (['Probability Theory', 'Statistics', 'Regression Analysis'].includes(problem.topic)) {
    tracks.add('Jane Street Quant')
    tracks.add('Google Research ML')
  }

  if (['Linear Algebra', 'Signal Processing'].includes(problem.topic)) {
    tracks.add('NVIDIA Applied Math')
    tracks.add('Google Research ML')
  }

  if (['Robotics', 'Physics', 'Electrical Engineering'].includes(problem.topic)) {
    tracks.add('SpaceX Robotics')
  }

  const hasFormalSignal = problem.tags.some(
    (tag) => tag.toLowerCase().includes('proof') || tag.toLowerCase().includes('lean')
  )
  if (hasFormalSignal || ['Group Theory', 'Linear Algebra'].includes(problem.topic)) {
    tracks.add('DeepMind Formal')
  }

  return Array.from(tracks)
}

export default function App() {
  const [view, setView] = useState<TopView>('problems')
  const [query, setQuery] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState<'All' | Difficulty>('All')
  const [topicFilter, setTopicFilter] = useState<'All' | string>('All')
  const [tagFilter, setTagFilter] = useState<'All' | string>('All')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [sortField, setSortField] = useState<SortField>('id')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [bookmarkOnly, setBookmarkOnly] = useState(false)
  const [selectedProblemId, setSelectedProblemId] = useState(STEM_PROBLEMS[0]?.id ?? '')
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null)
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE)
  const [activeTab, setActiveTab] = useState<PanelTab>('description')
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null)
  const [lastAction, setLastAction] = useState<'Run' | 'Submit' | null>(null)
  const [nowTs, setNowTs] = useState(() => Date.now())

  const [sources, setSources] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    return safeRead<Record<string, string>>(SOURCE_STORAGE_KEY, {})
  })

  const [submissions, setSubmissions] = useState<SubmissionRecord[]>(() => {
    if (typeof window === 'undefined') return []
    return safeRead<SubmissionRecord[]>(SUBMISSION_STORAGE_KEY, [])
  })

  const [bookmarks, setBookmarks] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    return safeRead<string[]>(BOOKMARK_STORAGE_KEY, [])
  })

  const [notes, setNotes] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    return safeRead<Record<string, string>>(NOTES_STORAGE_KEY, {})
  })

  const [proofNotes, setProofNotes] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    return safeRead<Record<string, string>>(PROOF_NOTES_STORAGE_KEY, {})
  })
  const [proofChecklist, setProofChecklist] = useState<Record<string, ProofChecklist>>(() => {
    if (typeof window === 'undefined') return {}
    return safeRead<Record<string, ProofChecklist>>(PROOF_CHECKLIST_STORAGE_KEY, {})
  })

  const [hintReveals, setHintReveals] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {}
    return safeRead<Record<string, number>>(HINT_REVEALS_STORAGE_KEY, {})
  })

  const [contestStartAt, setContestStartAt] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return safeRead<string | null>(CONTEST_START_STORAGE_KEY, null)
  })

  const [mockStartAt, setMockStartAt] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return safeRead<string | null>(MOCK_START_STORAGE_KEY, null)
  })
  const [mockProblemIds, setMockProblemIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    return safeRead<string[]>(MOCK_PROBLEMS_STORAGE_KEY, [])
  })
  const [mockTopic, setMockTopic] = useState<'All' | string>(() => {
    if (typeof window === 'undefined') return 'All'
    return safeRead<'All' | string>(MOCK_TOPIC_STORAGE_KEY, 'All')
  })
  const [mockCompanyTrack, setMockCompanyTrack] = useState<CompanyTrack>(() => {
    if (typeof window === 'undefined') return 'All'
    return safeRead<CompanyTrack>(MOCK_COMPANY_TRACK_STORAGE_KEY, 'All')
  })
  const [mockDurationMinutes, setMockDurationMinutes] = useState<number>(() => {
    if (typeof window === 'undefined') return 120
    return safeRead<number>(MOCK_DURATION_STORAGE_KEY, 120)
  })
  const [ratingProfile, setRatingProfile] = useState<RatingProfile>(() => {
    if (typeof window === 'undefined') return DEFAULT_RATING_PROFILE
    return normalizeRatingProfile(safeRead<RatingProfile | null>(RATING_PROFILE_STORAGE_KEY, null))
  })

  const [discussionThreads, setDiscussionThreads] = useState<DiscussionThread[]>(() => {
    if (typeof window === 'undefined') return []
    return safeRead<DiscussionThread[]>(DISCUSSION_STORAGE_KEY, [])
  })
  const [discussionProblemFilter, setDiscussionProblemFilter] = useState<'All' | string>('All')
  const [discussionComposeProblemId, setDiscussionComposeProblemId] = useState(STEM_PROBLEMS[0]?.id ?? '')
  const [newThreadTitle, setNewThreadTitle] = useState('')
  const [newThreadBody, setNewThreadBody] = useState('')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [discussionVoterId] = useState(() => {
    if (typeof window === 'undefined') return 'guest-anon'
    const existing = safeRead<string | null>(DISCUSSION_VOTER_KEY, null)
    if (existing) return existing
    const next = `guest-${Math.random().toString(36).slice(2, 10)}`
    safeWrite(DISCUSSION_VOTER_KEY, next)
    return next
  })

  const [teamSpaces, setTeamSpaces] = useState<TeamSpace[]>(() => {
    if (typeof window === 'undefined') return []
    return safeRead<TeamSpace[]>(TEAM_SPACES_STORAGE_KEY, [])
  })
  const [activeTeamId, setActiveTeamId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return safeRead<string | null>(ACTIVE_TEAM_STORAGE_KEY, null)
  })
  const [createTeamName, setCreateTeamName] = useState('')
  const [createTeamPrivate, setCreateTeamPrivate] = useState(true)
  const [joinTeamCode, setJoinTeamCode] = useState('')

  const [currentUser, setCurrentUser] = useState<CommunityUser | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([])
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({})
  const [reviewSubmittingId, setReviewSubmittingId] = useState<string | null>(null)

  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authUsername, setAuthUsername] = useState('')

  const [communityLoading, setCommunityLoading] = useState(false)
  const [communityMessage, setCommunityMessage] = useState<string | null>(null)

  const acceptedProblemIds = useMemo(() => {
    const solved = new Set<string>()
    for (const submission of submissions) {
      if (submission.status === 'Accepted') solved.add(submission.problemId)
    }
    return solved
  }, [submissions])

  const attemptedProblemIds = useMemo(() => {
    return new Set(submissions.map((submission) => submission.problemId))
  }, [submissions])

  const availableTopics = useMemo(() => {
    return ['All', ...Array.from(new Set(STEM_PROBLEMS.map((problem) => problem.topic))).sort()]
  }, [])

  const availableTags = useMemo(() => {
    return ['All', ...Array.from(new Set(STEM_PROBLEMS.flatMap((problem) => problem.tags))).sort()]
  }, [])

  const filteredProblems = useMemo(() => {
    return STEM_PROBLEMS.filter((problem) => {
      if (difficultyFilter !== 'All' && problem.difficulty !== difficultyFilter) return false
      if (topicFilter !== 'All' && problem.topic !== topicFilter) return false
      if (tagFilter !== 'All' && !problem.tags.includes(tagFilter)) return false
      if (bookmarkOnly && !bookmarks.includes(problem.id)) return false

      const isSolved = acceptedProblemIds.has(problem.id)
      const isAttempted = attemptedProblemIds.has(problem.id)
      if (statusFilter === 'Solved' && !isSolved) return false
      if (statusFilter === 'Attempted' && (!isAttempted || isSolved)) return false
      if (statusFilter === 'Unsolved' && isAttempted) return false

      if (!query.trim()) return true
      const needle = query.toLowerCase()
      return (
        problem.title.toLowerCase().includes(needle) ||
        problem.topic.toLowerCase().includes(needle) ||
        problem.tags.some((tag) => tag.toLowerCase().includes(needle))
      )
    })
  }, [
    acceptedProblemIds,
    attemptedProblemIds,
    bookmarkOnly,
    bookmarks,
    difficultyFilter,
    query,
    statusFilter,
    tagFilter,
    topicFilter,
  ])

  const sortedProblems = useMemo(() => {
    const list = [...filteredProblems]
    const direction = sortDirection === 'asc' ? 1 : -1
    const difficultyWeight: Record<Difficulty, number> = { Easy: 1, Medium: 2, Hard: 3 }

    const statusValueFor = (problem: StemProblem): number => {
      if (acceptedProblemIds.has(problem.id)) return 3
      if (attemptedProblemIds.has(problem.id)) return 2
      return 1
    }

    list.sort((a, b) => {
      if (sortField === 'id') return a.id.localeCompare(b.id) * direction
      if (sortField === 'title') return a.title.localeCompare(b.title) * direction
      if (sortField === 'difficulty') return (difficultyWeight[a.difficulty] - difficultyWeight[b.difficulty]) * direction
      if (sortField === 'acceptance') return (a.acceptance - b.acceptance) * direction
      return (statusValueFor(a) - statusValueFor(b)) * direction || a.id.localeCompare(b.id)
    })

    return list
  }, [acceptedProblemIds, attemptedProblemIds, filteredProblems, sortDirection, sortField])

  const companyTagsByProblemId = useMemo(() => {
    return new Map(STEM_PROBLEMS.map((problem) => [problem.id, companyTracksForProblem(problem)] as const))
  }, [])

  const selectedProblem =
    STEM_PROBLEMS.find((problem) => problem.id === selectedProblemId) ??
    sortedProblems[0] ??
    STEM_PROBLEMS[0]
  const selectedProblemNote = notes[selectedProblem.id] ?? ''
  const selectedProofNote = proofNotes[selectedProblem.id] ?? ''
  const selectedProofChecklist = proofChecklist[selectedProblem.id] ?? {
    theoremBuilt: false,
    edgeCasesCovered: false,
    complexityArgued: false,
    finalReviewDone: false,
  }
  const selectedCompanyTracks = (companyTagsByProblemId.get(selectedProblem.id) ?? ['All']).filter((track) => track !== 'All')
  const revealedHints = hintReveals[selectedProblem.id] ?? 0
  const isBookmarked = bookmarks.includes(selectedProblem.id)

  const currentSourceKey = buildKey(selectedProblem.id, language)
  const currentSource = sources[currentSourceKey] ?? getStarterCode(selectedProblem, language)

  const scopedSubmissions = useMemo(() => {
    return submissions.filter((submission) => submission.problemId === selectedProblem.id)
  }, [selectedProblem.id, submissions])

  const solvedCount = acceptedProblemIds.size

  const dailyProblem = useMemo(() => dailyProblemForDate(new Date(nowTs)), [nowTs])
  const dailyDateKey = useMemo(() => toDateKey(new Date(nowTs)), [nowTs])
  const dailySolvedToday = useMemo(() => {
    return submissions.some(
      (submission) =>
        submission.status === 'Accepted' &&
        submission.problemId === dailyProblem.id &&
        submission.submittedAt.slice(0, 10) === dailyDateKey
    )
  }, [dailyDateKey, dailyProblem.id, submissions])

  const dailyStreak = useMemo(() => {
    const acceptedMap = new Map<string, Set<string>>()
    for (const submission of submissions) {
      if (submission.status !== 'Accepted') continue
      const dateKey = submission.submittedAt.slice(0, 10)
      const set = acceptedMap.get(dateKey) ?? new Set<string>()
      set.add(submission.problemId)
      acceptedMap.set(dateKey, set)
    }

    let streak = 0
    const cursor = new Date(Date.UTC(
      new Date(nowTs).getUTCFullYear(),
      new Date(nowTs).getUTCMonth(),
      new Date(nowTs).getUTCDate()
    ))

    while (true) {
      const dateKey = toDateKey(cursor)
      const targetProblem = dailyProblemForDate(cursor).id
      const solvedSet = acceptedMap.get(dateKey)
      if (!solvedSet || !solvedSet.has(targetProblem)) break
      streak += 1
      cursor.setUTCDate(cursor.getUTCDate() - 1)
    }

    return streak
  }, [nowTs, submissions])

  const contestProblems = useMemo(() => {
    const date = new Date(nowTs)
    const dayIndex = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000)
    const weekSeed = Math.floor(dayIndex / 7) + 911
    return createContestProblemSet(weekSeed, 4)
  }, [nowTs])

  const contestDurationMs = 90 * 60 * 1000
  const contestRemainingMs = useMemo(() => {
    if (!contestStartAt) return contestDurationMs
    const elapsed = nowTs - new Date(contestStartAt).getTime()
    return Math.max(0, contestDurationMs - elapsed)
  }, [contestDurationMs, contestStartAt, nowTs])

  const contestSubmissionScope = useMemo(() => {
    if (!contestStartAt) return []
    const start = new Date(contestStartAt).getTime()
    const contestIds = new Set(contestProblems.map((problem) => problem.id))
    return submissions.filter(
      (submission) =>
        contestIds.has(submission.problemId) &&
        new Date(submission.submittedAt).getTime() >= start
    )
  }, [contestProblems, contestStartAt, submissions])

  const contestSolvedCount = useMemo(() => {
    const solved = new Set<string>()
    for (const submission of contestSubmissionScope) {
      if (submission.status === 'Accepted') solved.add(submission.problemId)
    }
    return solved.size
  }, [contestSubmissionScope])

  const hardProblems = useMemo(() => {
    return STEM_PROBLEMS.filter((problem) => problem.difficulty === 'Hard')
  }, [])

  const mockAvailableTopics = useMemo(() => {
    return ['All', ...Array.from(new Set(hardProblems.map((problem) => problem.topic))).sort()]
  }, [hardProblems])

  const mockProblems = useMemo(() => {
    return mockProblemIds
      .map((problemId) => STEM_PROBLEMS.find((problem) => problem.id === problemId))
      .filter((problem): problem is StemProblem => Boolean(problem))
  }, [mockProblemIds])

  const mockDurationMs = mockDurationMinutes * 60 * 1000
  const activeMockTemplate = COMPANY_MOCK_TEMPLATES[mockCompanyTrack]
  const mockRemainingMs = useMemo(() => {
    if (!mockStartAt) return mockDurationMs
    const elapsed = nowTs - new Date(mockStartAt).getTime()
    return Math.max(0, mockDurationMs - elapsed)
  }, [mockDurationMs, mockStartAt, nowTs])

  const mockSubmissionScope = useMemo(() => {
    if (!mockStartAt || mockProblems.length === 0) return []
    const start = new Date(mockStartAt).getTime()
    const mockIds = new Set(mockProblems.map((problem) => problem.id))
    return submissions.filter(
      (submission) =>
        mockIds.has(submission.problemId) &&
        new Date(submission.submittedAt).getTime() >= start
    )
  }, [mockProblems, mockStartAt, submissions])

  const mockSolvedCount = useMemo(() => {
    const solved = new Set<string>()
    for (const submission of mockSubmissionScope) {
      if (submission.status === 'Accepted') solved.add(submission.problemId)
    }
    return solved.size
  }, [mockSubmissionScope])

  const leanSourceChecks = useMemo(() => {
    if (language !== 'lean4') {
      return {
        hasDefinition: false,
        hasTheoremOrLemma: false,
        hasSorryOrAdmit: false,
        hasJsBridge: false,
      }
    }

    const escapedName = selectedProblem.functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const hasDefinition = new RegExp(`\\bdef\\s+${escapedName}\\b`).test(currentSource)
    const hasTheoremOrLemma = /\b(theorem|lemma)\s+[A-Za-z0-9_']+\b[\s\S]*?:=\s*by/.test(currentSource)
    const hasSorryOrAdmit = /\b(sorry|admit)\b/.test(currentSource)
    const hasJsBridge = /\/-\!\s*JS_SOLVER[\s\S]*-\//m.test(currentSource)

    return {
      hasDefinition,
      hasTheoremOrLemma,
      hasSorryOrAdmit,
      hasJsBridge,
    }
  }, [currentSource, language, selectedProblem.functionName])

  const progressByDifficulty = useMemo(() => {
    const totals: Record<Difficulty, number> = { Easy: 0, Medium: 0, Hard: 0 }
    const solved: Record<Difficulty, number> = { Easy: 0, Medium: 0, Hard: 0 }

    for (const problem of STEM_PROBLEMS) {
      totals[problem.difficulty] += 1
      if (acceptedProblemIds.has(problem.id)) solved[problem.difficulty] += 1
    }

    return { totals, solved }
  }, [acceptedProblemIds])

  const progressByTopic = useMemo(() => {
    const topicMap = new Map<string, { total: number; solved: number }>()
    for (const problem of STEM_PROBLEMS) {
      const next = topicMap.get(problem.topic) ?? { total: 0, solved: 0 }
      next.total += 1
      if (acceptedProblemIds.has(problem.id)) next.solved += 1
      topicMap.set(problem.topic, next)
    }

    return Array.from(topicMap.entries())
      .map(([topic, stats]) => ({ topic, ...stats }))
      .sort((a, b) => b.solved - a.solved || a.topic.localeCompare(b.topic))
  }, [acceptedProblemIds])

  const problemStatusMap = useMemo(() => {
    const map = new Map<string, StatusFilter>()
    for (const problem of STEM_PROBLEMS) {
      if (acceptedProblemIds.has(problem.id)) {
        map.set(problem.id, 'Solved')
      } else if (attemptedProblemIds.has(problem.id)) {
        map.set(problem.id, 'Attempted')
      } else {
        map.set(problem.id, 'Unsolved')
      }
    }
    return map
  }, [acceptedProblemIds, attemptedProblemIds])

  const currentLeaderboardRank = useMemo(() => {
    if (!currentUser) return null
    const entry = leaderboard.find((item) => item.id === currentUser.id)
    return entry?.rank ?? null
  }, [currentUser, leaderboard])

  const problemById = useMemo(() => {
    return new Map(STEM_PROBLEMS.map((problem) => [problem.id, problem] as const))
  }, [])

  const discussionViewerId = currentUser?.id ?? discussionVoterId
  const discussionPosts = useMemo(() => {
    const scoped = discussionProblemFilter === 'All'
      ? discussionThreads
      : discussionThreads.filter((thread) => thread.problemId === discussionProblemFilter)

    return [...scoped].sort((a, b) => {
      if (b.votes.length !== a.votes.length) return b.votes.length - a.votes.length
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [discussionProblemFilter, discussionThreads])

  const studyPlanProgress = useMemo(() => {
    return STUDY_PLANS.map((plan) => {
      const validProblemIds = plan.problemIds.filter((problemId) => problemById.has(problemId))
      const solved = validProblemIds.filter((problemId) => acceptedProblemIds.has(problemId)).length
      const total = validProblemIds.length
      const ratio = total === 0 ? 0 : Math.round((solved / total) * 100)
      const nextProblemId = validProblemIds.find((problemId) => !acceptedProblemIds.has(problemId)) ?? null
      return {
        ...plan,
        validProblemIds,
        solved,
        total,
        ratio,
        nextProblemId,
      }
    })
  }, [acceptedProblemIds, problemById])

  const latestRatingEvent = ratingProfile.history[0] ?? null
  const latestContestEvent = ratingProfile.history.find((event) => event.mode === 'contest') ?? null
  const latestMockEvent = ratingProfile.history.find((event) => event.mode === 'mock') ?? null
  const currentRatingTier = ratingTierFor(ratingProfile.rating)
  const acceptedSubmissions = useMemo(() => {
    return submissions.filter((submission) => submission.status === 'Accepted')
  }, [submissions])

  const acceptedCountsByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const submission of acceptedSubmissions) {
      const key = submission.submittedAt.slice(0, 10)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [acceptedSubmissions])

  const activePracticeStreak = useMemo(() => {
    let streak = 0
    const cursor = new Date(Date.UTC(
      new Date(nowTs).getUTCFullYear(),
      new Date(nowTs).getUTCMonth(),
      new Date(nowTs).getUTCDate()
    ))

    while (true) {
      const key = toDateKey(cursor)
      const count = acceptedCountsByDate.get(key) ?? 0
      if (count <= 0) break
      streak += 1
      cursor.setUTCDate(cursor.getUTCDate() - 1)
    }

    return streak
  }, [acceptedCountsByDate, nowTs])

  const practiceActivityDays = useMemo(() => {
    const days: Array<{ dateKey: string; count: number; intensity: 0 | 1 | 2 | 3 | 4 }> = []
    for (let i = 83; i >= 0; i -= 1) {
      const day = new Date(nowTs)
      day.setHours(0, 0, 0, 0)
      day.setDate(day.getDate() - i)
      const dateKey = toDateKey(day)
      const count = acceptedCountsByDate.get(dateKey) ?? 0
      const intensity: 0 | 1 | 2 | 3 | 4 =
        count <= 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count === 3 ? 3 : 4
      days.push({ dateKey, count, intensity })
    }
    return days
  }, [acceptedCountsByDate, nowTs])

  const languagePerformanceRows = useMemo(() => {
    const rows = new Map<Language, { attempts: number; accepted: number; runtimeTotal: number }>()
    for (const languageKey of Object.keys(languageLabels) as Language[]) {
      rows.set(languageKey, { attempts: 0, accepted: 0, runtimeTotal: 0 })
    }

    for (const submission of submissions) {
      const current = rows.get(submission.language)
      if (!current) continue
      current.attempts += 1
      if (submission.status === 'Accepted') {
        current.accepted += 1
        current.runtimeTotal += submission.runtimeMs
      }
    }

    return (Object.keys(languageLabels) as Language[])
      .map((languageKey) => {
        const current = rows.get(languageKey) ?? { attempts: 0, accepted: 0, runtimeTotal: 0 }
        return {
          language: languageKey,
          attempts: current.attempts,
          accepted: current.accepted,
          acceptedRate: current.attempts === 0 ? 0 : Math.round((current.accepted / current.attempts) * 100),
          avgRuntime: current.accepted === 0 ? null : Math.round(current.runtimeTotal / current.accepted),
        }
      })
      .sort((a, b) => b.attempts - a.attempts || a.language.localeCompare(b.language))
  }, [submissions])

  const topicRatingRows = useMemo(() => {
    const topics = Array.from(new Set(STEM_PROBLEMS.map((problem) => problem.topic)))
    return topics
      .map((topic) => {
        const record = ratingProfile.topicRatings[topic] ?? {
          rating: BASE_RATING,
          sessions: 0,
          updatedAt: '',
        }
        return {
          topic,
          rating: record.rating,
          sessions: record.sessions,
          tier: ratingTierFor(record.rating),
        }
      })
      .sort((a, b) => b.rating - a.rating || b.sessions - a.sessions || a.topic.localeCompare(b.topic))
  }, [ratingProfile.topicRatings])

  const hardSolvedCount = useMemo(() => {
    return STEM_PROBLEMS.filter((problem) => problem.difficulty === 'Hard' && acceptedProblemIds.has(problem.id)).length
  }, [acceptedProblemIds])

  const solvedTopicCount = useMemo(() => {
    return progressByTopic.filter((row) => row.solved > 0).length
  }, [progressByTopic])

  const completedPlansCount = useMemo(() => {
    return studyPlanProgress.filter((plan) => plan.total > 0 && plan.solved === plan.total).length
  }, [studyPlanProgress])

  const leanAcceptedCount = useMemo(() => {
    return submissions.filter((submission) => submission.language === 'lean4' && submission.status === 'Accepted').length
  }, [submissions])

  const solvedBookmarkedCount = useMemo(() => {
    return bookmarks.filter((problemId) => acceptedProblemIds.has(problemId)).length
  }, [acceptedProblemIds, bookmarks])

  const bookmarkedProblems = useMemo(() => {
    return bookmarks
      .map((problemId) => problemById.get(problemId))
      .filter((problem): problem is StemProblem => Boolean(problem))
  }, [bookmarks, problemById])

  const achievementCards = useMemo<AchievementCard[]>(() => {
    const reviewScore = currentUser?.reviewScore ?? 0
    const totalSubmissions = submissions.length

    return [
      {
        id: 'first-accepted',
        title: 'First Accepted',
        description: 'Submit at least one accepted solution.',
        unlocked: solvedCount >= 1,
        progressLabel: `${Math.min(1, solvedCount)}/1`,
      },
      {
        id: 'weekly-streak',
        title: 'Week Streak',
        description: 'Maintain 7 consecutive active practice days.',
        unlocked: activePracticeStreak >= 7,
        progressLabel: `${Math.min(activePracticeStreak, 7)}/7 days`,
      },
      {
        id: 'proof-engineer',
        title: 'Proof Engineer',
        description: 'Submit 5 accepted Lean4 proof-mode solutions.',
        unlocked: leanAcceptedCount >= 5,
        progressLabel: `${Math.min(leanAcceptedCount, 5)}/5 Lean accepts`,
      },
      {
        id: 'hard-crusher',
        title: 'Hard Crusher',
        description: 'Solve 15 hard problems.',
        unlocked: hardSolvedCount >= 15,
        progressLabel: `${Math.min(hardSolvedCount, 15)}/15 hard solved`,
      },
      {
        id: 'topic-allrounder',
        title: 'Topic All-Rounder',
        description: 'Solve at least one problem in 6 different topics.',
        unlocked: solvedTopicCount >= 6,
        progressLabel: `${Math.min(solvedTopicCount, 6)}/6 topics`,
      },
      {
        id: 'review-guardian',
        title: 'Review Guardian',
        description: 'Reach 60 review score through peer verification.',
        unlocked: reviewScore >= 60,
        progressLabel: `${Math.min(reviewScore, 60)}/60 review`,
      },
      {
        id: 'rating-expert',
        title: 'Rating Expert',
        description: 'Reach overall rating 1800.',
        unlocked: ratingProfile.rating >= 1800,
        progressLabel: `${Math.min(ratingProfile.rating, 1800)}/1800`,
      },
      {
        id: 'plan-finisher',
        title: 'Plan Finisher',
        description: 'Complete at least one curated study plan.',
        unlocked: completedPlansCount >= 1,
        progressLabel: `${Math.min(completedPlansCount, 1)}/1 plan`,
      },
      {
        id: 'submission-marathon',
        title: 'Submission Marathon',
        description: 'Log 100 total submissions.',
        unlocked: totalSubmissions >= 100,
        progressLabel: `${Math.min(totalSubmissions, 100)}/100 submits`,
      },
    ]
  }, [
    activePracticeStreak,
    completedPlansCount,
    currentUser?.reviewScore,
    hardSolvedCount,
    leanAcceptedCount,
    ratingProfile.rating,
    solvedCount,
    solvedTopicCount,
    submissions.length,
  ])

  const unlockedAchievements = useMemo(() => {
    return achievementCards.filter((achievement) => achievement.unlocked).length
  }, [achievementCards])

  const selectedSubmission = useMemo(() => {
    if (!selectedSubmissionId) return null
    return submissions.find((submission) => submission.id === selectedSubmissionId) ?? null
  }, [selectedSubmissionId, submissions])

  const selectedSubmissionProblem = useMemo(() => {
    if (!selectedSubmission) return null
    return problemById.get(selectedSubmission.problemId) ?? null
  }, [problemById, selectedSubmission])

  const myTeams = useMemo(() => {
    if (!currentUser) return []
    return teamSpaces.filter((team) => team.members.some((member) => member.userId === currentUser.id))
  }, [currentUser, teamSpaces])

  const activeTeam = useMemo(() => {
    if (!activeTeamId) return null
    const found = teamSpaces.find((team) => team.id === activeTeamId) ?? null
    if (!found) return null
    if (!currentUser) return null
    if (!found.members.some((member) => member.userId === currentUser.id)) return null
    return found
  }, [activeTeamId, currentUser, teamSpaces])

  const teamLeaderboardEntries = useMemo(() => {
    if (!activeTeam) return []
    const byId = new Map(leaderboard.map((entry) => [entry.id, entry]))
    const placeholder = activeTeam.members.map((member): LeaderboardEntry => {
      const existing = byId.get(member.userId)
      if (existing) return existing

      return {
        id: member.userId,
        email: '',
        username: member.username,
        displayName: member.username,
        reputation: 0,
        contributionScore: 0,
        reviewScore: 0,
        solvedCount: 0,
        totalSubmissions: 0,
        rank: 0,
        proofScore: 0,
        rating: BASE_RATING,
        compositeScore: 0,
      }
    })

    const sorted = [...placeholder].sort((a, b) => {
      if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore
      if (b.rating !== a.rating) return b.rating - a.rating
      return a.username.localeCompare(b.username)
    })

    return sorted.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }))
  }, [activeTeam, leaderboard])

  const contestStandings = useMemo(() => {
    const startMs = contestStartAt ? new Date(contestStartAt).getTime() : nowTs
    const scopedByProblem = new Map<string, SubmissionRecord[]>()
    for (const problem of contestProblems) {
      scopedByProblem.set(problem.id, [])
    }
    for (const submission of contestSubmissionScope) {
      const list = scopedByProblem.get(submission.problemId)
      if (!list) continue
      list.push(submission)
    }
    for (const [problemId, list] of scopedByProblem.entries()) {
      list.sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime())
      scopedByProblem.set(problemId, list)
    }

    let solved = 0
    let penalty = 0
    let bestRuntime = Number.POSITIVE_INFINITY
    let lastAcceptedAtMs = -1

    for (const problem of contestProblems) {
      const attempts = scopedByProblem.get(problem.id) ?? []
      let wrongAttempts = 0
      let acceptedSubmission: SubmissionRecord | null = null

      for (const attempt of attempts) {
        if (attempt.status === 'Accepted') {
          acceptedSubmission = attempt
          break
        }
        wrongAttempts += 1
      }

      if (!acceptedSubmission) continue

      solved += 1
      const acceptedAt = new Date(acceptedSubmission.submittedAt).getTime()
      const elapsedMinutes = Math.max(0, Math.floor((acceptedAt - startMs) / 60_000))
      penalty += elapsedMinutes + wrongAttempts * 20
      bestRuntime = Math.min(bestRuntime, acceptedSubmission.runtimeMs)
      lastAcceptedAtMs = Math.max(lastAcceptedAtMs, Math.max(0, acceptedAt - startMs))
    }

    if (!Number.isFinite(bestRuntime)) bestRuntime = 9999
    if (lastAcceptedAtMs < 0) lastAcceptedAtMs = 9_999_999

    const myRowBase = {
      id: currentUser?.id ?? 'guest-local',
      username: currentUser?.username ?? 'you',
      solved,
      penalty,
      bestRuntime,
      lastAcceptedAtMs,
    }

    const bots: Array<Omit<ContestStandingRow, 'predictedDelta' | 'isCurrentUser'>> = []
    const contestKey = `${contestProblems.map((problem) => problem.id).join('-')}:${contestStartAt ?? 'idle'}`
    const botCount = 10
    for (let index = 0; index < botCount; index += 1) {
      const seed = stringHash(`${contestKey}:${index}`)
      const maxSolved = contestProblems.length
      const botSolved = Math.min(maxSolved, Math.floor((seed % ((maxSolved + 1) * 10)) / 10))
      const botPenalty = 95 + (seed % 420) + (maxSolved - botSolved) * 34
      const botRuntime = 36 + (seed % 260)
      const botLastAccepted = 12_000 + (seed % 380_000)
      bots.push({
        id: `bot-${index + 1}`,
        username: `solver-${index + 1}`,
        solved: botSolved,
        penalty: botPenalty,
        bestRuntime: botRuntime,
        lastAcceptedAtMs: botLastAccepted,
      })
    }

    const rows: ContestStandingRow[] = [myRowBase, ...bots].map((row) => ({
      ...row,
      predictedDelta: 0,
      isCurrentUser: row.id === myRowBase.id,
    }))

    rows.sort((a, b) => {
      if (b.solved !== a.solved) return b.solved - a.solved
      if (a.penalty !== b.penalty) return a.penalty - b.penalty
      if (a.bestRuntime !== b.bestRuntime) return a.bestRuntime - b.bestRuntime
      if (a.lastAcceptedAtMs !== b.lastAcceptedAtMs) return a.lastAcceptedAtMs - b.lastAcceptedAtMs
      return a.username.localeCompare(b.username)
    })

    const participantCount = rows.length
    rows.forEach((row, index) => {
      const standingScore = participantCount <= 1 ? 0 : (participantCount - 1 - index) / (participantCount - 1)
      const expected = 1 / (1 + 10 ** ((BASE_RATING - ratingProfile.rating) / 400))
      const delta = Math.round(32 * (standingScore - expected))
      row.predictedDelta = clampValue(delta, -64, 64)
    })

    return rows
  }, [contestProblems, contestStartAt, contestSubmissionScope, currentUser?.id, currentUser?.username, nowTs, ratingProfile.rating])

  const currentContestStanding = useMemo(() => {
    return contestStandings.find((row) => row.isCurrentUser) ?? null
  }, [contestStandings])

  function applyRatingSession(
    mode: 'contest' | 'mock',
    startedAt: string,
    problems: StemProblem[],
    submissionsInSession: SubmissionRecord[]
  ): RatingEvent | null {
    if (problems.length === 0) return null

    const sessionProblemIds = new Set(problems.map((problem) => problem.id))
    const acceptedSubmissions = submissionsInSession.filter(
      (submission) => submission.status === 'Accepted' && sessionProblemIds.has(submission.problemId)
    )
    const solved = new Set(acceptedSubmissions.map((submission) => submission.problemId)).size
    const total = problems.length
    const acceptedRate = submissionsInSession.length === 0 ? 0 : acceptedSubmissions.length / submissionsInSession.length
    const proofAccepted = acceptedSubmissions.filter((submission) => submission.language === 'lean4').length
    const proofRate = acceptedSubmissions.length === 0 ? 0 : proofAccepted / acceptedSubmissions.length

    let performance = clampValue((solved / total) * 0.72 + acceptedRate * 0.18 + proofRate * 0.1, 0, 1)
    if (submissionsInSession.length === 0) performance = 0

    const expected = 1 / (1 + 10 ** ((BASE_RATING - ratingProfile.rating) / 400))
    const kFactor = mode === 'contest' ? 36 : 28
    let delta = Math.round(kFactor * (performance - expected))
    if (submissionsInSession.length === 0) delta = Math.min(delta, -6)
    delta = clampValue(delta, -64, 64)
    const ratingAfter = Math.max(800, ratingProfile.rating + delta)
    const nowIso = new Date().toISOString()

    const solvedProblemIds = new Set(acceptedSubmissions.map((submission) => submission.problemId))
    const topicTotals = new Map<string, number>()
    const topicSolved = new Map<string, number>()
    for (const problem of problems) {
      topicTotals.set(problem.topic, (topicTotals.get(problem.topic) ?? 0) + 1)
      if (solvedProblemIds.has(problem.id)) {
        topicSolved.set(problem.topic, (topicSolved.get(problem.topic) ?? 0) + 1)
      }
    }

    const nextTopicRatings: Record<string, TopicRating> = { ...ratingProfile.topicRatings }
    const topicDeltas: TopicRatingDelta[] = []

    for (const [topic, topicTotal] of topicTotals.entries()) {
      const solvedForTopic = topicSolved.get(topic) ?? 0
      const currentTopicRating = nextTopicRatings[topic] ?? {
        rating: BASE_RATING,
        sessions: 0,
        updatedAt: nowIso,
      }
      const topicPerformance = topicTotal === 0 ? 0 : solvedForTopic / topicTotal
      const expectedTopic = 1 / (1 + 10 ** ((BASE_RATING - currentTopicRating.rating) / 400))
      let topicDelta = Math.round((mode === 'contest' ? 26 : 20) * (topicPerformance - expectedTopic))
      if (submissionsInSession.length === 0) topicDelta = Math.min(topicDelta, -4)
      topicDelta = clampValue(topicDelta, -48, 48)
      const topicAfter = Math.max(700, currentTopicRating.rating + topicDelta)

      nextTopicRatings[topic] = {
        rating: topicAfter,
        sessions: currentTopicRating.sessions + 1,
        updatedAt: nowIso,
      }
      topicDeltas.push({
        topic,
        solved: solvedForTopic,
        total: topicTotal,
        delta: topicDelta,
        ratingAfter: topicAfter,
      })
    }

    topicDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.topic.localeCompare(b.topic))

    const event: RatingEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mode,
      startedAt,
      endedAt: nowIso,
      solved,
      total,
      acceptedRate: Number(acceptedRate.toFixed(3)),
      proofRate: Number(proofRate.toFixed(3)),
      delta,
      ratingAfter,
      topicDeltas,
    }

    const nextProfile: RatingProfile = {
      rating: ratingAfter,
      sessions: ratingProfile.sessions + 1,
      history: [event, ...ratingProfile.history].slice(0, 60),
      topicRatings: nextTopicRatings,
    }
    setRatingProfile(nextProfile)
    safeWrite(RATING_PROFILE_STORAGE_KEY, nextProfile)

    return event
  }

  function finalizeContestSession(trigger: 'manual' | 'timeout'): void {
    if (!contestStartAt) return
    const event = applyRatingSession('contest', contestStartAt, contestProblems, contestSubmissionScope)
    setContestStartAt(null)
    safeWrite(CONTEST_START_STORAGE_KEY, null)

    if (!event) {
      setCommunityMessage('Contest session ended.')
      return
    }

    const topTopic = event.topicDeltas[0]
    const topicMessage = topTopic ? ` Top topic ${topTopic.topic} ${topTopic.delta >= 0 ? '+' : ''}${topTopic.delta}.` : ''
    setCommunityMessage(
      `Contest ended (${trigger}). Rating ${event.delta >= 0 ? '+' : ''}${event.delta} -> ${event.ratingAfter}.${topicMessage}`
    )
  }

  function finalizeMockSession(trigger: 'manual' | 'timeout'): void {
    if (!mockStartAt) return
    const event = applyRatingSession('mock', mockStartAt, mockProblems, mockSubmissionScope)
    setMockStartAt(null)
    safeWrite(MOCK_START_STORAGE_KEY, null)

    if (!event) {
      setCommunityMessage('Mock exam ended.')
      return
    }

    const topTopic = event.topicDeltas[0]
    const topicMessage = topTopic ? ` Top topic ${topTopic.topic} ${topTopic.delta >= 0 ? '+' : ''}${topTopic.delta}.` : ''
    setCommunityMessage(
      `Mock exam ended (${trigger}). Rating ${event.delta >= 0 ? '+' : ''}${event.delta} -> ${event.ratingAfter}.${topicMessage}`
    )
  }

  useEffect(() => {
    let mounted = true

    const bootstrap = async () => {
      const user = await communityService.getCurrentUser()
      if (mounted) setCurrentUser(user)
    }

    void bootstrap()

    const subscription = communityService.onAuthChange((user) => {
      setCurrentUser(user)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!communityMessage) return
    const timer = window.setTimeout(() => {
      setCommunityMessage(null)
    }, 4200)
    return () => {
      window.clearTimeout(timer)
    }
  }, [communityMessage])

  useEffect(() => {
    safeWrite(TEAM_SPACES_STORAGE_KEY, teamSpaces)
  }, [teamSpaces])

  useEffect(() => {
    safeWrite(ACTIVE_TEAM_STORAGE_KEY, activeTeamId)
  }, [activeTeamId])

  useEffect(() => {
    if (!currentUser) {
      setActiveTeamId(null)
      return
    }
    if (!activeTeamId) return
    const active = teamSpaces.find((team) => team.id === activeTeamId)
    if (!active || !active.members.some((member) => member.userId === currentUser.id)) {
      const fallback = teamSpaces.find((team) => team.members.some((member) => member.userId === currentUser.id))
      setActiveTeamId(fallback?.id ?? null)
    }
  }, [activeTeamId, currentUser, teamSpaces])

  useEffect(() => {
    const loadData = async () => {
      if (view === 'leaderboard' || view === 'teams') {
        setCommunityLoading(true)
        const data = await communityService.listLeaderboard(50)
        setLeaderboard(data)
        setCommunityLoading(false)
      }

      if (view === 'reviews' && currentUser) {
        setCommunityLoading(true)
        const queue = await communityService.listReviewQueue(currentUser.id, 30)
        setReviewQueue(queue)
        setCommunityLoading(false)
      }
    }

    void loadData()
  }, [view, currentUser?.id])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now())
    }, 1000)
    return () => {
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!contestStartAt || contestRemainingMs > 0) return
    finalizeContestSession('timeout')
  }, [contestRemainingMs, contestStartAt])

  useEffect(() => {
    if (!mockStartAt || mockRemainingMs > 0) return
    finalizeMockSession('timeout')
  }, [mockRemainingMs, mockStartAt])

  const refreshLeaderboard = async () => {
    setCommunityLoading(true)
    const data = await communityService.listLeaderboard(50)
    setLeaderboard(data)
    setCommunityLoading(false)
  }

  const toggleBookmark = (problemId: string) => {
    setBookmarks((prev) => {
      const exists = prev.includes(problemId)
      const next = exists ? prev.filter((item) => item !== problemId) : [problemId, ...prev]
      safeWrite(BOOKMARK_STORAGE_KEY, next)
      return next
    })
  }

  const updateNote = (problemId: string, value: string) => {
    setNotes((prev) => {
      const next = { ...prev, [problemId]: value }
      safeWrite(NOTES_STORAGE_KEY, next)
      return next
    })
  }

  const updateProofNote = (problemId: string, value: string) => {
    setProofNotes((prev) => {
      const next = { ...prev, [problemId]: value }
      safeWrite(PROOF_NOTES_STORAGE_KEY, next)
      return next
    })
  }

  const updateProofChecklistItem = (problemId: string, patch: Partial<ProofChecklist>) => {
    setProofChecklist((prev) => {
      const current = prev[problemId] ?? {
        theoremBuilt: false,
        edgeCasesCovered: false,
        complexityArgued: false,
        finalReviewDone: false,
      }
      const next = {
        ...prev,
        [problemId]: {
          ...current,
          ...patch,
        },
      }
      safeWrite(PROOF_CHECKLIST_STORAGE_KEY, next)
      return next
    })
  }

  const revealHint = (problemId: string, maxHints: number) => {
    setHintReveals((prev) => {
      const current = prev[problemId] ?? 0
      const nextValue = Math.min(maxHints, current + 1)
      const next = { ...prev, [problemId]: nextValue }
      safeWrite(HINT_REVEALS_STORAGE_KEY, next)
      return next
    })
  }

  const openDailyProblem = () => {
    setView('problems')
    setSelectedProblemId(dailyProblem.id)
    setActiveTab('description')
    setJudgeResult(null)
  }

  const openRandomProblem = () => {
    const pool = sortedProblems.length > 0 ? sortedProblems : STEM_PROBLEMS
    const next = pool[Math.floor(Math.random() * pool.length)]
    if (!next) return
    setSelectedProblemId(next.id)
    setActiveTab('description')
    setJudgeResult(null)
  }

  const openSubmissionDetail = (submissionId: string) => {
    setSelectedSubmissionId(submissionId)
    setView('submission-detail')
  }

  const createTeam = () => {
    if (!currentUser) {
      setCommunityMessage('Sign in to create a team.')
      return
    }

    const name = createTeamName.trim()
    if (name.length < 3) {
      setCommunityMessage('Team name must be at least 3 characters.')
      return
    }

    let inviteCode = generateInviteCode()
    const existingCodes = new Set(teamSpaces.map((team) => team.inviteCode))
    let guard = 0
    while (existingCodes.has(inviteCode) && guard < 10) {
      inviteCode = generateInviteCode()
      guard += 1
    }

    const team: TeamSpace = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      ownerId: currentUser.id,
      inviteCode,
      isPrivate: createTeamPrivate,
      createdAt: new Date().toISOString(),
      members: [
        {
          userId: currentUser.id,
          username: currentUser.username,
          joinedAt: new Date().toISOString(),
        },
      ],
    }

    setTeamSpaces((prev) => [team, ...prev])
    setActiveTeamId(team.id)
    setCreateTeamName('')
    setCommunityMessage(`Team created. Invite code: ${inviteCode}`)
  }

  const joinTeam = () => {
    if (!currentUser) {
      setCommunityMessage('Sign in to join a team.')
      return
    }

    const normalizedCode = joinTeamCode.trim().toUpperCase()
    if (!normalizedCode) {
      setCommunityMessage('Enter an invite code.')
      return
    }

    const target = teamSpaces.find((team) => team.inviteCode === normalizedCode)
    if (!target) {
      setCommunityMessage('Invite code not found.')
      return
    }

    if (target.members.some((member) => member.userId === currentUser.id)) {
      setActiveTeamId(target.id)
      setCommunityMessage(`Already a member of ${target.name}.`)
      return
    }

    setTeamSpaces((prev) =>
      prev.map((team) => {
        if (team.id !== target.id) return team
        return {
          ...team,
          members: [
            ...team.members,
            {
              userId: currentUser.id,
              username: currentUser.username,
              joinedAt: new Date().toISOString(),
            },
          ],
        }
      })
    )
    setActiveTeamId(target.id)
    setJoinTeamCode('')
    setCommunityMessage(`Joined team ${target.name}.`)
  }

  const startContest = () => {
    const started = new Date().toISOString()
    setContestStartAt(started)
    safeWrite(CONTEST_START_STORAGE_KEY, started)
    setCommunityMessage('Contest started: 90-minute timer is running.')
  }

  const endContest = () => {
    finalizeContestSession('manual')
  }

  const startMockExam = () => {
    const companyFiltered = hardProblems.filter((problem) => {
      if (mockCompanyTrack === 'All') return true
      const companyTags = companyTagsByProblemId.get(problem.id) ?? ['All']
      return companyTags.includes(mockCompanyTrack)
    })

    const topicAndCompanyPool = companyFiltered.filter((problem) => mockTopic === 'All' || problem.topic === mockTopic)
    const templateProblems = activeMockTemplate.problemIds
      .map((problemId) => STEM_PROBLEMS.find((problem) => problem.id === problemId))
      .filter((problem): problem is StemProblem => Boolean(problem && problem.difficulty === 'Hard'))
      .filter((problem) => mockTopic === 'All' || problem.topic === mockTopic)

    const deterministicCompanyPool = topicAndCompanyPool
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))

    const deterministicGlobalPool = hardProblems
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))

    const mergedPool: StemProblem[] = []
    const seenProblemIds = new Set<string>()
    const pushUnique = (problem: StemProblem) => {
      if (seenProblemIds.has(problem.id)) return
      seenProblemIds.add(problem.id)
      mergedPool.push(problem)
    }

    for (const problem of templateProblems) pushUnique(problem)
    for (const problem of deterministicCompanyPool) pushUnique(problem)
    for (const problem of deterministicGlobalPool) pushUnique(problem)

    const pickedIds = mergedPool.slice(0, 6).map((problem) => problem.id)

    if (pickedIds.length === 0) {
      setCommunityMessage('No hard problems available for this mock filter.')
      return
    }

    const started = new Date().toISOString()
    setMockProblemIds(pickedIds)
    safeWrite(MOCK_PROBLEMS_STORAGE_KEY, pickedIds)
    setMockStartAt(started)
    safeWrite(MOCK_START_STORAGE_KEY, started)
    safeWrite(MOCK_TOPIC_STORAGE_KEY, mockTopic)
    safeWrite(MOCK_COMPANY_TRACK_STORAGE_KEY, mockCompanyTrack)
    safeWrite(MOCK_DURATION_STORAGE_KEY, mockDurationMinutes)
    setCommunityMessage(`Mock exam started: ${activeMockTemplate.title} (${mockCompanyTrack}). Timer is running.`)
  }

  const endMockExam = () => {
    finalizeMockSession('manual')
  }

  const appendLeanProofSkeleton = () => {
    if (language !== 'lean4') {
      setLanguage('lean4')
      setCommunityMessage('Switched to Lean4. Add proof skeleton now.')
      return
    }

    const skeleton = `\n\nlemma ${selectedProblem.functionName}_edge_case : True := by\n  -- TODO: formalize a key edge case\n  sorry\n\nlemma ${selectedProblem.functionName}_complexity_note : True := by\n  -- TODO: encode complexity argument assumptions\n  sorry\n`
    updateSource(`${currentSource}${skeleton}`)
    setCommunityMessage('Lean proof skeleton appended to editor.')
  }

  const persistDiscussionThreads = (updater: (previous: DiscussionThread[]) => DiscussionThread[]) => {
    setDiscussionThreads((prev) => {
      const next = updater(prev)
      safeWrite(DISCUSSION_STORAGE_KEY, next)
      return next
    })
  }

  const createDiscussionThread = () => {
    const title = newThreadTitle.trim()
    const body = newThreadBody.trim()
    if (!title || !body) {
      setCommunityMessage('Discussion thread needs both title and body.')
      return
    }

    const nextThread: DiscussionThread = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      problemId: discussionComposeProblemId || selectedProblem.id,
      title,
      body,
      author: currentUser?.username ?? 'guest',
      createdAt: new Date().toISOString(),
      votes: [],
      replies: [],
    }

    persistDiscussionThreads((prev) => [nextThread, ...prev])
    setNewThreadTitle('')
    setNewThreadBody('')
    setCommunityMessage('Discussion thread posted.')
  }

  const toggleDiscussionVote = (threadId: string) => {
    const voterId = discussionViewerId
    persistDiscussionThreads((prev) =>
      prev.map((thread) => {
        if (thread.id !== threadId) return thread
        const hasVote = thread.votes.includes(voterId)
        return {
          ...thread,
          votes: hasVote ? thread.votes.filter((vote) => vote !== voterId) : [...thread.votes, voterId],
        }
      })
    )
  }

  const submitDiscussionReply = (threadId: string) => {
    const body = (replyDrafts[threadId] ?? '').trim()
    if (!body) {
      setCommunityMessage('Reply cannot be empty.')
      return
    }

    const reply: DiscussionReply = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author: currentUser?.username ?? 'guest',
      body,
      createdAt: new Date().toISOString(),
    }

    persistDiscussionThreads((prev) =>
      prev.map((thread) => {
        if (thread.id !== threadId) return thread
        return {
          ...thread,
          replies: [...thread.replies, reply],
        }
      })
    )

    setReplyDrafts((prev) => ({
      ...prev,
      [threadId]: '',
    }))
  }

  const openNextPlanProblem = (problemId: string | null) => {
    if (!problemId) {
      setCommunityMessage('This study plan is already complete.')
      return
    }

    if (!problemById.has(problemId)) {
      setCommunityMessage(`Problem ${problemId} is not available in this build.`)
      return
    }

    setView('problems')
    setSelectedProblemId(problemId)
    setActiveTab('description')
    setJudgeResult(null)
  }

  const refreshReviewQueue = async () => {
    if (!currentUser) {
      setReviewQueue([])
      return
    }
    setCommunityLoading(true)
    const queue = await communityService.listReviewQueue(currentUser.id, 30)
    setReviewQueue(queue)
    setCommunityLoading(false)
  }

  const updateSource = (nextSource: string) => {
    setSources((prev) => {
      const next = {
        ...prev,
        [currentSourceKey]: nextSource,
      }
      safeWrite(SOURCE_STORAGE_KEY, next)
      return next
    })
  }

  const persistCommunitySubmission = async (result: JudgeResult) => {
    if (!currentUser) {
      setCommunityMessage('Sign in to enter leaderboard and peer-review workflows.')
      return
    }

    const score = computeSubmissionScore(selectedProblem, result, language)
    const response = await communityService.saveSubmission(currentUser, {
      problemId: selectedProblem.id,
      problemTitle: selectedProblem.title,
      topic: selectedProblem.topic,
      difficulty: selectedProblem.difficulty,
      language,
      status: result.status,
      passed: result.passed,
      total: result.total,
      runtimeMs: result.runtimeMs,
      score,
      sourceCode: currentSource,
    })

    if (response.error) {
      setCommunityMessage(`Submission saved locally, but community sync failed: ${response.error}`)
      return
    }

    setCommunityMessage(`Community score updated: +${score} points`)
    await refreshLeaderboard()
    if (view === 'reviews') {
      await refreshReviewQueue()
    }
  }

  const run = (submitMode: boolean) => {
    const prepared = ensureSourceMap(selectedProblem, language, sources)
    if (prepared !== sources) {
      setSources(prepared)
      safeWrite(SOURCE_STORAGE_KEY, prepared)
    }

    const result = runJudge(selectedProblem, language, currentSource, submitMode)
    setJudgeResult(result)
    setLastAction(submitMode ? 'Submit' : 'Run')

    if (submitMode) {
      const score = result.total > 0 ? computeSubmissionScore(selectedProblem, result, language) : 0
      const record: SubmissionRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        submittedAt: new Date().toISOString(),
        problemId: selectedProblem.id,
        problemTitle: selectedProblem.title,
        language,
        status: result.status,
        passed: result.passed,
        total: result.total,
        runtimeMs: result.runtimeMs,
        score,
        sourceCode: currentSource,
        message: result.message,
        caseResults: result.caseResults,
      }

      setSubmissions((prev) => {
        const next = [record, ...prev].slice(0, 300)
        safeWrite(SUBMISSION_STORAGE_KEY, next)
        return next
      })

      setActiveTab('submissions')

      if (result.status !== 'Language Not Supported' && result.total > 0) {
        void persistCommunitySubmission(result)
      }
    }
  }

  const onPickProblem = (problemId: string) => {
    setSelectedProblemId(problemId)
    setJudgeResult(null)
    setLastAction(null)
    setActiveTab('description')
  }

  const onLanguageChange = (nextLanguage: Language) => {
    setLanguage(nextLanguage)
    setJudgeResult(null)

    setSources((prev) => {
      const next = ensureSourceMap(selectedProblem, nextLanguage, prev)
      if (next !== prev) safeWrite(SOURCE_STORAGE_KEY, next)
      return next
    })
  }

  const resetCode = () => {
    updateSource(getStarterCode(selectedProblem, language))
    setJudgeResult(null)
    setLastAction(null)
  }

  const submitAuth = async () => {
    setCommunityLoading(true)

    const response =
      authMode === 'signin'
        ? await communityService.signIn(authEmail, authPassword)
        : await communityService.signUp(authEmail, authPassword, authUsername)

    setCommunityLoading(false)

    if (response.error) {
      setCommunityMessage(response.error)
      return
    }

    if (response.user) {
      setCurrentUser(response.user)
      setAuthOpen(false)
      setAuthPassword('')
      setCommunityMessage(`Welcome, ${response.user.displayName}.`)
      await refreshLeaderboard()
      await refreshReviewQueue()
      return
    }

    if (authMode === 'signup') {
      setCommunityMessage('Account created. Verify your email if your provider requires confirmation.')
    }
  }

  const signOut = async () => {
    await communityService.signOut()
    setCurrentUser(null)
    setReviewQueue([])
    setCommunityMessage('Signed out successfully.')
  }

  const getReviewDraft = (submissionId: string): ReviewDraft => {
    return reviewDrafts[submissionId] ?? defaultReviewDraft
  }

  const updateReviewDraft = (submissionId: string, patch: Partial<ReviewDraft>) => {
    setReviewDrafts((prev) => ({
      ...prev,
      [submissionId]: {
        ...(prev[submissionId] ?? defaultReviewDraft),
        ...patch,
      },
    }))
  }

  const submitReview = async (submissionId: string) => {
    if (!currentUser) {
      setCommunityMessage('Sign in to submit peer reviews.')
      return
    }

    const draft = getReviewDraft(submissionId)
    setReviewSubmittingId(submissionId)

    const response = await communityService.submitReview(currentUser, {
      submissionId,
      verdict: draft.verdict,
      correctnessScore: draft.correctnessScore,
      explanationScore: draft.explanationScore,
      rigorScore: draft.rigorScore,
      comment: draft.comment,
    })

    setReviewSubmittingId(null)

    if (response.error) {
      setCommunityMessage(response.error)
      return
    }

    setCommunityMessage('Peer review submitted and contributor score recalculated.')
    await refreshReviewQueue()
    await refreshLeaderboard()
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-area">
          <span className="brand-mark">STEM</span>
          <span className="brand-text">LeetCode</span>
        </div>

        <nav className="top-nav">
          <button
            className={view === 'problems' ? 'nav-pill active' : 'nav-pill'}
            type="button"
            onClick={() => setView('problems')}
          >
            Problems
          </button>
          <button
            className={view === 'leaderboard' ? 'nav-pill active' : 'nav-pill'}
            type="button"
            onClick={() => setView('leaderboard')}
          >
            Leaderboard
          </button>
          <button
            className={view === 'daily' ? 'nav-pill active' : 'nav-pill'}
            type="button"
            onClick={() => setView('daily')}
          >
            Daily
          </button>
          <button
            className={view === 'contest' ? 'nav-pill active' : 'nav-pill'}
            type="button"
            onClick={() => setView('contest')}
          >
            Contest
          </button>
          <button
            className={view === 'mock' ? 'nav-pill active' : 'nav-pill'}
            type="button"
            onClick={() => setView('mock')}
          >
            Mock Exam
          </button>
          <button
            className={view === 'profile' ? 'nav-pill active' : 'nav-pill'}
            type="button"
            onClick={() => setView('profile')}
          >
            Profile
          </button>
          <button
            className={view === 'teams' ? 'nav-pill active' : 'nav-pill'}
            type="button"
            onClick={() => setView('teams')}
          >
            Teams
          </button>
          <button
            className={view === 'reviews' ? 'nav-pill active' : 'nav-pill'}
            type="button"
            onClick={() => setView('reviews')}
          >
            Peer Review
          </button>
          <button
            className={view === 'progress' ? 'nav-pill active' : 'nav-pill'}
            type="button"
            onClick={() => setView('progress')}
          >
            Progress
          </button>
          <button
            className={view === 'plans' ? 'nav-pill active' : 'nav-pill'}
            type="button"
            onClick={() => setView('plans')}
          >
            Study Plans
          </button>
          <button
            className={view === 'discuss' ? 'nav-pill active' : 'nav-pill'}
            type="button"
            onClick={() => setView('discuss')}
          >
            Discuss
          </button>
        </nav>

        <div className="topbar-right">
          <div className="top-stats">
            Solved {solvedCount}/{STEM_PROBLEMS.length}
            <span className="top-inline-stat">Streak {dailyStreak}</span>
            <span className="top-inline-stat">Rating {ratingProfile.rating}</span>
            <span className={`top-inline-stat rating-tier-pill ${currentRatingTier.className}`}>
              Tier {currentRatingTier.label}
            </span>
            {latestRatingEvent ? (
              <span className="top-inline-stat">
                Last {latestRatingEvent.mode} {latestRatingEvent.delta >= 0 ? '+' : ''}{latestRatingEvent.delta}
              </span>
            ) : null}
            <span className="mode-pill">{communityService.mode.toUpperCase()}</span>
          </div>

          {currentUser ? (
            <>
              <div className="user-pill">
                <strong>{currentUser.username}</strong>
                <span>Rep {currentUser.reputation}</span>
                <span>Rank {currentLeaderboardRank ?? '-'}</span>
              </div>
              <button className="btn ghost tiny" type="button" onClick={signOut}>
                Sign Out
              </button>
            </>
          ) : (
            <button
              className="btn ghost tiny"
              type="button"
              onClick={() => {
                setAuthMode('signin')
                setAuthOpen(true)
              }}
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {communityMessage ? <div className="global-message">{communityMessage}</div> : null}

      {view === 'problems' && (
        <main className="workspace">
          <aside className="catalog">
            <div className="catalog-controls">
              <input
                className="search-input"
                placeholder="Search by title, topic, tag"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="catalog-filter-grid">
                <select
                  className="difficulty-select"
                  value={difficultyFilter}
                  onChange={(event) => setDifficultyFilter(event.target.value as 'All' | Difficulty)}
                >
                  <option value="All">All Difficulties</option>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
                <select
                  className="difficulty-select"
                  value={topicFilter}
                  onChange={(event) => setTopicFilter(event.target.value)}
                >
                  {availableTopics.map((topic) => (
                    <option key={`topic-${topic}`} value={topic}>{topic}</option>
                  ))}
                </select>
                <select
                  className="difficulty-select"
                  value={tagFilter}
                  onChange={(event) => setTagFilter(event.target.value)}
                >
                  {availableTags.map((tag) => (
                    <option key={`tag-${tag}`} value={tag}>{tag === 'All' ? 'All Tags' : tag}</option>
                  ))}
                </select>
                <select
                  className="difficulty-select"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                >
                  <option value="All">All Statuses</option>
                  <option value="Solved">Solved</option>
                  <option value="Attempted">Attempted</option>
                  <option value="Unsolved">Unsolved</option>
                </select>
                <select
                  className="difficulty-select"
                  value={sortField}
                  onChange={(event) => setSortField(event.target.value as SortField)}
                >
                  <option value="id">Sort: Problem ID</option>
                  <option value="title">Sort: Title</option>
                  <option value="difficulty">Sort: Difficulty</option>
                  <option value="acceptance">Sort: Acceptance</option>
                  <option value="status">Sort: Status</option>
                </select>
                <select
                  className="difficulty-select"
                  value={sortDirection}
                  onChange={(event) => setSortDirection(event.target.value as 'asc' | 'desc')}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
              <label className="bookmark-toggle">
                <input
                  type="checkbox"
                  checked={bookmarkOnly}
                  onChange={(event) => setBookmarkOnly(event.target.checked)}
                />
                Bookmarked Only
              </label>
            </div>

            <div className="problem-table-wrap">
              <table className="problem-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Difficulty</th>
                    <th>Acceptance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProblems.map((problem) => {
                    const isSelected = problem.id === selectedProblem.id
                    const status = problemStatusMap.get(problem.id) ?? 'Unsolved'
                    const bookmarked = bookmarks.includes(problem.id)
                    return (
                      <tr
                        key={problem.id}
                        className={isSelected ? 'selected-row' : ''}
                        onClick={() => onPickProblem(problem.id)}
                      >
                        <td>
                          <div className="problem-title-cell">
                            <span className="problem-id">{problem.id}</span>
                            <span>{bookmarked ? '★ ' : ''}{problem.title}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`difficulty-chip ${difficultyClass(problem.difficulty)}`}>
                            {problem.difficulty}
                          </span>
                        </td>
                        <td>{problem.acceptance.toFixed(1)}%</td>
                        <td>
                          <span className={`status-chip ${
                            status === 'Solved'
                              ? 'status-ok'
                              : status === 'Attempted'
                                ? 'status-warn'
                                : 'status-neutral'
                          }`}
                          >
                            {status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </aside>

          <section className="challenge-area">
            <div className="statement-panel card">
              <div className="statement-header">
                <h1>{selectedProblem.title}</h1>
                <div className="statement-meta">
                  <span className={`difficulty-chip ${difficultyClass(selectedProblem.difficulty)}`}>
                    {selectedProblem.difficulty}
                  </span>
                  <span className="meta-pill">{selectedProblem.topic}</span>
                  <span className="meta-pill">Acceptance {selectedProblem.acceptance.toFixed(1)}%</span>
                  {selectedCompanyTracks.slice(0, 2).map((track) => (
                    <span key={`${selectedProblem.id}-company-${track}`} className="meta-pill company-pill">
                      {track}
                    </span>
                  ))}
                  <button
                    type="button"
                    className="meta-action"
                    onClick={() => toggleBookmark(selectedProblem.id)}
                  >
                    {isBookmarked ? '★ Bookmarked' : '☆ Bookmark'}
                  </button>
                  <button type="button" className="meta-action" onClick={openRandomProblem}>
                    Random
                  </button>
                  <button type="button" className="meta-action" onClick={openDailyProblem}>
                    Daily
                  </button>
                </div>
              </div>

              <div className="statement-tabs">
                <button
                  type="button"
                  className={activeTab === 'description' ? 'tab-btn active' : 'tab-btn'}
                  onClick={() => setActiveTab('description')}
                >
                  Description
                </button>
                <button
                  type="button"
                  className={activeTab === 'editorial' ? 'tab-btn active' : 'tab-btn'}
                  onClick={() => setActiveTab('editorial')}
                >
                  Editorial
                </button>
                <button
                  type="button"
                  className={activeTab === 'submissions' ? 'tab-btn active' : 'tab-btn'}
                  onClick={() => setActiveTab('submissions')}
                >
                  Submissions
                </button>
                <button
                  type="button"
                  className={activeTab === 'notes' ? 'tab-btn active' : 'tab-btn'}
                  onClick={() => setActiveTab('notes')}
                >
                  Notes
                </button>
                <button
                  type="button"
                  className={activeTab === 'proof' ? 'tab-btn active' : 'tab-btn'}
                  onClick={() => setActiveTab('proof')}
                >
                  Proof Mode
                </button>
              </div>

              <div className="statement-content">
                {activeTab === 'description' && (
                  <>
                    <p>{selectedProblem.description}</p>

                    <h2>Examples</h2>
                    {selectedProblem.examples.map((example, index) => (
                      <div key={`${selectedProblem.id}-example-${index}`} className="example-block">
                        <p>
                          <strong>Input:</strong> {example.input}
                        </p>
                        <p>
                          <strong>Output:</strong> {example.output}
                        </p>
                        <p>
                          <strong>Explanation:</strong> {example.explanation}
                        </p>
                      </div>
                    ))}

                    <h2>Constraints</h2>
                    <ul className="statement-list">
                      {selectedProblem.constraints.map((constraint, index) => (
                        <li key={`${selectedProblem.id}-constraint-${index}`}>{constraint}</li>
                      ))}
                    </ul>

                    <h2>Tags</h2>
                    <div className="tag-row">
                      {selectedProblem.tags.map((tag) => (
                        <span key={`${selectedProblem.id}-tag-${tag}`} className="tag-pill">
                          {tag}
                        </span>
                      ))}
                    </div>

                    <h2>Hints</h2>
                    <div className="hint-box">
                      <button
                        type="button"
                        className="btn ghost tiny"
                        onClick={() => revealHint(selectedProblem.id, selectedProblem.editorial.length)}
                        disabled={revealedHints >= selectedProblem.editorial.length}
                      >
                        {revealedHints >= selectedProblem.editorial.length ? 'All hints revealed' : 'Reveal next hint'}
                      </button>
                      {revealedHints === 0 ? (
                        <p className="muted">Hints are hidden. Reveal progressively.</p>
                      ) : (
                        <ol className="statement-list ordered">
                          {selectedProblem.editorial.slice(0, revealedHints).map((line, index) => (
                            <li key={`${selectedProblem.id}-hint-${index}`}>{line}</li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </>
                )}

                {activeTab === 'editorial' && (
                  <div>
                    <h2>Approach</h2>
                    <ol className="statement-list ordered">
                      {selectedProblem.editorial.map((line, index) => (
                        <li key={`${selectedProblem.id}-editorial-${index}`}>{line}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {activeTab === 'submissions' && (
                  <div>
                    {scopedSubmissions.length === 0 ? (
                      <p className="muted">No submissions yet for this problem.</p>
                    ) : (
                      <table className="submissions-table">
                        <thead>
                          <tr>
                            <th>Status</th>
                            <th>Language</th>
                            <th>Passed</th>
                            <th>Runtime</th>
                            <th>Submitted At</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scopedSubmissions.map((submission) => (
                            <tr key={submission.id}>
                              <td>
                                <span
                                  className={`status-chip ${
                                    submission.status === 'Accepted'
                                      ? 'status-ok'
                                      : submission.status === 'Proof Incomplete'
                                        ? 'status-neutral'
                                      : submission.status === 'Wrong Answer'
                                        ? 'status-warn'
                                        : 'status-bad'
                                  }`}
                                >
                                  {submission.status}
                                </span>
                              </td>
                              <td>{languageLabels[submission.language]}</td>
                              <td>
                                {submission.passed}/{submission.total}
                              </td>
                              <td>{submission.runtimeMs} ms</td>
                              <td>{new Date(submission.submittedAt).toLocaleString()}</td>
                              <td>
                                <button
                                  className="btn ghost tiny"
                                  type="button"
                                  onClick={() => openSubmissionDetail(submission.id)}
                                >
                                  View
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {activeTab === 'notes' && (
                  <div className="notes-tab">
                    <p className="muted">Private notes for this problem (saved locally).</p>
                    <textarea
                      className="notes-editor"
                      placeholder="Write approach ideas, mistakes, proofs, and optimizations..."
                      value={selectedProblemNote}
                      onChange={(event) => updateNote(selectedProblem.id, event.target.value)}
                    />
                  </div>
                )}

                {activeTab === 'proof' && (
                  <div className="proof-tab">
                    {language !== 'lean4' ? (
                      <div className="proof-nonlean">
                        <p className="muted">
                          Proof Mode is optimized for Lean4 submissions. Switch language to activate automated proof checks.
                        </p>
                        <button
                          className="btn secondary tiny"
                          type="button"
                          onClick={() => onLanguageChange('lean4')}
                        >
                          Switch To Lean4
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="proof-auto-checks">
                          <span className={`status-chip ${leanSourceChecks.hasDefinition ? 'status-ok' : 'status-warn'}`}>
                            def {leanSourceChecks.hasDefinition ? 'found' : 'missing'}
                          </span>
                          <span className={`status-chip ${leanSourceChecks.hasTheoremOrLemma ? 'status-ok' : 'status-warn'}`}>
                            theorem/lemma {leanSourceChecks.hasTheoremOrLemma ? 'found' : 'missing'}
                          </span>
                          <span className={`status-chip ${leanSourceChecks.hasJsBridge ? 'status-ok' : 'status-warn'}`}>
                            JS bridge {leanSourceChecks.hasJsBridge ? 'found' : 'missing'}
                          </span>
                          <span className={`status-chip ${leanSourceChecks.hasSorryOrAdmit ? 'status-warn' : 'status-ok'}`}>
                            sorry/admit {leanSourceChecks.hasSorryOrAdmit ? 'present' : 'clean'}
                          </span>
                        </div>

                        <div className="proof-checklist-grid">
                          <label className="proof-check-item">
                            <input
                              type="checkbox"
                              checked={selectedProofChecklist.theoremBuilt}
                              onChange={(event) =>
                                updateProofChecklistItem(selectedProblem.id, { theoremBuilt: event.target.checked })
                              }
                            />
                            Theorem/Lemma statement finalized
                          </label>
                          <label className="proof-check-item">
                            <input
                              type="checkbox"
                              checked={selectedProofChecklist.edgeCasesCovered}
                              onChange={(event) =>
                                updateProofChecklistItem(selectedProblem.id, { edgeCasesCovered: event.target.checked })
                              }
                            />
                            Edge-case proof obligations checked
                          </label>
                          <label className="proof-check-item">
                            <input
                              type="checkbox"
                              checked={selectedProofChecklist.complexityArgued}
                              onChange={(event) =>
                                updateProofChecklistItem(selectedProblem.id, { complexityArgued: event.target.checked })
                              }
                            />
                            Complexity/termination argument written
                          </label>
                          <label className="proof-check-item">
                            <input
                              type="checkbox"
                              checked={selectedProofChecklist.finalReviewDone}
                              onChange={(event) =>
                                updateProofChecklistItem(selectedProblem.id, { finalReviewDone: event.target.checked })
                              }
                            />
                            Final proof review complete
                          </label>
                        </div>

                        <div className="proof-actions">
                          <button className="btn ghost tiny" type="button" onClick={appendLeanProofSkeleton}>
                            Append Proof Skeleton
                          </button>
                          <button
                            className="btn ghost tiny"
                            type="button"
                            onClick={() =>
                              updateProofChecklistItem(selectedProblem.id, {
                                theoremBuilt: true,
                                edgeCasesCovered: true,
                                complexityArgued: true,
                                finalReviewDone: true,
                              })
                            }
                          >
                            Mark Checklist Complete
                          </button>
                        </div>
                      </>
                    )}

                    <p className="muted">Proof notes are local and separate from regular notes.</p>
                    <textarea
                      className="notes-editor"
                      placeholder="Outline invariants, lemmas, rewrite steps, and any assumptions that must be discharged."
                      value={selectedProofNote}
                      onChange={(event) => updateProofNote(selectedProblem.id, event.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="editor-panel card">
              <div className="editor-header">
                <div className="editor-controls">
                  <label htmlFor="language" className="muted">Language</label>
                  <select
                    id="language"
                    value={language}
                    onChange={(event) => onLanguageChange(event.target.value as Language)}
                  >
                    <option value="javascript">JavaScript</option>
                    <option value="python">Python</option>
                    <option value="cpp">C++</option>
                    <option value="java">Java</option>
                    <option value="lean4">Lean4</option>
                  </select>
                </div>

                <div className="editor-actions">
                  <button className="btn ghost" type="button" onClick={resetCode}>
                    Reset
                  </button>
                  <button className="btn secondary" type="button" onClick={() => run(false)}>
                    Run
                  </button>
                  <button className="btn primary" type="button" onClick={() => run(true)}>
                    Submit
                  </button>
                </div>
              </div>

              <textarea
                className="code-editor"
                spellCheck={false}
                value={currentSource}
                onChange={(event) => updateSource(event.target.value)}
              />

              <div className="results-panel">
                {judgeResult ? (
                  <>
                    <div className="result-summary">
                      <span
                        className={`status-chip ${
                          judgeResult.status === 'Accepted'
                            ? 'status-ok'
                            : judgeResult.status === 'Proof Incomplete'
                              ? 'status-neutral'
                            : judgeResult.status === 'Wrong Answer'
                              ? 'status-warn'
                              : judgeResult.status === 'Language Not Supported'
                                ? 'status-neutral'
                                : 'status-bad'
                        }`}
                      >
                        {lastAction ? `${lastAction}: ` : ''}
                        {judgeResult.status}
                      </span>
                      <span>
                        {judgeResult.passed}/{judgeResult.total} cases
                      </span>
                      <span>{judgeResult.runtimeMs} ms</span>
                    </div>

                    {judgeResult.message ? <p className="result-message">{judgeResult.message}</p> : null}

                    {judgeResult.caseResults.length > 0 && (
                      <table className="cases-table">
                        <thead>
                          <tr>
                            <th>Case</th>
                            <th>Result</th>
                            <th>Expected</th>
                            <th>Received</th>
                          </tr>
                        </thead>
                        <tbody>
                          {judgeResult.caseResults.map((testCase, index) => (
                            <tr key={`case-${index}`}>
                              <td>{testCase.hidden ? `Hidden ${index + 1}` : testCase.inputLabel}</td>
                              <td>
                                <span className={testCase.passed ? 'case-pass' : 'case-fail'}>
                                  {testCase.passed ? 'Pass' : 'Fail'}
                                </span>
                              </td>
                              <td>{formatValue(testCase.expected)}</td>
                              <td>{testCase.error ? `Error: ${testCase.error}` : formatValue(testCase.received)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                ) : (
                  <p className="muted">Run your code to execute sample tests, or submit for full hidden test coverage.</p>
                )}

                {communityLoading ? <p className="muted">Syncing community systems...</p> : null}
              </div>
            </div>
          </section>
        </main>
      )}

      {view === 'daily' && (
        <main className="community-workspace">
          <section className="card community-panel">
            <div className="community-header">
              <h1>Daily Challenge</h1>
              <button className="btn ghost tiny" type="button" onClick={openDailyProblem}>
                Open Problem
              </button>
            </div>
            <p className="muted">
              Daily challenge resets every UTC day. Complete it to extend your streak.
            </p>

            <div className="daily-card">
              <p className="daily-date">{dailyDateKey}</p>
              <h2>{dailyProblem.title}</h2>
              <p className="muted">{dailyProblem.topic} · {dailyProblem.difficulty}</p>
              <div className="daily-badges">
                <span className={`status-chip ${dailySolvedToday ? 'status-ok' : 'status-neutral'}`}>
                  {dailySolvedToday ? 'Completed Today' : 'Not Solved Yet'}
                </span>
                <span className="meta-pill">Streak: {dailyStreak} day{dailyStreak === 1 ? '' : 's'}</span>
              </div>
            </div>

            <h2>Recent Daily Attempts</h2>
            <table className="submissions-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Problem</th>
                  <th>Status</th>
                  <th>Runtime</th>
                </tr>
              </thead>
              <tbody>
                {submissions
                  .filter((submission) => submission.problemId === dailyProblem.id)
                  .slice(0, 12)
                  .map((submission) => (
                    <tr key={`daily-${submission.id}`}>
                      <td>{submission.submittedAt.slice(0, 10)}</td>
                      <td>{submission.problemTitle}</td>
                      <td>{submission.status}</td>
                      <td>{submission.runtimeMs} ms</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>

          <section className="card score-rubric">
            <h2>Daily Strategy</h2>
            <ul className="statement-list">
              <li>Solve one daily challenge each day to build consistency.</li>
              <li>Use `Run` first, then `Submit` once stable to keep your acceptance high.</li>
              <li>Write notes after solving to preserve intuition and avoid repeating mistakes.</li>
            </ul>
          </section>
        </main>
      )}

      {view === 'contest' && (
        <main className="community-workspace">
          <section className="card community-panel">
            <div className="community-header">
              <h1>Weekly Timed Contest</h1>
              <div className="contest-actions">
                {contestStartAt ? (
                  <button className="btn ghost tiny" type="button" onClick={endContest}>
                    End Contest
                  </button>
                ) : (
                  <button className="btn secondary tiny" type="button" onClick={startContest}>
                    Start 90m Contest
                  </button>
                )}
              </div>
            </div>

            <div className="contest-summary">
              <span className={`status-chip ${contestStartAt ? 'status-warn' : 'status-neutral'}`}>
                {contestStartAt ? 'Contest Running' : 'Contest Idle'}
              </span>
              <span className="meta-pill">Rating: {ratingProfile.rating}</span>
              {latestContestEvent ? (
                <span className="meta-pill">
                  Last Δ {latestContestEvent.delta >= 0 ? '+' : ''}{latestContestEvent.delta}
                </span>
              ) : null}
              <span className="meta-pill">Time Left: {minutesAndSeconds(contestRemainingMs)}</span>
              <span className="meta-pill">Solved: {contestSolvedCount}/{contestProblems.length}</span>
              {currentContestStanding ? (
                <>
                  <span className="meta-pill">Rank: #{contestStandings.findIndex((row) => row.isCurrentUser) + 1}/{contestStandings.length}</span>
                  <span className="meta-pill">
                    Predicted Δ {currentContestStanding.predictedDelta >= 0 ? '+' : ''}{currentContestStanding.predictedDelta}
                  </span>
                  <span className="meta-pill">
                    Projected Rating {Math.max(800, ratingProfile.rating + currentContestStanding.predictedDelta)}
                  </span>
                </>
              ) : null}
            </div>

            <h2>Live Standings (Simulated Field)</h2>
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>User</th>
                  <th>Solved</th>
                  <th>Penalty</th>
                  <th>Best Runtime</th>
                  <th>Last Accepted</th>
                  <th>Predicted Δ</th>
                </tr>
              </thead>
              <tbody>
                {contestStandings.map((row, index) => (
                  <tr key={`contest-standing-${row.id}`} className={row.isCurrentUser ? 'leaderboard-row-self' : ''}>
                    <td>#{index + 1}</td>
                    <td>{row.username}</td>
                    <td>{row.solved}</td>
                    <td>{row.penalty}</td>
                    <td>{row.bestRuntime} ms</td>
                    <td>{row.lastAcceptedAtMs === 9_999_999 ? '-' : minutesAndSeconds(row.lastAcceptedAtMs)}</td>
                    <td>{row.predictedDelta >= 0 ? '+' : ''}{row.predictedDelta}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Problem</th>
                  <th>Difficulty</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {contestProblems.map((problem) => {
                  const status = problemStatusMap.get(problem.id) ?? 'Unsolved'
                  return (
                    <tr key={`contest-${problem.id}`}>
                      <td>{problem.id}</td>
                      <td>{problem.title}</td>
                      <td>{problem.difficulty}</td>
                      <td>{status}</td>
                      <td>
                        <button
                          className="btn ghost tiny"
                          type="button"
                          onClick={() => {
                            setView('problems')
                            setSelectedProblemId(problem.id)
                            setActiveTab('description')
                          }}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {contestStartAt && (
              <>
                <h2>Contest Submissions</h2>
                <table className="submissions-table">
                  <thead>
                    <tr>
                      <th>Problem</th>
                      <th>Status</th>
                      <th>Passed</th>
                      <th>Runtime</th>
                      <th>Time</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contestSubmissionScope.slice(0, 30).map((submission) => (
                      <tr key={`contest-sub-${submission.id}`}>
                        <td>{submission.problemTitle}</td>
                        <td>{submission.status}</td>
                        <td>{submission.passed}/{submission.total}</td>
                        <td>{submission.runtimeMs} ms</td>
                        <td>{new Date(submission.submittedAt).toLocaleTimeString()}</td>
                        <td>
                          <button className="btn ghost tiny" type="button" onClick={() => openSubmissionDetail(submission.id)}>
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>

          <section className="card score-rubric">
            <h2>Contest Rules</h2>
            <ul className="statement-list">
              <li>Fixed weekly set generated deterministically for fairness.</li>
              <li>Session timer starts when you click start and auto-ends at 90 minutes.</li>
              <li>Tie-breakers follow solved count, then penalty, best accepted runtime, and last accepted time.</li>
              <li>Live standings include predicted rating delta so you can choose when to end the session.</li>
            </ul>
          </section>
        </main>
      )}

      {view === 'mock' && (
        <main className="community-workspace">
          <section className="card community-panel">
            <div className="community-header">
              <h1>Mock Exam (Hard)</h1>
              <div className="contest-actions">
                {mockStartAt ? (
                  <button className="btn ghost tiny" type="button" onClick={endMockExam}>
                    End Mock
                  </button>
                ) : (
                  <button className="btn secondary tiny" type="button" onClick={startMockExam}>
                    Start Mock
                  </button>
                )}
              </div>
            </div>

            <div className="mock-controls">
              <label>
                Topic
                <select
                  value={mockTopic}
                  onChange={(event) => {
                    const next = event.target.value
                    setMockTopic(next)
                    safeWrite(MOCK_TOPIC_STORAGE_KEY, next)
                  }}
                >
                  {mockAvailableTopics.map((topic) => (
                    <option key={`mock-topic-${topic}`} value={topic}>{topic}</option>
                  ))}
                </select>
              </label>
              <label>
                Company Track
                <select
                  value={mockCompanyTrack}
                  onChange={(event) => {
                    const next = event.target.value as CompanyTrack
                    setMockCompanyTrack(next)
                    safeWrite(MOCK_COMPANY_TRACK_STORAGE_KEY, next)
                  }}
                >
                  {COMPANY_TRACKS.map((track) => (
                    <option key={`mock-track-${track}`} value={track}>{track}</option>
                  ))}
                </select>
              </label>
              <label>
                Duration (minutes)
                <input
                  type="number"
                  min={30}
                  max={240}
                  step={15}
                  value={mockDurationMinutes}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    const clamped = Math.min(240, Math.max(30, Number.isFinite(next) ? next : 120))
                    setMockDurationMinutes(clamped)
                    safeWrite(MOCK_DURATION_STORAGE_KEY, clamped)
                  }}
                />
              </label>
            </div>

            <div className="template-summary">
              <span className="meta-pill">Template: {activeMockTemplate.title}</span>
              <span className="muted">{activeMockTemplate.summary}</span>
            </div>

            <div className="contest-summary">
              <span className={`status-chip ${mockStartAt ? 'status-warn' : 'status-neutral'}`}>
                {mockStartAt ? 'Mock Running' : 'Mock Idle'}
              </span>
              <span className="meta-pill">Rating: {ratingProfile.rating}</span>
              {latestMockEvent ? (
                <span className="meta-pill">
                  Last Δ {latestMockEvent.delta >= 0 ? '+' : ''}{latestMockEvent.delta}
                </span>
              ) : null}
              <span className="meta-pill">Track: {mockCompanyTrack}</span>
              <span className="meta-pill">Preset: {activeMockTemplate.title}</span>
              <span className="meta-pill">Time Left: {minutesAndSeconds(mockRemainingMs)}</span>
              <span className="meta-pill">Solved: {mockSolvedCount}/{mockProblems.length || 6}</span>
            </div>

            {mockProblems.length > 0 ? (
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Problem</th>
                    <th>Topic</th>
                    <th>Track Fit</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {mockProblems.map((problem) => {
                    const status = problemStatusMap.get(problem.id) ?? 'Unsolved'
                    const companyTags = (companyTagsByProblemId.get(problem.id) ?? ['All']).filter((tag) => tag !== 'All')
                    return (
                      <tr key={`mock-${problem.id}`}>
                        <td>{problem.id}</td>
                        <td>{problem.title}</td>
                        <td>{problem.topic}</td>
                        <td>{companyTags.slice(0, 2).join(', ') || 'General'}</td>
                        <td>{status}</td>
                        <td>
                          <button
                            className="btn ghost tiny"
                            type="button"
                            onClick={() => {
                              setView('problems')
                              setSelectedProblemId(problem.id)
                              setActiveTab('description')
                            }}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <p className="muted">Start a mock exam to generate a hard-problem set.</p>
            )}

            {mockStartAt && (
              <>
                <h2>Mock Submissions</h2>
                <table className="submissions-table">
                  <thead>
                    <tr>
                      <th>Problem</th>
                      <th>Status</th>
                      <th>Passed</th>
                      <th>Runtime</th>
                      <th>Time</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockSubmissionScope.slice(0, 40).map((submission) => (
                      <tr key={`mock-sub-${submission.id}`}>
                        <td>{submission.problemTitle}</td>
                        <td>{submission.status}</td>
                        <td>{submission.passed}/{submission.total}</td>
                        <td>{submission.runtimeMs} ms</td>
                        <td>{new Date(submission.submittedAt).toLocaleTimeString()}</td>
                        <td>
                          <button className="btn ghost tiny" type="button" onClick={() => openSubmissionDetail(submission.id)}>
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>

          <section className="card score-rubric">
            <h2>Mock Exam Rules</h2>
            <ul className="statement-list">
              <li>Mock sets sample only hard problems to simulate advanced course exams.</li>
              <li>You can filter by topic and company-style tracks (quant, formal, applied math, robotics).</li>
              <li>Each company track maps to a deterministic preset template before deterministic fallback pools.</li>
              <li>Use Proof Mode inside each problem for Lean-based formalization workflow.</li>
              <li>Each completed session updates local rating for long-term progression tracking.</li>
            </ul>
          </section>
        </main>
      )}

      {view === 'profile' && (
        <main className="community-workspace">
          <section className="card community-panel">
            <div className="community-header">
              <h1>Profile</h1>
            </div>
            <p className="muted">
              Personal performance analytics, achievement tracking, and activity history.
            </p>

            <div className="profile-overview-grid">
              <article className="profile-stat-card">
                <h3>Overall Rating</h3>
                <p className="profile-stat-value">{ratingProfile.rating}</p>
                <span className={`meta-pill rating-tier-pill ${currentRatingTier.className}`}>{currentRatingTier.label}</span>
              </article>
              <article className="profile-stat-card">
                <h3>Practice Streak</h3>
                <p className="profile-stat-value">{activePracticeStreak}</p>
                <p className="muted">Consecutive days with accepted submissions</p>
              </article>
              <article className="profile-stat-card">
                <h3>Solved Hard</h3>
                <p className="profile-stat-value">{hardSolvedCount}</p>
                <p className="muted">Hard problems solved end-to-end</p>
              </article>
              <article className="profile-stat-card">
                <h3>Achievements</h3>
                <p className="profile-stat-value">{unlockedAchievements}/{achievementCards.length}</p>
                <p className="muted">Unlocked badge milestones</p>
              </article>
              <article className="profile-stat-card">
                <h3>Lean Accepted</h3>
                <p className="profile-stat-value">{leanAcceptedCount}</p>
                <p className="muted">Formal proof-mode accepted submits</p>
              </article>
              <article className="profile-stat-card">
                <h3>Bookmarked Solved</h3>
                <p className="profile-stat-value">{solvedBookmarkedCount}/{bookmarks.length}</p>
                <p className="muted">Solved from your bookmark queue</p>
              </article>
            </div>

            <h2>Achievements</h2>
            <div className="achievement-grid">
              {achievementCards.map((achievement) => (
                <article
                  key={achievement.id}
                  className={achievement.unlocked ? 'achievement-card unlocked' : 'achievement-card'}
                >
                  <h3>{achievement.title}</h3>
                  <p className="muted">{achievement.description}</p>
                  <span className="meta-pill">{achievement.progressLabel}</span>
                </article>
              ))}
            </div>

            <h2>Accepted Activity (Last 12 Weeks)</h2>
            <div className="activity-heatmap" role="img" aria-label="Accepted activity heatmap">
              {practiceActivityDays.map((day) => (
                <div
                  key={`activity-cell-${day.dateKey}`}
                  className={`activity-cell level-${day.intensity}`}
                  title={`${day.dateKey}: ${day.count} accepted`}
                />
              ))}
            </div>
            <div className="activity-legend muted">
              <span>Less</span>
              <span className="activity-cell level-0" />
              <span className="activity-cell level-1" />
              <span className="activity-cell level-2" />
              <span className="activity-cell level-3" />
              <span className="activity-cell level-4" />
              <span>More</span>
            </div>
          </section>

          <section className="card score-rubric">
            <h2>Language Performance</h2>
            <table className="submissions-table">
              <thead>
                <tr>
                  <th>Language</th>
                  <th>Attempts</th>
                  <th>Accepted</th>
                  <th>Acceptance</th>
                  <th>Avg Runtime</th>
                </tr>
              </thead>
              <tbody>
                {languagePerformanceRows.map((row) => (
                  <tr key={`profile-lang-${row.language}`}>
                    <td>{languageLabels[row.language]}</td>
                    <td>{row.attempts}</td>
                    <td>{row.accepted}</td>
                    <td>{row.acceptedRate}%</td>
                    <td>{row.avgRuntime === null ? '-' : `${row.avgRuntime} ms`}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2>Topic Skill Ratings</h2>
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Rating</th>
                  <th>Tier</th>
                  <th>Sessions</th>
                </tr>
              </thead>
              <tbody>
                {topicRatingRows.map((row) => (
                  <tr key={`profile-topic-rating-${row.topic}`}>
                    <td>{row.topic}</td>
                    <td>{row.rating}</td>
                    <td>
                      <span className={`meta-pill rating-tier-pill ${row.tier.className}`}>{row.tier.label}</span>
                    </td>
                    <td>{row.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2>Bookmark Queue</h2>
            {bookmarkedProblems.length === 0 ? (
              <p className="muted">No bookmarks yet. Add problems from the main catalog.</p>
            ) : (
              <div className="bookmark-grid">
                {bookmarkedProblems.slice(0, 10).map((problem) => (
                  <button
                    key={`profile-bookmark-${problem.id}`}
                    type="button"
                    className="plan-chip"
                    onClick={() => {
                      setView('problems')
                      onPickProblem(problem.id)
                    }}
                  >
                    {problem.id} · {problem.title}
                  </button>
                ))}
              </div>
            )}
          </section>
        </main>
      )}

      {view === 'progress' && (
        <main className="community-workspace">
          <section className="card community-panel">
            <div className="community-header">
              <h1>Progress Dashboard</h1>
            </div>

            <h2>Difficulty Progress</h2>
            <div className="progress-grid">
              {(['Easy', 'Medium', 'Hard'] as Difficulty[]).map((difficulty) => {
                const solved = progressByDifficulty.solved[difficulty]
                const total = progressByDifficulty.totals[difficulty]
                const ratio = total === 0 ? 0 : Math.round((solved / total) * 100)
                return (
                  <div key={`progress-${difficulty}`} className="progress-card">
                    <h3>{difficulty}</h3>
                    <p>{solved}/{total} solved</p>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${ratio}%` }} />
                    </div>
                    <p className="muted">{ratio}% complete</p>
                  </div>
                )
              })}
            </div>

            <h2>Topic Coverage</h2>
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Solved</th>
                  <th>Total</th>
                  <th>Completion</th>
                  <th>Rating</th>
                  <th>Tier</th>
                  <th>Rated Sessions</th>
                </tr>
              </thead>
              <tbody>
                {progressByTopic.map((row) => {
                  const completion = row.total === 0 ? 0 : Math.round((row.solved / row.total) * 100)
                  const topicRating = ratingProfile.topicRatings[row.topic] ?? {
                    rating: BASE_RATING,
                    sessions: 0,
                    updatedAt: '',
                  }
                  const topicTier = ratingTierFor(topicRating.rating)
                  return (
                    <tr key={`topic-progress-${row.topic}`}>
                      <td>{row.topic}</td>
                      <td>{row.solved}</td>
                      <td>{row.total}</td>
                      <td>{completion}%</td>
                      <td>{topicRating.rating}</td>
                      <td>
                        <span className={`meta-pill rating-tier-pill ${topicTier.className}`}>{topicTier.label}</span>
                      </td>
                      <td>{topicRating.sessions}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          <section className="card score-rubric">
            <h2>Rating History</h2>
            {ratingProfile.history.length === 0 ? (
              <p className="muted">No rated contest/mock sessions yet.</p>
            ) : (
              <table className="submissions-table">
                <thead>
                  <tr>
                    <th>Mode</th>
                    <th>Solved</th>
                    <th>Accepted</th>
                    <th>Proof</th>
                    <th>Delta</th>
                    <th>Rating</th>
                    <th>Top Topic Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {ratingProfile.history.slice(0, 10).map((event) => {
                    const topTopic = event.topicDeltas[0]
                    return (
                      <tr key={`rating-event-${event.id}`}>
                        <td>{event.mode}</td>
                        <td>{event.solved}/{event.total}</td>
                        <td>{Math.round(event.acceptedRate * 100)}%</td>
                        <td>{Math.round(event.proofRate * 100)}%</td>
                        <td>{event.delta >= 0 ? '+' : ''}{event.delta}</td>
                        <td>{event.ratingAfter}</td>
                        <td>{topTopic ? `${topTopic.topic} ${topTopic.delta >= 0 ? '+' : ''}${topTopic.delta}` : '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            <h2>Recent Activity</h2>
            <table className="submissions-table">
              <thead>
                <tr>
                  <th>Problem</th>
                  <th>Status</th>
                  <th>Language</th>
                  <th>Runtime</th>
                  <th>Time</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {submissions.slice(0, 20).map((submission) => (
                  <tr key={`activity-${submission.id}`}>
                    <td>{submission.problemTitle}</td>
                    <td>{submission.status}</td>
                    <td>{languageLabels[submission.language]}</td>
                    <td>{submission.runtimeMs} ms</td>
                    <td>{new Date(submission.submittedAt).toLocaleString()}</td>
                    <td>
                      <button className="btn ghost tiny" type="button" onClick={() => openSubmissionDetail(submission.id)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </main>
      )}

      {view === 'teams' && (
        <main className="community-workspace">
          <section className="card community-panel">
            <div className="community-header">
              <h1>Teams</h1>
              <button className="btn ghost tiny" type="button" onClick={() => void refreshLeaderboard()}>
                Refresh
              </button>
            </div>
            <p className="muted">
              Create private team spaces, share invite codes, and track focused leaderboard standings.
            </p>

            {!currentUser ? (
              <div className="empty-state">
                <p className="muted">Sign in to create or join private teams.</p>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    setAuthMode('signin')
                    setAuthOpen(true)
                  }}
                >
                  Sign In
                </button>
              </div>
            ) : (
              <>
                <div className="team-actions-grid">
                  <article className="team-card">
                    <h2>Create Team</h2>
                    <label className="auth-field">
                      Team Name
                      <input
                        type="text"
                        value={createTeamName}
                        onChange={(event) => setCreateTeamName(event.target.value)}
                        placeholder="quant-warriors"
                      />
                    </label>
                    <label className="bookmark-toggle">
                      <input
                        type="checkbox"
                        checked={createTeamPrivate}
                        onChange={(event) => setCreateTeamPrivate(event.target.checked)}
                      />
                      Private Team
                    </label>
                    <button className="btn primary" type="button" onClick={createTeam}>
                      Create Team
                    </button>
                  </article>

                  <article className="team-card">
                    <h2>Join Team</h2>
                    <label className="auth-field">
                      Invite Code
                      <input
                        type="text"
                        value={joinTeamCode}
                        onChange={(event) => setJoinTeamCode(event.target.value.toUpperCase())}
                        placeholder="AB12CD"
                      />
                    </label>
                    <button className="btn secondary" type="button" onClick={joinTeam}>
                      Join
                    </button>
                  </article>
                </div>

                <h2>Your Teams</h2>
                {myTeams.length === 0 ? (
                  <p className="muted">You are not in any teams yet.</p>
                ) : (
                  <div className="team-list">
                    {myTeams.map((team) => (
                      <article key={team.id} className={activeTeamId === team.id ? 'team-card active' : 'team-card'}>
                        <div className="team-card-header">
                          <h3>{team.name}</h3>
                          <button className="btn ghost tiny" type="button" onClick={() => setActiveTeamId(team.id)}>
                            {activeTeamId === team.id ? 'Active' : 'Open'}
                          </button>
                        </div>
                        <p className="muted">Members: {team.members.length}</p>
                        <p className="muted">Invite: <strong>{team.inviteCode}</strong></p>
                        <p className="muted">{team.isPrivate ? 'Private leaderboard enabled.' : 'Public team mode.'}</p>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="card score-rubric">
            <h2>Team Leaderboard</h2>
            {!activeTeam ? (
              <p className="muted">Select a team to view private standings.</p>
            ) : teamLeaderboardEntries.length === 0 ? (
              <p className="muted">No members with ranked activity yet in this team.</p>
            ) : (
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>User</th>
                    <th>Solved</th>
                    <th>Proof</th>
                    <th>Rating</th>
                    <th>Composite</th>
                  </tr>
                </thead>
                <tbody>
                  {teamLeaderboardEntries.map((entry) => (
                    <tr key={`team-rank-${entry.id}`} className={entry.id === currentUser?.id ? 'leaderboard-row-self' : ''}>
                      <td>#{entry.rank}</td>
                      <td>{entry.username}</td>
                      <td>{entry.solvedCount}</td>
                      <td>{entry.proofScore}</td>
                      <td>{entry.rating}</td>
                      <td>{entry.compositeScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeTeam ? (
              <>
                <h2>Members</h2>
                <table className="submissions-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTeam.members.map((member) => (
                      <tr key={`team-member-${activeTeam.id}-${member.userId}`}>
                        <td>{member.username}</td>
                        <td>{new Date(member.joinedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}
          </section>
        </main>
      )}

      {view === 'submission-detail' && (
        <main className="community-workspace">
          <section className="card community-panel">
            <div className="community-header">
              <h1>Submission Detail</h1>
              <button className="btn ghost tiny" type="button" onClick={() => setView('problems')}>
                Back To Problems
              </button>
            </div>

            {!selectedSubmission ? (
              <p className="muted">Select a submission from problem/contest/mock/profile tables.</p>
            ) : (
              <>
                <div className="contest-summary">
                  <span className="meta-pill">{selectedSubmission.problemId}</span>
                  <span className="meta-pill">{selectedSubmission.problemTitle}</span>
                  <span className="meta-pill">{selectedSubmission.status}</span>
                  <span className="meta-pill">{languageLabels[selectedSubmission.language]}</span>
                  <span className="meta-pill">{selectedSubmission.passed}/{selectedSubmission.total} tests</span>
                  <span className="meta-pill">{selectedSubmission.runtimeMs} ms</span>
                  <span className="meta-pill">Score {selectedSubmission.score ?? 0}</span>
                  <span className="meta-pill">{new Date(selectedSubmission.submittedAt).toLocaleString()}</span>
                </div>

                {selectedSubmissionProblem ? (
                  <button
                    className="btn secondary tiny"
                    type="button"
                    onClick={() => {
                      setView('problems')
                      setSelectedProblemId(selectedSubmissionProblem.id)
                      setActiveTab('submissions')
                    }}
                  >
                    Open Problem
                  </button>
                ) : null}

                {selectedSubmission.message ? <p className="result-message">{selectedSubmission.message}</p> : null}

                <h2>Source Code Snapshot</h2>
                <pre className="review-code">{selectedSubmission.sourceCode ?? 'No source snapshot stored.'}</pre>
              </>
            )}
          </section>

          <section className="card score-rubric">
            <h2>Case Breakdown</h2>
            {!selectedSubmission ? (
              <p className="muted">No submission selected.</p>
            ) : !selectedSubmission.caseResults || selectedSubmission.caseResults.length === 0 ? (
              <p className="muted">Case-level output was not captured for this submission.</p>
            ) : (
              <table className="cases-table">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Result</th>
                    <th>Expected</th>
                    <th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSubmission.caseResults.map((testCase, index) => (
                    <tr key={`detail-case-${selectedSubmission.id}-${index}`}>
                      <td>{testCase.hidden ? `Hidden ${index + 1}` : testCase.inputLabel}</td>
                      <td>
                        <span className={testCase.passed ? 'case-pass' : 'case-fail'}>
                          {testCase.passed ? 'Pass' : 'Fail'}
                        </span>
                      </td>
                      <td>{formatValue(testCase.expected)}</td>
                      <td>{testCase.error ? `Error: ${testCase.error}` : formatValue(testCase.received)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </main>
      )}

      {view === 'plans' && (
        <main className="community-workspace">
          <section className="card community-panel">
            <div className="community-header">
              <h1>Study Plans</h1>
            </div>
            <p className="muted">
              Structured tracks that mirror university sequencing and LeetCode-style topic roadmaps.
            </p>

            <div className="plan-list">
              {studyPlanProgress.map((plan) => (
                <article key={plan.id} className="plan-card">
                  <div className="plan-header">
                    <div>
                      <h2>{plan.title}</h2>
                      <p className="muted">{plan.summary}</p>
                    </div>
                    <button
                      className="btn ghost tiny"
                      type="button"
                      onClick={() => openNextPlanProblem(plan.nextProblemId)}
                    >
                      {plan.nextProblemId ? 'Open Next' : 'Completed'}
                    </button>
                  </div>

                  <div className="plan-progress-row">
                    <span className="meta-pill">{plan.solved}/{plan.total} solved</span>
                    <span className="meta-pill">{plan.ratio}% complete</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${plan.ratio}%` }} />
                  </div>

                  <div className="plan-chip-grid">
                    {plan.validProblemIds.map((problemId) => {
                      const problem = problemById.get(problemId)
                      if (!problem) return null
                      const solved = acceptedProblemIds.has(problemId)
                      return (
                        <button
                          key={`${plan.id}-${problemId}`}
                          type="button"
                          className={solved ? 'plan-chip solved' : 'plan-chip'}
                          onClick={() => openNextPlanProblem(problemId)}
                        >
                          {problem.id} · {problem.title}
                        </button>
                      )
                    })}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="card score-rubric">
            <h2>Plan Usage</h2>
            <ul className="statement-list">
              <li>Use `Open Next` to follow recommended order without context switching.</li>
              <li>Submit each problem to count toward solved-plan completion metrics.</li>
              <li>Combine plans with Daily + Contest to mimic exam pressure and retention cycles.</li>
            </ul>
          </section>
        </main>
      )}

      {view === 'discuss' && (
        <main className="community-workspace">
          <section className="card community-panel">
            <div className="community-header">
              <h1>Discuss</h1>
              <select
                className="difficulty-select discuss-filter"
                value={discussionProblemFilter}
                onChange={(event) => setDiscussionProblemFilter(event.target.value)}
              >
                <option value="All">All Problems</option>
                {STEM_PROBLEMS.map((problem) => (
                  <option key={`discussion-filter-${problem.id}`} value={problem.id}>
                    {problem.id} · {problem.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="discussion-compose">
              <h2>Create Thread</h2>
              <label className="auth-field">
                Problem
                <select
                  value={discussionComposeProblemId}
                  onChange={(event) => setDiscussionComposeProblemId(event.target.value)}
                >
                  {STEM_PROBLEMS.map((problem) => (
                    <option key={`discussion-compose-${problem.id}`} value={problem.id}>
                      {problem.id} · {problem.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="auth-field">
                Title
                <input
                  type="text"
                  value={newThreadTitle}
                  onChange={(event) => setNewThreadTitle(event.target.value)}
                  placeholder="State your approach question or proof issue..."
                />
              </label>
              <label className="auth-field">
                Body
                <textarea
                  className="discussion-body"
                  value={newThreadBody}
                  onChange={(event) => setNewThreadBody(event.target.value)}
                  placeholder="Include assumptions, derivations, and where your reasoning breaks."
                />
              </label>
              <button className="btn secondary" type="button" onClick={createDiscussionThread}>
                Post Thread
              </button>
            </div>

            <div className="discussion-list">
              {discussionPosts.length === 0 ? (
                <p className="muted">No threads yet for this filter.</p>
              ) : (
                discussionPosts.map((thread) => {
                  const problem = problemById.get(thread.problemId)
                  const hasUpvoted = thread.votes.includes(discussionViewerId)
                  return (
                    <article key={thread.id} className="discussion-card">
                      <div className="discussion-head">
                        <div>
                          <h3>{thread.title}</h3>
                          <p className="muted">
                            {thread.problemId} · {problem?.title ?? 'Unknown Problem'} · by {thread.author}
                          </p>
                        </div>
                        <button
                          className={hasUpvoted ? 'btn ghost tiny voted' : 'btn ghost tiny'}
                          type="button"
                          onClick={() => toggleDiscussionVote(thread.id)}
                        >
                          ▲ {thread.votes.length}
                        </button>
                      </div>

                      <p>{thread.body}</p>

                      <div className="discussion-replies">
                        {thread.replies.map((reply) => (
                          <div key={reply.id} className="discussion-reply">
                            <p className="muted">{reply.author} · {new Date(reply.createdAt).toLocaleString()}</p>
                            <p>{reply.body}</p>
                          </div>
                        ))}
                      </div>

                      <label className="auth-field">
                        Reply
                        <textarea
                          className="discussion-reply-input"
                          value={replyDrafts[thread.id] ?? ''}
                          onChange={(event) =>
                            setReplyDrafts((prev) => ({
                              ...prev,
                              [thread.id]: event.target.value,
                            }))
                          }
                          placeholder="Challenge assumptions, provide counterexample, or validate derivation."
                        />
                      </label>
                      <button className="btn primary" type="button" onClick={() => submitDiscussionReply(thread.id)}>
                        Post Reply
                      </button>
                    </article>
                  )
                })
              )}
            </div>
          </section>

          <section className="card score-rubric">
            <h2>Discussion Norms</h2>
            <ul className="statement-list">
              <li>Prioritize reproducible logic: include formulas, counterexamples, and edge cases.</li>
              <li>Use replies to validate or challenge proofs before final submit.</li>
              <li>High-signal discussion improves verification quality and contributor trust.</li>
            </ul>
          </section>
        </main>
      )}

      {view === 'leaderboard' && (
        <main className="community-workspace">
          <section className="card community-panel">
            <div className="community-header">
              <h1>Global Leaderboard</h1>
              <button className="btn ghost tiny" type="button" onClick={() => void refreshLeaderboard()}>
                Refresh
              </button>
            </div>
            <p className="muted">
              Composite ranking combines solution performance, validated peer-review quality, and contributor impact.
            </p>

            {communityLoading ? (
              <p className="muted">Loading leaderboard...</p>
            ) : (
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>User</th>
                    <th>Solved</th>
                    <th>Proof</th>
                    <th>Reputation</th>
                    <th>Contrib</th>
                    <th>Review</th>
                    <th>Rating</th>
                    <th>Composite</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => {
                    const tier = ratingTierFor(entry.rating)
                    return (
                      <tr
                        key={entry.id}
                        className={currentUser?.id === entry.id ? 'leaderboard-row-self' : ''}
                      >
                        <td>#{entry.rank}</td>
                        <td>{entry.username}</td>
                        <td>{entry.solvedCount}</td>
                        <td>{entry.proofScore}</td>
                        <td>{entry.reputation}</td>
                        <td>{entry.contributionScore}</td>
                        <td>{entry.reviewScore}</td>
                        <td>
                          <span className={`meta-pill rating-tier-pill ${tier.className}`}>
                            {entry.rating} · {tier.label}
                          </span>
                        </td>
                        <td>{entry.compositeScore}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className="card score-rubric">
            <h2>Scoring Model</h2>
            <ul className="statement-list">
              <li>Submission score weights: correctness, runtime efficiency, difficulty multiplier, language multiplier, proof-quality multipliers.</li>
              <li>Contributor score weights: accepted-solution points, review quality, and consensus alignment.</li>
              <li>Leaderboard rows now expose explicit proof score and skill rating in addition to composite rank.</li>
              <li>Leaderboard composite: reputation + contribution + review impact + solved count.</li>
              <li>Proof-complete Lean submissions receive stronger positive weighting than proof-incomplete attempts.</li>
              <li>Peer reviews are bounded and normalized so spam cannot dominate ranking.</li>
            </ul>
          </section>
        </main>
      )}

      {view === 'reviews' && (
        <main className="community-workspace">
          <section className="card community-panel">
            <div className="community-header">
              <h1>Peer Verification Queue</h1>
              <button className="btn ghost tiny" type="button" onClick={() => void refreshReviewQueue()}>
                Refresh
              </button>
            </div>

            {!currentUser ? (
              <div className="empty-state">
                <p className="muted">Sign in to verify other contributors' solutions and earn review score.</p>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    setAuthMode('signin')
                    setAuthOpen(true)
                  }}
                >
                  Sign In
                </button>
              </div>
            ) : communityLoading ? (
              <p className="muted">Loading review queue...</p>
            ) : reviewQueue.length === 0 ? (
              <p className="muted">No pending community submissions require your review right now.</p>
            ) : (
              <div className="review-list">
                {reviewQueue.map((item) => {
                  const draft = getReviewDraft(item.submission.id)
                  return (
                    <article key={item.submission.id} className="review-card">
                      <div className="review-card-header">
                        <div>
                          <h3>{item.submission.problemTitle}</h3>
                          <p className="muted">
                            {item.submission.problemId} · {item.submission.topic} · {item.submission.username}
                          </p>
                        </div>
                        <span className={scoreChipClass(item.submission.score)}>
                          Score {item.submission.score}
                        </span>
                      </div>

                      <p className="muted">
                        {item.submission.status} · {item.submission.passed}/{item.submission.total} tests · {item.submission.runtimeMs} ms
                      </p>

                      {item.existingReviews.length > 0 && (
                        <p className="muted">Existing peer reviews: {item.existingReviews.length}</p>
                      )}

                      <details className="review-code-wrap">
                        <summary>View submitted code</summary>
                        <pre className="review-code">{item.submission.sourceCode}</pre>
                      </details>

                      <div className="review-form-grid">
                        <label>
                          Verdict
                          <select
                            value={draft.verdict}
                            onChange={(event) =>
                              updateReviewDraft(item.submission.id, {
                                verdict: event.target.value as ReviewInput['verdict'],
                              })
                            }
                          >
                            <option value="approve">Approve</option>
                            <option value="request_changes">Request Changes</option>
                          </select>
                        </label>

                        <label>
                          Correctness (1-10)
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={draft.correctnessScore}
                            onChange={(event) =>
                              updateReviewDraft(item.submission.id, {
                                correctnessScore: Number(event.target.value),
                              })
                            }
                          />
                        </label>

                        <label>
                          Explanation (1-10)
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={draft.explanationScore}
                            onChange={(event) =>
                              updateReviewDraft(item.submission.id, {
                                explanationScore: Number(event.target.value),
                              })
                            }
                          />
                        </label>

                        <label>
                          Rigor (1-10)
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={draft.rigorScore}
                            onChange={(event) =>
                              updateReviewDraft(item.submission.id, {
                                rigorScore: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </div>

                      <label className="review-comment-label">
                        Review Notes
                        <textarea
                          value={draft.comment}
                          onChange={(event) =>
                            updateReviewDraft(item.submission.id, { comment: event.target.value })
                          }
                          placeholder="Call out proof gaps, incorrect assumptions, performance concerns, and strengths."
                        />
                      </label>

                      <button
                        className="btn primary"
                        type="button"
                        disabled={reviewSubmittingId === item.submission.id}
                        onClick={() => void submitReview(item.submission.id)}
                      >
                        {reviewSubmittingId === item.submission.id ? 'Submitting...' : 'Submit Verification'}
                      </button>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </main>
      )}

      {authOpen && (
        <div className="auth-overlay" role="presentation" onClick={() => setAuthOpen(false)}>
          <div className="auth-modal card" role="dialog" onClick={(event) => event.stopPropagation()}>
            <div className="auth-header">
              <h2>{authMode === 'signin' ? 'Sign In' : 'Create Account'}</h2>
              <button className="btn ghost tiny" type="button" onClick={() => setAuthOpen(false)}>
                Close
              </button>
            </div>

            <div className="auth-mode-switch">
              <button
                className={authMode === 'signin' ? 'tab-btn active' : 'tab-btn'}
                type="button"
                onClick={() => setAuthMode('signin')}
              >
                Sign In
              </button>
              <button
                className={authMode === 'signup' ? 'tab-btn active' : 'tab-btn'}
                type="button"
                onClick={() => setAuthMode('signup')}
              >
                Sign Up
              </button>
            </div>

            <label className="auth-field">
              Email
              <input
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>

            {authMode === 'signup' && (
              <label className="auth-field">
                Username
                <input
                  type="text"
                  value={authUsername}
                  onChange={(event) => setAuthUsername(event.target.value)}
                  placeholder="proof-engineer"
                />
              </label>
            )}

            <label className="auth-field">
              Password
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                placeholder="At least 6 characters"
              />
            </label>

            <button className="btn primary" type="button" onClick={() => void submitAuth()} disabled={communityLoading}>
              {communityLoading ? 'Working...' : authMode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>

            <p className="muted small-note">
              Backend mode: <strong>{communityService.mode}</strong>. Configure Supabase env vars for production auth/data.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
