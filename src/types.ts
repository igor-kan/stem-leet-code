export type Difficulty = 'Easy' | 'Medium' | 'Hard'

export type Language = 'javascript' | 'python' | 'cpp' | 'java'

export interface TestCase {
  inputLabel: string
  args: unknown[]
  expected: unknown
  hidden?: boolean
}

export interface StemProblem {
  id: string
  title: string
  slug: string
  difficulty: Difficulty
  topic: string
  acceptance: number
  tags: string[]
  description: string
  examples: Array<{ input: string; output: string; explanation: string }>
  constraints: string[]
  functionName: string
  numericTolerance?: number
  starterCode: Record<Language, string>
  editorial: string[]
  testCases: TestCase[]
}

export interface CaseResult {
  inputLabel: string
  expected: unknown
  received: unknown
  passed: boolean
  hidden: boolean
  error?: string
}

export interface JudgeResult {
  status: 'Accepted' | 'Wrong Answer' | 'Runtime Error' | 'Language Not Supported'
  runtimeMs: number
  passed: number
  total: number
  caseResults: CaseResult[]
  message?: string
}

export interface SubmissionRecord {
  id: string
  submittedAt: string
  problemId: string
  problemTitle: string
  language: Language
  status: JudgeResult['status']
  passed: number
  total: number
  runtimeMs: number
}
