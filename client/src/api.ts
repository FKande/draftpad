const BASE = import.meta.env.VITE_API_URL

export interface User {
  id: string
  email: string
  createdAt: string
}

export interface Note {
  id: string
  userId: string
  title: string
  content: string | null
  createdAt: string
  updatedAt: string
}

export interface NoteFields {
  title?: string
  content?: string
}


export interface UploadUrlResponse {
  url: string
  key: string
}

export interface Attachment {
  id: string
  noteId: string
  fileName: string
  s3Key: string
  mimeType: string
  size: number
  createdAt: string
}

export interface DownloadUrlResponse {
  url: string
}


export type ApiError = Error & { status?: number }

// status is optional, so any Error qualifies structurally; instanceof is the
// whole check.
export function isApiError(err: unknown): err is ApiError {
  return err instanceof Error
}

interface RequestOptions {
  method?: string
  body?: unknown
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {

  const res = await fetch(`${BASE}${path}`, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    credentials: 'include',
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const data = res.status === 204 ? null : await res.json()

  if (!res.ok) {
    const err = new Error(data.error) as ApiError
    err.status = res.status
    throw err
  }

  return data as T
}

export async function getMe(): Promise<User> {
  return request<User>('/auth/me')
}

export async function login(email: string, password: string): Promise<User> {
  return request<User>('/auth/login', { method: 'POST', body: { email, password } })
}

export async function signup(email: string, password: string): Promise<User> {
  return request<User>('/auth/signup', { method: 'POST', body: {email, password} })
}

export async function logout(): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/auth/logout', { method: 'POST' })
}

export async function getNotes(): Promise<Note[]> {
  return request<Note[]>('/notes')
}

export async function createNote(): Promise<Note> {
  return request<Note>('/notes', { method: 'POST', body: {} })
}

export async function updateNote(id: string, fields: NoteFields): Promise<Note> {
  return request<Note>(`/notes/${id}`, { method: 'PATCH', body: fields })
}

export async function deleteNote(id: string): Promise<null> {
  return request<null>(`/notes/${id}`, { method: 'DELETE' })
}

export async function getNoteById(id: string): Promise<Note> {
  return request<Note>(`/notes/${id}`)
}


export async function getAttachmentUploadUrl(
  noteId: string,
  fileName: string,
  mimeType: string
): Promise<UploadUrlResponse> {
  return request<UploadUrlResponse>(
    `/notes/${noteId}/attachments/upload-url`, { method: 'POST', body: { fileName, mimeType } }
  )
}

export async function uploadFileToS3(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type, }, body: file })
  if (!response.ok) {
    throw new Error('Failed to upload file')
  }
}

export async function confirmAttachmentUpload(noteId: string, s3Key: string, fileName: string): Promise<Attachment> {
  return request<Attachment>(
    `/notes/${noteId}/attachments`, { method: 'POST', body: {s3Key, fileName } }
  )
}

export async function getAttachments(noteId: string): Promise<Attachment[]> {
  return request<Attachment[]>(
    `/notes/${noteId}/attachments`
  )
}

export async function getAttachmentDownloadUrl(
  noteId: string,
  attachmentId: string
): Promise<DownloadUrlResponse> {
  return request<DownloadUrlResponse>(
    `/notes/${noteId}/attachments/${attachmentId}/download-url`
  )
}

export async function deleteAttachment(
  noteId: string,
  attachmentId: string
): Promise<null> {
  return request<null>(
    `/notes/${noteId}/attachments/${attachmentId}`, { method: 'DELETE' }
  )
}

export async function uploadAttachment(
  noteId: string,
  file: File
): Promise<Attachment> {

  const { url, key } = await getAttachmentUploadUrl(noteId, file.name, file.type)
  await uploadFileToS3(url, file)
  const attachment = await confirmAttachmentUpload(noteId, key, file.name)

  return attachment
}
