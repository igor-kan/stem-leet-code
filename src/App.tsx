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

type PanelTab = 'description' | 'editorial' | 'submissions'
type TopView = 'problems' | 'leaderboard' | 'reviews'
type AuthMode = 'signin' | 'signup'

interface ReviewDraft {
  verdict: ReviewInput['verdict']
  correctnessScore: number
  explanationScore: number
  rigorScore: number
  comment: string
}

const SOURCE_STORAGE_KEY = 'stem-leet-code:sources:v1'
const SUBMISSION_STORAGE_KEY = 'stem-leet-code:submissions:v1'

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

export default function App() {
  const [view, setView] = useState<TopView>('problems')
  const [query, setQuery] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState<'All' | Difficulty>('All')
  const [selectedProblemId, setSelectedProblemId] = useState(STEM_PROBLEMS[0]?.id ?? '')
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE)
  const [activeTab, setActiveTab] = useState<PanelTab>('description')
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null)
  const [lastAction, setLastAction] = useState<'Run' | 'Submit' | null>(null)

  const [sources, setSources] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    return safeRead<Record<string, string>>(SOURCE_STORAGE_KEY, {})
  })

  const [submissions, setSubmissions] = useState<SubmissionRecord[]>(() => {
    if (typeof window === 'undefined') return []
    return safeRead<SubmissionRecord[]>(SUBMISSION_STORAGE_KEY, [])
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

  const filteredProblems = useMemo(() => {
    return STEM_PROBLEMS.filter((problem) => {
      if (difficultyFilter !== 'All' && problem.difficulty !== difficultyFilter) return false

      if (!query.trim()) return true
      const needle = query.toLowerCase()
      return (
        problem.title.toLowerCase().includes(needle) ||
        problem.topic.toLowerCase().includes(needle) ||
        problem.tags.some((tag) => tag.toLowerCase().includes(needle))
      )
    })
  }, [difficultyFilter, query])

  const selectedProblem =
    STEM_PROBLEMS.find((problem) => problem.id === selectedProblemId) ??
    filteredProblems[0] ??
    STEM_PROBLEMS[0]

  const currentSourceKey = buildKey(selectedProblem.id, language)
  const currentSource = sources[currentSourceKey] ?? getStarterCode(selectedProblem, language)

  const scopedSubmissions = useMemo(() => {
    return submissions.filter((submission) => submission.problemId === selectedProblem.id)
  }, [selectedProblem.id, submissions])

  const solvedCount = useMemo(() => {
    const solved = new Set<string>()
    for (const submission of submissions) {
      if (submission.status === 'Accepted') solved.add(submission.problemId)
    }
    return solved.size
  }, [submissions])

  const currentLeaderboardRank = useMemo(() => {
    if (!currentUser) return null
    const entry = leaderboard.find((item) => item.id === currentUser.id)
    return entry?.rank ?? null
  }, [currentUser, leaderboard])

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

  const refreshLeaderboard = async () => {
    setCommunityLoading(true)
    const data = await communityService.listLeaderboard(50)
    setLeaderboard(data)
    setCommunityLoading(false)
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
            className={view === 'reviews' ? 'nav-pill active' : 'nav-pill'}
            type="button"
            onClick={() => setView('reviews')}
          >
            Peer Review
          </button>
        </nav>

        <div className="topbar-right">
          <div className="top-stats">
            Solved {solvedCount}/{STEM_PROBLEMS.length}
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
            </div>

            <div className="problem-table-wrap">
              <table className="problem-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Difficulty</th>
                    <th>Acceptance</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProblems.map((problem) => {
                    const isSelected = problem.id === selectedProblem.id
                    return (
                      <tr
                        key={problem.id}
                        className={isSelected ? 'selected-row' : ''}
                        onClick={() => onPickProblem(problem.id)}
                      >
                        <td>
                          <div className="problem-title-cell">
                            <span className="problem-id">{problem.id}</span>
                            <span>{problem.title}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`difficulty-chip ${difficultyClass(problem.difficulty)}`}>
                            {problem.difficulty}
                          </span>
                        </td>
                        <td>{problem.acceptance.toFixed(1)}%</td>
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
