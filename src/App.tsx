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

type PanelTab = 'description' | 'editorial' | 'submissions' | 'notes'
type TopView =
  | 'problems'
  | 'daily'
  | 'contest'
  | 'leaderboard'
  | 'reviews'
  | 'progress'
  | 'discuss'
  | 'plans'
type AuthMode = 'signin' | 'signup'
type StatusFilter = 'All' | 'Solved' | 'Attempted' | 'Unsolved'

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

const SOURCE_STORAGE_KEY = 'stem-leet-code:sources:v1'
const SUBMISSION_STORAGE_KEY = 'stem-leet-code:submissions:v1'
const BOOKMARK_STORAGE_KEY = 'stem-leet-code:bookmarks:v1'
const NOTES_STORAGE_KEY = 'stem-leet-code:notes:v1'
const HINT_REVEALS_STORAGE_KEY = 'stem-leet-code:hint-reveals:v1'
const CONTEST_START_STORAGE_KEY = 'stem-leet-code:contest-start:v1'
const DISCUSSION_STORAGE_KEY = 'stem-leet-code:discussion:v1'
const DISCUSSION_VOTER_KEY = 'stem-leet-code:discussion-voter:v1'

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
    problemIds: ['STEM-701', 'STEM-702', 'STEM-704', 'STEM-705', 'STEM-751', 'STEM-752', 'STEM-755', 'STEM-756'],
  },
  {
    id: 'plan-linear-core',
    title: 'Linear Algebra Core',
    summary: 'Determinants, systems, matrix products, orthogonality, and eigen basics.',
    problemIds: ['STEM-711', 'STEM-712', 'STEM-713', 'STEM-714', 'STEM-715', 'STEM-761', 'STEM-762', 'STEM-765', 'STEM-766'],
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
      'STEM-785',
      'STEM-786',
    ],
  },
  {
    id: 'plan-regression-track',
    title: 'Regression Analysis Track',
    summary: 'Loss metrics, line fitting, slope/intercept, R^2, and model error diagnostics.',
    problemIds: ['STEM-771', 'STEM-772', 'STEM-773', 'STEM-774', 'STEM-791', 'STEM-792', 'STEM-793', 'STEM-794', 'STEM-795', 'STEM-796'],
  },
]

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

export default function App() {
  const [view, setView] = useState<TopView>('problems')
  const [query, setQuery] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState<'All' | Difficulty>('All')
  const [topicFilter, setTopicFilter] = useState<'All' | string>('All')
  const [tagFilter, setTagFilter] = useState<'All' | string>('All')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [bookmarkOnly, setBookmarkOnly] = useState(false)
  const [selectedProblemId, setSelectedProblemId] = useState(STEM_PROBLEMS[0]?.id ?? '')
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

  const [hintReveals, setHintReveals] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {}
    return safeRead<Record<string, number>>(HINT_REVEALS_STORAGE_KEY, {})
  })

  const [contestStartAt, setContestStartAt] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return safeRead<string | null>(CONTEST_START_STORAGE_KEY, null)
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

  const selectedProblem =
    STEM_PROBLEMS.find((problem) => problem.id === selectedProblemId) ??
    filteredProblems[0] ??
    STEM_PROBLEMS[0]
  const selectedProblemNote = notes[selectedProblem.id] ?? ''
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
    const loadData = async () => {
      if (view === 'leaderboard') {
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
    setContestStartAt(null)
    safeWrite(CONTEST_START_STORAGE_KEY, null)
    setCommunityMessage('Contest timer finished. Session has ended.')
  }, [contestRemainingMs, contestStartAt])

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
    const pool = filteredProblems.length > 0 ? filteredProblems : STEM_PROBLEMS
    const next = pool[Math.floor(Math.random() * pool.length)]
    if (!next) return
    setSelectedProblemId(next.id)
    setActiveTab('description')
    setJudgeResult(null)
  }

  const startContest = () => {
    const started = new Date().toISOString()
    setContestStartAt(started)
    safeWrite(CONTEST_START_STORAGE_KEY, started)
    setCommunityMessage('Contest started: 90-minute timer is running.')
  }

  const endContest = () => {
    setContestStartAt(null)
    safeWrite(CONTEST_START_STORAGE_KEY, null)
    setCommunityMessage('Contest session ended.')
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
                  {filteredProblems.map((problem) => {
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
              <span className="meta-pill">Time Left: {minutesAndSeconds(contestRemainingMs)}</span>
              <span className="meta-pill">Solved: {contestSolvedCount}/{contestProblems.length}</span>
            </div>

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
              <li>Score proxy: solved count and runtime quality from accepted submissions.</li>
            </ul>
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
                </tr>
              </thead>
              <tbody>
                {progressByTopic.map((row) => {
                  const completion = row.total === 0 ? 0 : Math.round((row.solved / row.total) * 100)
                  return (
                    <tr key={`topic-progress-${row.topic}`}>
                      <td>{row.topic}</td>
                      <td>{row.solved}</td>
                      <td>{row.total}</td>
                      <td>{completion}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          <section className="card score-rubric">
            <h2>Recent Activity</h2>
            <table className="submissions-table">
              <thead>
                <tr>
                  <th>Problem</th>
                  <th>Status</th>
                  <th>Language</th>
                  <th>Runtime</th>
                  <th>Time</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
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
                    <th>Reputation</th>
                    <th>Contrib</th>
                    <th>Review</th>
                    <th>Composite</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => (
                    <tr
                      key={entry.id}
                      className={currentUser?.id === entry.id ? 'leaderboard-row-self' : ''}
                    >
                      <td>#{entry.rank}</td>
                      <td>{entry.username}</td>
                      <td>{entry.solvedCount}</td>
                      <td>{entry.reputation}</td>
                      <td>{entry.contributionScore}</td>
                      <td>{entry.reviewScore}</td>
                      <td>{entry.compositeScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card score-rubric">
            <h2>Scoring Model</h2>
            <ul className="statement-list">
              <li>Submission score weights: correctness, runtime efficiency, difficulty multiplier, language multiplier.</li>
              <li>Contributor score weights: accepted-solution points, review quality, and consensus alignment.</li>
              <li>Leaderboard composite: reputation + contribution + review impact + solved count.</li>
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
