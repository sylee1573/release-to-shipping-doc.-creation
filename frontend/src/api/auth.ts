import { api } from './client'
import type { User } from '../types'

export interface LoginRequest {
  email: string
  password: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

export const authApi = {
  login: (body: LoginRequest) => api.post<TokenResponse>('/api/v1/auth/login', body),
  me: () => api.get<User>('/api/v1/auth/me'),
}
