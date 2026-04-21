import type { Language, StemProblem } from '../types'

function inferLeanType(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'Int' : 'Float'
  }

  if (typeof value === 'boolean') return 'Bool'
  if (typeof value === 'string') return 'String'

  if (Array.isArray(value)) {
    if (value.length === 0) return 'Array Float'
    return `Array ${inferLeanType(value[0])}`
  }

  return 'Float'
}

function extractArgNamesFromJs(functionName: string, javascriptStarter: string, fallbackCount: number): string[] {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const fnMatch = javascriptStarter.match(new RegExp(`function\\s+${escaped}\\s*\\(([^)]*)\\)`))
  if (!fnMatch) {
    return Array.from({ length: fallbackCount }, (_, index) => `arg${index + 1}`)
  }

  const raw = fnMatch[1].trim()
  if (!raw) return []
  return raw.split(',').map((token) => token.trim()).filter(Boolean)
}

function buildLean4Starter(problem: StemProblem): string {
  const sampleArgs = problem.testCases[0]?.args ?? []
  const sampleExpected = problem.testCases[0]?.expected

  const javascriptStarter =
    problem.starterCode.javascript ??
    `function ${problem.functionName}(${sampleArgs.map((_, index) => `arg${index + 1}`).join(', ')}) {\n  // TODO\n  return null\n}`

  const argNames = extractArgNamesFromJs(problem.functionName, javascriptStarter, sampleArgs.length)
  const argsSignature = argNames
    .map((argName, index) => ` (${argName} : ${inferLeanType(sampleArgs[index])})`)
    .join('')
  const returnType = inferLeanType(sampleExpected)

  return `/-\nSTEM Leet Code Lean4 Bridge Mode\n\nThis web app runs in-browser and cannot execute a native Lean runtime directly.\nTo keep Lean4 workflow available, use this file as follows:\n1) Keep a Lean definition for \`${problem.functionName}\`.\n2) Include at least one theorem/lemma proof block and remove all \`sorry/admit\` on final submit.\n3) Put executable logic in the JS bridge block below.\n4) The checker runs hidden/public tests against that JS block.\n-/\n\ndef ${problem.functionName}${argsSignature} : ${returnType} := by\n  sorry\n\n-- Replace this with your own theorem or lemma before final submit.\ntheorem ${problem.functionName}_spec${argsSignature} : True := by\n  sorry\n\n/-! JS_SOLVER\n${javascriptStarter}\n-/\n`
}

export function getStarterCode(problem: StemProblem, language: Language): string {
  const direct = problem.starterCode[language]
  if (typeof direct === 'string') return direct

  if (language === 'lean4') return buildLean4Starter(problem)

  return problem.starterCode.javascript ?? `function ${problem.functionName}() {\n  // TODO\n  return null\n}`
}
