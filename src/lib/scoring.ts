import type { Difficulty, JudgeResult, Language, StemProblem } from '../types'

export type ReviewVerdict = 'approve' | 'request_changes'

export interface SubmissionForScoring {
  id: string
  userId: string
  problemId: string
  status: JudgeResult['status']
  score: number
}

export interface ReviewForScoring {
  id: string
  submissionId: string
  reviewerId: string
  verdict: ReviewVerdict
  weightedScore: number
}

export interface ContributorMetrics {
  solvedCount: number
  totalSubmissions: number
  reputation: number
  contributionScore: number
  reviewScore: number
}

const difficultyMultiplier: Record<Difficulty, number> = {
  Easy: 1,
  Medium: 1.35,
  Hard: 1.75,
}

const languageMultiplier: Record<Language, number> = {
  javascript: 1,
  python: 1.02,
  cpp: 1.05,
  java: 1.03,
  lean4: 1.08,
}

export function computeSubmissionScore(problem: StemProblem, result: JudgeResult, language: Language): number {
  if (result.total === 0) return 0

  const passRatio = result.passed / Math.max(result.total, 1)
  const correctnessPoints = passRatio * 72
  const runtimePoints = Math.max(0, 18 - result.runtimeMs / 35)
  const challengePoints = Math.max(0, (100 - problem.acceptance) * 0.14)
  const proofTagged = problem.tags.some((tag) => {
    const normalized = tag.toLowerCase()
    return normalized.includes('proof') || normalized.includes('lean')
  })
  const proofCompleteLean = language === 'lean4' && result.status === 'Accepted'

  let acceptedBonus = result.status === 'Accepted' ? 12 : 2 * passRatio
  if (result.status === 'Proof Incomplete') {
    acceptedBonus = 0.8 * passRatio
  }

  const proofBonus = (proofCompleteLean ? 18 : 0) + (proofTagged && result.status === 'Accepted' ? 8 : 0)
  const proofMultiplier =
    result.status === 'Proof Incomplete'
      ? 0.55
      : proofCompleteLean
        ? 1.12
        : proofTagged
          ? 1.03
          : 1

  const base = correctnessPoints + runtimePoints + challengePoints + acceptedBonus + proofBonus

  const weighted =
    base * difficultyMultiplier[problem.difficulty] * languageMultiplier[language] * proofMultiplier

  return Math.max(0, Math.round(weighted))
}

export function computeReviewWeightedScore(input: {
  correctnessScore: number
  explanationScore: number
  rigorScore: number
  verdict: ReviewVerdict
}): number {
  const average = (input.correctnessScore + input.explanationScore + input.rigorScore) / 3
  const verdictMultiplier = input.verdict === 'approve' ? 1 : 0.85
  return Math.round(average * verdictMultiplier * 10) / 10
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function computeContributorMetrics(
  userId: string,
  submissions: SubmissionForScoring[],
  reviews: ReviewForScoring[]
): ContributorMetrics {
  const mySubmissions = submissions.filter((submission) => submission.userId === userId)
  const accepted = mySubmissions.filter((submission) => submission.status === 'Accepted')
  const solvedCount = new Set(accepted.map((submission) => submission.problemId)).size
  const totalSubmissions = mySubmissions.length

  const acceptedPoints = accepted.reduce((sum, submission) => sum + submission.score, 0)

  const reviewsByMe = reviews.filter((review) => review.reviewerId === userId)
  const reviewPointsRaw = reviewsByMe.reduce((sum, review) => sum + review.weightedScore, 0)

  let consensusDelta = 0
  for (const review of reviewsByMe) {
    const sameSubmissionReviews = reviews.filter((item) => item.submissionId === review.submissionId)
    if (sameSubmissionReviews.length < 2) continue

    const approvals = sameSubmissionReviews.filter((item) => item.verdict === 'approve').length
    const consensus: ReviewVerdict = approvals * 2 >= sameSubmissionReviews.length ? 'approve' : 'request_changes'
    consensusDelta += review.verdict === consensus ? 2 : -1.5
  }

  const reviewPoints = clamp(reviewPointsRaw + consensusDelta, -40, 800)

  const mySubmissionIds = new Set(mySubmissions.map((submission) => submission.id))
  const peerReviews = reviews.filter((review) => mySubmissionIds.has(review.submissionId))
  const peerValidationAverage =
    peerReviews.length === 0
      ? 0
      : peerReviews.reduce((sum, review) => sum + review.weightedScore, 0) / peerReviews.length

  const reputation = Math.round(
    acceptedPoints + reviewPoints * 0.9 + peerValidationAverage * 4 + solvedCount * 6
  )
  const contributionScore = Math.round(
    acceptedPoints * 0.75 + reviewPoints * 1.25 + peerValidationAverage * 6
  )
  const reviewScore = Math.round(reviewPoints)

  return {
    solvedCount,
    totalSubmissions,
    reputation,
    contributionScore,
    reviewScore,
  }
}

export function computeCompositeLeaderboardScore(input: {
  reputation: number
  contributionScore: number
  reviewScore: number
  solvedCount: number
}): number {
  return Math.round(
    input.reputation * 0.5 +
      input.contributionScore * 0.28 +
      input.reviewScore * 0.12 +
      input.solvedCount * 10
  )
}
