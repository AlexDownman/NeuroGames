import { supabase } from './supabaseClient'

// The Spring backend is teacher-only: it verifies the Supabase JWT sent as a
// Bearer token and requires the caller to be a lecturer (401 without a valid
// token, 403 for students). Students never call it — gameplay goes through
// Supabase RPCs instead.

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/$/, '')

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  // getSession() refreshes an expired access token before returning it.
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session || session.user.is_anonymous) {
    throw new ApiError(401, 'Log in with a teacher account to continue.')
  }

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${session.access_token}`)
  // FormData needs the browser to set its own multipart boundary — forcing
  // JSON here would break file uploads.
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, "Couldn't reach the NeuroGames API. Is the backend running?")
  }

  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response))
  }

  return (response.status === 204 ? undefined : await response.json()) as T
}

async function errorMessage(response: Response): Promise<string> {
  if (response.status === 401) return 'Your session has expired. Please log in again.'
  if (response.status === 403) return 'This area is for teacher accounts only.'
  try {
    // Backend errors use ApiError: { status, error, message, fieldErrors }
    const body = await response.json()
    if (typeof body?.message === 'string') return body.message
  } catch {
    // non-JSON body; fall through
  }
  return `Request failed (${response.status})`
}

export interface Collection {
  id: string
  name: string
  description: string | null
  publicCollection: boolean
  createdAt: string
  updatedAt: string
}

export const listCollections = () => apiFetch<Collection[]>('/api/collections')

export const getCollection = (collectionId: string) => apiFetch<Collection>(`/api/collections/${collectionId}`)

export const createCollection = (body: { name: string; description?: string }) =>
  apiFetch<Collection>('/api/collections', { method: 'POST', body: JSON.stringify(body) })

export interface LearningMaterial {
  id: string
  filename: string
  fileType: string
  extractionStatus: 'pending' | 'processing' | 'completed' | 'failed'
  hasExtractedContent: boolean
  uploadedAt: string
}

export const listMaterials = (collectionId: string) =>
  apiFetch<LearningMaterial[]>(`/api/collections/${collectionId}/materials`)

export function uploadMaterial(collectionId: string, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return apiFetch<LearningMaterial>(`/api/collections/${collectionId}/materials`, {
    method: 'POST',
    body: formData,
  })
}

export interface AnswerOption {
  id: string
  text: string
  correct: boolean
}

export interface Question {
  id: string
  questionText: string
  explanation: string
  difficulty: string
  topicId: string | null
  approvalStatus: 'pending_review' | 'approved' | 'rejected'
  answerOptions: AnswerOption[]
}

export const listQuestions = (collectionId: string) =>
  apiFetch<Question[]>(`/api/collections/${collectionId}/questions`)

export const generateQuestions = (
  collectionId: string,
  body: { sourceText?: string; sourceMaterialId?: string; questionCount?: number; difficulty?: string },
) =>
  apiFetch<Question[]>(`/api/collections/${collectionId}/questions/generate`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const updateQuestionApproval = (questionId: string, status: 'approved' | 'rejected') =>
  apiFetch<Question>(`/api/questions/${questionId}/approval`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })

export interface Game {
  id: string
  title: string
  description: string | null
  gameType: string
  questionCount: number
  createdAt: string
}

export const listGames = (collectionId: string) => apiFetch<Game[]>(`/api/collections/${collectionId}/games`)

export const createAnswerRunGame = (collectionId: string, body: { title: string; questionIds: string[] }) =>
  apiFetch<Game>(`/api/collections/${collectionId}/games`, { method: 'POST', body: JSON.stringify(body) })

export interface GameSession {
  id: string
  gameId: string
  sessionCode: string
  status: 'pending' | 'active' | 'ended'
  startedAt: string | null
  endedAt: string | null
}

export const startSession = (gameId: string) =>
  apiFetch<GameSession>(`/api/games/${gameId}/sessions`, { method: 'POST' })

export const endSession = (sessionId: string) =>
  apiFetch<GameSession>(`/api/sessions/${sessionId}/end`, { method: 'PATCH' })
