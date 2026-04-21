import { useMemo, useState } from 'react'
import { DEFAULT_LANGUAGE, STEM_PROBLEMS } from './data/problems'
import { runJudge } from './lib/judge'
import { getStarterCode } from './lib/starter-code'
import type {
  Difficulty,
  JudgeResult,
  Language,
  SubmissionRecord,
  StemProblem,
} from './types'

type PanelTab = 'description' | 'editorial' | 'submissions'

const SOURCE_STORAGE_KEY = 'stem-leet-code:sources:v1'
const SUBMISSION_STORAGE_KEY = 'stem-leet-code:submissions:v1'

const languageLabels: Record<Language, string> = {
  javascript: 'JavaScript',
  python: 'Python',
  cpp: 'C++',
  java: 'Java',
  lean4: 'Lean4',
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

export default function App() {
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-area">
          <span className="brand-mark">STEM</span>
          <span className="brand-text">LeetCode</span>
        </div>
        <nav className="top-nav">
          <button className="nav-pill active" type="button">
            Problems
          </button>
          <button className="nav-pill" type="button">
            Contests
          </button>
          <button className="nav-pill" type="button">
            Discuss
          </button>
        </nav>
        <div className="top-stats">Solved {solvedCount}/{STEM_PROBLEMS.length}</div>
      </header>

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
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
