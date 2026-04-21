import {
  createClient,
  type SupabaseClient,
  type User as SupabaseAuthUser,
} from '@supabase/supabase-js'
import type { Difficulty, JudgeResult, Language } from '../types'
import {
  computeCompositeLeaderboardScore,
  computeContributorMetrics,
  computeReviewWeightedScore,
  type ReviewForScoring,
  type ReviewVerdict,
  type SubmissionForScoring,
} from './scoring'

export type CommunityMode = 'supabase' | 'local'

export interface CommunityUser {
  id: string
  email: string
  username: string
  displayName: string
  reputation: number
  contributionScore: number
  reviewScore: number
  solvedCount: number
  totalSubmissions: number
}

export interface CommunitySubmissionInput {
  problemId: string
  problemTitle: string
  topic: string
  difficulty: Difficulty
  language: Language
  status: JudgeResult['status']
  passed: number
  total: number
  runtimeMs: number
  score: number
  sourceCode: string
}

export interface CommunitySubmission extends CommunitySubmissionInput {
  id: string
  userId: string
  username: string
  createdAt: string
}

export interface ReviewInput {
  submissionId: string
  verdict: ReviewVerdict
  correctnessScore: number
  explanationScore: number
  rigorScore: number
  comment: string
}

export interface SolutionReview extends ReviewInput {
  id: string
  reviewerId: string
  reviewerName: string
  weightedScore: number
  createdAt: string
}

export interface ReviewQueueItem {
  submission: CommunitySubmission
  existingReviews: SolutionReview[]
}

export interface LeaderboardEntry extends CommunityUser {
  rank: number
  compositeScore: number
  proofScore: number
  rating: number
}

export interface AuthResult {
  user: CommunityUser | null
  error?: string
}

export interface SubmissionResult {
  submission: CommunitySubmission | null
  error?: string
}

export interface ReviewResult {
  review: SolutionReview | null
  error?: string
}

export interface CommunityService {
  mode: CommunityMode
  getCurrentUser: () => Promise<CommunityUser | null>
  onAuthChange: (listener: (user: CommunityUser | null) => void) => { unsubscribe: () => void }
  signUp: (email: string, password: string, username: string) => Promise<AuthResult>
  signIn: (email: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<void>
  listLeaderboard: (limit?: number) => Promise<LeaderboardEntry[]>
  saveSubmission: (user: CommunityUser, input: CommunitySubmissionInput) => Promise<SubmissionResult>
  listReviewQueue: (userId: string, limit?: number) => Promise<ReviewQueueItem[]>
  submitReview: (user: CommunityUser, input: ReviewInput) => Promise<ReviewResult>
}

const USERS_KEY = 'stem-leet-code:community:users:v1'
const CURRENT_USER_KEY = 'stem-leet-code:community:current-user:v1'
const COMMUNITY_SUBMISSIONS_KEY = 'stem-leet-code:community:submissions:v1'
const COMMUNITY_REVIEWS_KEY = 'stem-leet-code:community:reviews:v1'

interface LocalUserRecord extends CommunityUser {
  password: string
  createdAt: string
}

type LocalSubmissionRecord = CommunitySubmission
type LocalReviewRecord = SolutionReview

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function localRead<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function localWrite(key: string, value: unknown): void {
  if (!isBrowser()) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage write errors.
  }
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase().replace(/\s+/g, '-')
}

function toPublicUser(user: LocalUserRecord): CommunityUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    reputation: user.reputation,
    contributionScore: user.contributionScore,
    reviewScore: user.reviewScore,
    solvedCount: user.solvedCount,
    totalSubmissions: user.totalSubmissions,
  }
}

function clampReviewScore(score: number): number {
  return Math.min(10, Math.max(1, Math.round(score)))
}

function isReviewVerdict(value: string): value is ReviewVerdict {
  return value === 'approve' || value === 'request_changes'
}

function sortLeaderboardEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore
    if (b.reputation !== a.reputation) return b.reputation - a.reputation
    return a.username.localeCompare(b.username)
  })

  return sorted.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }))
}

function computeProofScoreFromSubmissions(
  submissions: Array<Pick<CommunitySubmission, 'status' | 'language'>>
): number {
  let acceptedLean = 0
  let proofIncompleteLean = 0

  for (const submission of submissions) {
    if (submission.language !== 'lean4') continue
    if (submission.status === 'Accepted') acceptedLean += 1
    if (submission.status === 'Proof Incomplete') proofIncompleteLean += 1
  }

  return Math.max(0, acceptedLean * 24 - proofIncompleteLean * 9)
}

function computeLeaderboardRating(input: {
  solvedCount: number
  contributionScore: number
  reviewScore: number
  proofScore: number
}): number {
  const raw =
    1000 +
    input.solvedCount * 14 +
    input.contributionScore * 0.2 +
    input.reviewScore * 0.12 +
    input.proofScore * 0.45
  return Math.max(800, Math.min(3900, Math.round(raw)))
}

function recomputeLocalUsers(
  users: LocalUserRecord[],
  submissions: LocalSubmissionRecord[],
  reviews: LocalReviewRecord[]
): LocalUserRecord[] {
  const scoringSubmissions: SubmissionForScoring[] = submissions.map((submission) => ({
    id: submission.id,
    userId: submission.userId,
    problemId: submission.problemId,
    status: submission.status,
    score: submission.score,
  }))

  const scoringReviews: ReviewForScoring[] = reviews.map((review) => ({
    id: review.id,
    submissionId: review.submissionId,
    reviewerId: review.reviewerId,
    verdict: review.verdict,
    weightedScore: review.weightedScore,
  }))

  return users.map((user) => {
    const metrics = computeContributorMetrics(user.id, scoringSubmissions, scoringReviews)
    return {
      ...user,
      solvedCount: metrics.solvedCount,
      totalSubmissions: metrics.totalSubmissions,
      reputation: metrics.reputation,
      contributionScore: metrics.contributionScore,
      reviewScore: metrics.reviewScore,
    }
  })
}

const localAuthListeners = new Set<(user: CommunityUser | null) => void>()

function getLocalUsers(): LocalUserRecord[] {
  return localRead<LocalUserRecord[]>(USERS_KEY, [])
}

function getLocalSubmissions(): LocalSubmissionRecord[] {
  return localRead<LocalSubmissionRecord[]>(COMMUNITY_SUBMISSIONS_KEY, [])
}

function getLocalReviews(): LocalReviewRecord[] {
  return localRead<LocalReviewRecord[]>(COMMUNITY_REVIEWS_KEY, [])
}

function getLocalCurrentUserId(): string | null {
  return localRead<string | null>(CURRENT_USER_KEY, null)
}

function saveLocalUsers(users: LocalUserRecord[]): void {
  localWrite(USERS_KEY, users)
}

function saveLocalSubmissions(submissions: LocalSubmissionRecord[]): void {
  localWrite(COMMUNITY_SUBMISSIONS_KEY, submissions)
}

function saveLocalReviews(reviews: LocalReviewRecord[]): void {
  localWrite(COMMUNITY_REVIEWS_KEY, reviews)
}

function saveLocalCurrentUserId(userId: string | null): void {
  localWrite(CURRENT_USER_KEY, userId)
}

function getLocalCurrentUser(): CommunityUser | null {
  const userId = getLocalCurrentUserId()
  if (!userId) return null
  const users = getLocalUsers()
  const user = users.find((item) => item.id === userId)
  return user ? toPublicUser(user) : null
}

function emitLocalAuthChange(user: CommunityUser | null): void {
  for (const listener of localAuthListeners) {
    listener(user)
  }
}

function buildLocalLeaderboard(limit: number): LeaderboardEntry[] {
  const submissions = getLocalSubmissions()
  const reviews = getLocalReviews()
  const users = recomputeLocalUsers(getLocalUsers(), submissions, reviews)
  saveLocalUsers(users)

  const submissionsByUser = new Map<string, LocalSubmissionRecord[]>()
  for (const submission of submissions) {
    const list = submissionsByUser.get(submission.userId) ?? []
    list.push(submission)
    submissionsByUser.set(submission.userId, list)
  }

  const entries = users.map((user) => {
    const publicUser = toPublicUser(user)
    const proofScore = computeProofScoreFromSubmissions(submissionsByUser.get(user.id) ?? [])
    const rating = computeLeaderboardRating({
      solvedCount: publicUser.solvedCount,
      contributionScore: publicUser.contributionScore,
      reviewScore: publicUser.reviewScore,
      proofScore,
    })

    return {
      ...publicUser,
      rank: 0,
      proofScore,
      rating,
      compositeScore: computeCompositeLeaderboardScore(publicUser) + Math.round(proofScore * 0.2),
    }
  })

  return sortLeaderboardEntries(entries).slice(0, limit)
}

function createLocalService(): CommunityService {
  return {
    mode: 'local',

    async getCurrentUser() {
      return getLocalCurrentUser()
    },

    onAuthChange(listener) {
      localAuthListeners.add(listener)
      return {
        unsubscribe: () => {
          localAuthListeners.delete(listener)
        },
      }
    },

    async signUp(email, password, username) {
      const normalizedEmail = normalizeEmail(email)
      const normalizedUsername = normalizeUsername(username)
      if (!normalizedEmail || !normalizedUsername || password.length < 6) {
        return {
          user: null,
          error: 'Provide a valid email, username, and password (at least 6 characters).',
        }
      }

      const users = getLocalUsers()
      if (users.some((user) => normalizeEmail(user.email) === normalizedEmail)) {
        return {
          user: null,
          error: 'An account with this email already exists.',
        }
      }

      if (users.some((user) => normalizeUsername(user.username) === normalizedUsername)) {
        return {
          user: null,
          error: 'This username is already taken.',
        }
      }

      const created: LocalUserRecord = {
        id: makeId(),
        email: normalizedEmail,
        username: normalizedUsername,
        displayName: username.trim(),
        password,
        reputation: 0,
        contributionScore: 0,
        reviewScore: 0,
        solvedCount: 0,
        totalSubmissions: 0,
        createdAt: new Date().toISOString(),
      }

      const nextUsers = [...users, created]
      saveLocalUsers(nextUsers)
      saveLocalCurrentUserId(created.id)
      const publicUser = toPublicUser(created)
      emitLocalAuthChange(publicUser)

      return { user: publicUser }
    },

    async signIn(email, password) {
      const normalizedEmail = normalizeEmail(email)
      const users = getLocalUsers()
      const found = users.find(
        (user) => normalizeEmail(user.email) === normalizedEmail && user.password === password
      )

      if (!found) {
        return {
          user: null,
          error: 'Invalid email or password.',
        }
      }

      saveLocalCurrentUserId(found.id)
      const publicUser = toPublicUser(found)
      emitLocalAuthChange(publicUser)

      return { user: publicUser }
    },

    async signOut() {
      saveLocalCurrentUserId(null)
      emitLocalAuthChange(null)
    },

    async listLeaderboard(limit = 50) {
      return buildLocalLeaderboard(limit)
    },

    async saveSubmission(user, input) {
      const submissions = getLocalSubmissions()
      const submission: LocalSubmissionRecord = {
        id: makeId(),
        userId: user.id,
        username: user.username,
        createdAt: new Date().toISOString(),
        ...input,
      }

      const nextSubmissions = [submission, ...submissions].slice(0, 3000)
      saveLocalSubmissions(nextSubmissions)

      const users = recomputeLocalUsers(getLocalUsers(), nextSubmissions, getLocalReviews())
      saveLocalUsers(users)

      const current = users.find((item) => item.id === user.id)
      emitLocalAuthChange(current ? toPublicUser(current) : null)

      return { submission }
    },

    async listReviewQueue(userId, limit = 20) {
      const submissions = getLocalSubmissions()
      const reviews = getLocalReviews()

      const reviewedIds = new Set(
        reviews
          .filter((review) => review.reviewerId === userId)
          .map((review) => review.submissionId)
      )

      const pending = submissions
        .filter(
          (submission) =>
            submission.userId !== userId &&
            submission.status === 'Accepted' &&
            !reviewedIds.has(submission.id)
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)

      return pending.map((submission) => ({
        submission,
        existingReviews: reviews
          .filter((review) => review.submissionId === submission.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      }))
    },

    async submitReview(user, input) {
      if (!isReviewVerdict(input.verdict)) {
        return {
          review: null,
          error: 'Invalid review verdict.',
        }
      }

      const submissions = getLocalSubmissions()
      const targetSubmission = submissions.find((submission) => submission.id === input.submissionId)
      if (!targetSubmission) {
        return {
          review: null,
          error: 'Submission not found.',
        }
      }

      if (targetSubmission.userId === user.id) {
        return {
          review: null,
          error: 'You cannot review your own submission.',
        }
      }

      const reviews = getLocalReviews()
      if (
        reviews.some(
          (review) =>
            review.submissionId === input.submissionId && review.reviewerId === user.id
        )
      ) {
        return {
          review: null,
          error: 'You have already reviewed this submission.',
        }
      }

      const review: LocalReviewRecord = {
        id: makeId(),
        reviewerId: user.id,
        reviewerName: user.username,
        submissionId: input.submissionId,
        verdict: input.verdict,
        correctnessScore: clampReviewScore(input.correctnessScore),
        explanationScore: clampReviewScore(input.explanationScore),
        rigorScore: clampReviewScore(input.rigorScore),
        comment: input.comment.trim(),
        weightedScore: computeReviewWeightedScore({
          verdict: input.verdict,
          correctnessScore: clampReviewScore(input.correctnessScore),
          explanationScore: clampReviewScore(input.explanationScore),
          rigorScore: clampReviewScore(input.rigorScore),
        }),
        createdAt: new Date().toISOString(),
      }

      const nextReviews = [review, ...reviews].slice(0, 8000)
      saveLocalReviews(nextReviews)

      const users = recomputeLocalUsers(getLocalUsers(), submissions, nextReviews)
      saveLocalUsers(users)
      const updatedCurrentUser = users.find((item) => item.id === user.id)
      emitLocalAuthChange(updatedCurrentUser ? toPublicUser(updatedCurrentUser) : null)

      return { review }
    },
  }
}

function mapSupabaseProfile(record: Record<string, unknown>): CommunityUser {
  return {
    id: String(record.id),
    email: String(record.email ?? ''),
    username: String(record.username ?? 'user'),
    displayName: String(record.display_name ?? record.username ?? 'User'),
    reputation: Number(record.reputation ?? 0),
    contributionScore: Number(record.contribution_score ?? 0),
    reviewScore: Number(record.review_score ?? 0),
    solvedCount: Number(record.solved_count ?? 0),
    totalSubmissions: Number(record.total_submissions ?? 0),
  }
}

function mapSupabaseSubmission(record: Record<string, unknown>): CommunitySubmission {
  return {
    id: String(record.id),
    userId: String(record.user_id),
    username: String(record.username ?? 'user'),
    problemId: String(record.problem_id),
    problemTitle: String(record.problem_title),
    topic: String(record.topic),
    difficulty: String(record.difficulty) as Difficulty,
    language: String(record.language) as Language,
    status: String(record.status) as JudgeResult['status'],
    passed: Number(record.passed),
    total: Number(record.total),
    runtimeMs: Number(record.runtime_ms),
    score: Number(record.auto_score ?? record.score ?? 0),
    sourceCode: String(record.source_code ?? ''),
    createdAt: String(record.created_at ?? new Date().toISOString()),
  }
}

function mapSupabaseReview(record: Record<string, unknown>): SolutionReview {
  return {
    id: String(record.id),
    reviewerId: String(record.reviewer_id),
    reviewerName: String(record.reviewer_name ?? 'reviewer'),
    submissionId: String(record.submission_id),
    verdict: String(record.verdict) as ReviewVerdict,
    correctnessScore: Number(record.correctness_score),
    explanationScore: Number(record.explanation_score),
    rigorScore: Number(record.rigor_score),
    comment: String(record.comment ?? ''),
    weightedScore: Number(record.weighted_score ?? 0),
    createdAt: String(record.created_at ?? new Date().toISOString()),
  }
}

function createSupabaseService(client: SupabaseClient): CommunityService {
  const profileColumns =
    'id,email,username,display_name,reputation,contribution_score,review_score,solved_count,total_submissions'

  async function ensureProfile(
    authUser: SupabaseAuthUser,
    usernameHint?: string
  ): Promise<CommunityUser | null> {
    const usernameFromMeta = String(
      authUser.user_metadata?.username ?? authUser.user_metadata?.display_name ?? ''
    )
    const rawUsername = usernameHint?.trim() || usernameFromMeta || authUser.email?.split('@')[0] || 'user'
    const username = normalizeUsername(rawUsername).slice(0, 32)
    const displayName = rawUsername.slice(0, 48)

    await client.from('profiles').upsert(
      {
        id: authUser.id,
        email: authUser.email ?? '',
        username,
        display_name: displayName,
      },
      { onConflict: 'id' }
    )

    const { data } = await client
      .from('profiles')
      .select(profileColumns)
      .eq('id', authUser.id)
      .maybeSingle()

    if (!data) return null
    return mapSupabaseProfile(data as Record<string, unknown>)
  }

  async function tryRecompute(userId: string): Promise<void> {
    await client.rpc('recompute_profile_scores', { target_user_id: userId })
  }

  return {
    mode: 'supabase',

    async getCurrentUser() {
      const { data, error } = await client.auth.getUser()
      if (error || !data.user) return null
      return ensureProfile(data.user)
    },

    onAuthChange(listener) {
      const {
        data: { subscription },
      } = client.auth.onAuthStateChange(async (_event, session) => {
        if (!session?.user) {
          listener(null)
          return
        }
        const profile = await ensureProfile(session.user)
        listener(profile)
      })

      return {
        unsubscribe: () => {
          subscription.unsubscribe()
        },
      }
    },

    async signUp(email, password, username) {
      const response = await client.auth.signUp({
        email: normalizeEmail(email),
        password,
        options: {
          data: {
            username: normalizeUsername(username),
            display_name: username.trim(),
          },
        },
      })

      if (response.error) {
        return { user: null, error: response.error.message }
      }

      if (!response.data.user) {
        return {
          user: null,
          error: 'Sign-up succeeded. Check your email to verify the account before logging in.',
        }
      }

      const profile = await ensureProfile(response.data.user, username)
      return { user: profile }
    },

    async signIn(email, password) {
      const response = await client.auth.signInWithPassword({
        email: normalizeEmail(email),
        password,
      })

      if (response.error) {
        return { user: null, error: response.error.message }
      }

      if (!response.data.user) {
        return { user: null, error: 'Unable to load user profile.' }
      }

      const profile = await ensureProfile(response.data.user)
      return { user: profile }
    },

    async signOut() {
      await client.auth.signOut()
    },

    async listLeaderboard(limit = 50) {
      const { data, error } = await client
        .from('profiles')
        .select(profileColumns)
        .order('reputation', { ascending: false })
        .limit(limit * 2)

      if (error || !data) return []

      const rawEntries = data.map((record) => {
        const mapped = mapSupabaseProfile(record as Record<string, unknown>)
        return {
          ...mapped,
          rank: 0,
          compositeScore: computeCompositeLeaderboardScore(mapped),
          proofScore: 0,
          rating: 0,
        }
      })

      const userIds = rawEntries.map((entry) => entry.id)
      const proofScoreByUser = new Map<string, number>()

      if (userIds.length > 0) {
        const { data: submissionRows } = await client
          .from('community_submissions')
          .select('user_id,status,language')
          .in('user_id', userIds)
          .limit(limit * 250)

        const submissionBuckets = new Map<string, Array<Pick<CommunitySubmission, 'status' | 'language'>>>()
        for (const row of submissionRows ?? []) {
          const parsed = row as Record<string, unknown>
          const userId = String(parsed.user_id ?? '')
          if (!userId) continue
          const list = submissionBuckets.get(userId) ?? []
          list.push({
            status: String(parsed.status ?? 'Wrong Answer') as JudgeResult['status'],
            language: String(parsed.language ?? 'javascript') as Language,
          })
          submissionBuckets.set(userId, list)
        }

        for (const [userId, bucket] of submissionBuckets.entries()) {
          proofScoreByUser.set(userId, computeProofScoreFromSubmissions(bucket))
        }
      }

      const enrichedEntries = rawEntries.map((entry) => {
        const proofScore = proofScoreByUser.get(entry.id) ?? 0
        const rating = computeLeaderboardRating({
          solvedCount: entry.solvedCount,
          contributionScore: entry.contributionScore,
          reviewScore: entry.reviewScore,
          proofScore,
        })

        return {
          ...entry,
          proofScore,
          rating,
          compositeScore: entry.compositeScore + Math.round(proofScore * 0.2),
        }
      })

      return sortLeaderboardEntries(enrichedEntries).slice(0, limit)
    },

    async saveSubmission(user, input) {
      const payload = {
        user_id: user.id,
        username: user.username,
        problem_id: input.problemId,
        problem_title: input.problemTitle,
        topic: input.topic,
        difficulty: input.difficulty,
        language: input.language,
        status: input.status,
        passed: input.passed,
        total: input.total,
        runtime_ms: input.runtimeMs,
        auto_score: input.score,
        source_code: input.sourceCode,
      }

      const { data, error } = await client
        .from('community_submissions')
        .insert(payload)
        .select('*')
        .single()

      if (error || !data) {
        return {
          submission: null,
          error: error?.message ?? 'Failed to save submission.',
        }
      }

      await tryRecompute(user.id)

      return {
        submission: mapSupabaseSubmission(data as Record<string, unknown>),
      }
    },

    async listReviewQueue(userId, limit = 20) {
      const { data: submissions, error: submissionError } = await client
        .from('community_submissions')
        .select('*')
        .eq('status', 'Accepted')
        .neq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit * 4)

      if (submissionError || !submissions || submissions.length === 0) return []

      const submissionIds = submissions.map((row) => String((row as Record<string, unknown>).id))

      const { data: myReviews } = await client
        .from('solution_reviews')
        .select('submission_id')
        .eq('reviewer_id', userId)
        .in('submission_id', submissionIds)

      const reviewedIds = new Set(
        (myReviews ?? []).map((item) => String((item as Record<string, unknown>).submission_id))
      )

      const pendingRows = submissions
        .filter((row) => !reviewedIds.has(String((row as Record<string, unknown>).id)))
        .slice(0, limit)

      if (pendingRows.length === 0) return []

      const pendingIds = pendingRows.map((row) => String((row as Record<string, unknown>).id))

      const { data: reviewRows } = await client
        .from('solution_reviews')
        .select('*')
        .in('submission_id', pendingIds)
        .order('created_at', { ascending: false })

      const groupedReviews = new Map<string, SolutionReview[]>()
      for (const row of reviewRows ?? []) {
        const mapped = mapSupabaseReview(row as Record<string, unknown>)
        const list = groupedReviews.get(mapped.submissionId) ?? []
        list.push(mapped)
        groupedReviews.set(mapped.submissionId, list)
      }

      return pendingRows.map((row) => {
        const submission = mapSupabaseSubmission(row as Record<string, unknown>)
        return {
          submission,
          existingReviews: groupedReviews.get(submission.id) ?? [],
        }
      })
    },

    async submitReview(user, input) {
      if (!isReviewVerdict(input.verdict)) {
        return {
          review: null,
          error: 'Invalid review verdict.',
        }
      }

      const { data: submissionRow, error: submissionError } = await client
        .from('community_submissions')
        .select('*')
        .eq('id', input.submissionId)
        .maybeSingle()

      if (submissionError || !submissionRow) {
        return {
          review: null,
          error: 'Submission not found.',
        }
      }

      const submission = mapSupabaseSubmission(submissionRow as Record<string, unknown>)
      if (submission.userId === user.id) {
        return {
          review: null,
          error: 'You cannot review your own submission.',
        }
      }

      const { data: existingReview } = await client
        .from('solution_reviews')
        .select('id')
        .eq('submission_id', input.submissionId)
        .eq('reviewer_id', user.id)
        .maybeSingle()

      if (existingReview) {
        return {
          review: null,
          error: 'You have already reviewed this submission.',
        }
      }

      const correctnessScore = clampReviewScore(input.correctnessScore)
      const explanationScore = clampReviewScore(input.explanationScore)
      const rigorScore = clampReviewScore(input.rigorScore)
      const weightedScore = computeReviewWeightedScore({
        verdict: input.verdict,
        correctnessScore,
        explanationScore,
        rigorScore,
      })

      const payload = {
        submission_id: input.submissionId,
        reviewer_id: user.id,
        reviewer_name: user.username,
        verdict: input.verdict,
        correctness_score: correctnessScore,
        explanation_score: explanationScore,
        rigor_score: rigorScore,
        comment: input.comment.trim(),
        weighted_score: weightedScore,
      }

      const { data, error } = await client
        .from('solution_reviews')
        .insert(payload)
        .select('*')
        .single()

      if (error || !data) {
        return {
          review: null,
          error: error?.message ?? 'Failed to submit review.',
        }
      }

      await Promise.all([tryRecompute(user.id), tryRecompute(submission.userId)])

      return {
        review: mapSupabaseReview(data as Record<string, unknown>),
      }
    },
  }
}

const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL
const configuredSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const configuredMode = import.meta.env.VITE_COMMUNITY_MODE

function selectCommunityService(): CommunityService {
  if (configuredMode === 'local') {
    return createLocalService()
  }

  if (configuredSupabaseUrl && configuredSupabaseAnonKey) {
    const client = createClient(configuredSupabaseUrl, configuredSupabaseAnonKey)
    return createSupabaseService(client)
  }

  return createLocalService()
}

export const communityService = selectCommunityService()
