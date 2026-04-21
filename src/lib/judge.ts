import type { JudgeResult, Language, StemProblem, TestCase } from '../types'

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function compareValues(a: unknown, b: unknown, tolerance = 0): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= tolerance
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
      if (!compareValues(a[i], b[i], tolerance)) return false
    }
    return true
  }

  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const keysA = Object.keys(a as Record<string, unknown>)
    const keysB = Object.keys(b as Record<string, unknown>)
    if (keysA.length !== keysB.length) return false
    for (const key of keysA) {
      if (!compareValues((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], tolerance)) {
        return false
      }
    }
    return true
  }

  return a === b
}

function executeJs(problem: StemProblem, sourceCode: string, testCases: TestCase[]): JudgeResult {
  const startedAt = performance.now()
  const tolerance = problem.numericTolerance ?? 0

  try {
    // eslint-disable-next-line no-new-func
    const buildFn = new Function(
      `${sourceCode}\nreturn typeof ${problem.functionName} === 'function' ? ${problem.functionName} : null;`
    )

    const candidate = buildFn()

    if (typeof candidate !== 'function') {
      return {
        status: 'Runtime Error',
        runtimeMs: Math.round(performance.now() - startedAt),
        passed: 0,
        total: testCases.length,
        caseResults: [],
        message: `Function '${problem.functionName}' was not found in your code.`,
      }
    }

    const caseResults = testCases.map((testCase) => {
      try {
        const args = deepClone(testCase.args)
        const received = candidate(...args)
        const passed = compareValues(received, testCase.expected, tolerance)
        return {
          inputLabel: testCase.inputLabel,
          expected: testCase.expected,
          received,
          passed,
          hidden: Boolean(testCase.hidden),
        }
      } catch (error) {
        return {
          inputLabel: testCase.inputLabel,
          expected: testCase.expected,
          received: null,
          passed: false,
          hidden: Boolean(testCase.hidden),
          error: error instanceof Error ? error.message : 'Unknown runtime error',
        }
      }
    })

    const passed = caseResults.filter((r) => r.passed).length
    const hasRuntimeError = caseResults.some((r) => r.error)

    return {
      status: hasRuntimeError ? 'Runtime Error' : passed === testCases.length ? 'Accepted' : 'Wrong Answer',
      runtimeMs: Math.round(performance.now() - startedAt),
      passed,
      total: testCases.length,
      caseResults,
      message: hasRuntimeError ? 'One or more test cases threw a runtime error.' : undefined,
    }
  } catch (error) {
    return {
      status: 'Runtime Error',
      runtimeMs: Math.round(performance.now() - startedAt),
      passed: 0,
      total: testCases.length,
      caseResults: [],
      message: error instanceof Error ? error.message : 'Failed to compile/evaluate JavaScript code.',
    }
  }
}

function extractLeanBridgeJavascript(sourceCode: string, functionName: string): { javascript: string | null; message?: string } {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const hasDef = new RegExp(`\\bdef\\s+${escapedName}\\b`).test(sourceCode)

  if (!hasDef) {
    return {
      javascript: null,
      message: `Lean4 declaration missing. Add 'def ${functionName} ... := ...' in your submission.`,
    }
  }

  const jsBlock = sourceCode.match(/\/-\!\s*JS_SOLVER\s*([\s\S]*?)\s*-\//m)
  if (!jsBlock) {
    return {
      javascript: null,
      message:
        "Lean4 bridge block not found. Add '/-! JS_SOLVER ... -/' and place a JavaScript implementation inside.",
    }
  }

  const javascript = jsBlock[1].trim()
  if (!javascript) {
    return {
      javascript: null,
      message: 'Lean4 bridge block is empty. Add a JavaScript implementation inside JS_SOLVER.',
    }
  }

  return { javascript }
}

function executeLean4(problem: StemProblem, sourceCode: string, testCases: TestCase[]): JudgeResult {
  const startedAt = performance.now()
  const extracted = extractLeanBridgeJavascript(sourceCode, problem.functionName)
  if (!extracted.javascript) {
    return {
      status: 'Runtime Error',
      runtimeMs: Math.round(performance.now() - startedAt),
      passed: 0,
      total: testCases.length,
      caseResults: [],
      message: extracted.message,
    }
  }

  const result = executeJs(problem, extracted.javascript, testCases)
  return {
    ...result,
    runtimeMs: Math.round(performance.now() - startedAt),
    message: result.message,
  }
}

export function runJudge(problem: StemProblem, language: Language, sourceCode: string, submitMode: boolean): JudgeResult {
  const selectedTests = submitMode
    ? problem.testCases
    : problem.testCases.filter((testCase) => !testCase.hidden)

  if (language === 'javascript') {
    return executeJs(problem, sourceCode, selectedTests)
  }

  if (language === 'lean4') {
    return executeLean4(problem, sourceCode, selectedTests)
  }

  return {
    status: 'Language Not Supported',
    runtimeMs: 0,
    passed: 0,
    total: 0,
    caseResults: [],
    message: 'In-browser execution currently supports JavaScript and Lean4 bridge mode.',
  }
}
