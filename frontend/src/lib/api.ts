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
  if (init.body !== undefined && !headers.has('Content-Type')) {
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
