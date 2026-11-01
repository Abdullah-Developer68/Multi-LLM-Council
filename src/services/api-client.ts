import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { MultiAgentTurn, ThreadSummary, UserAccount, VerifiedModelConfig } from '../types';

function getApiBaseUrl(): string {
  if (Platform.OS === 'web') {
    return '';
  }
  // On native device / simulator:
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost;

  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:8081`;
  }
  return 'http://localhost:8081';
}

class ApiClient {
  private token: string | null = null;

  public setToken(token: string | null) {
    this.token = token;
  }

  public getToken(): string | null {
    return this.token;
  }

  private getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  public async signup(
    email: string,
    password: string,
    fullName: string
  ): Promise<{ token: string; user: UserAccount; verifiedModels: VerifiedModelConfig[] }> {
    const res = await fetch(`${getApiBaseUrl()}/api/auth/signup`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ email, password, fullName }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to sign up.');
    }
    this.token = data.token;
    return {
      token: data.token,
      user: data.user,
      verifiedModels: data.verifiedModels || [],
    };
  }

  public async login(
    email: string,
    password: string
  ): Promise<{ token: string; user: UserAccount; verifiedModels: VerifiedModelConfig[] }> {
    const res = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to sign in.');
    }
    this.token = data.token;
    return {
      token: data.token,
      user: data.user,
      verifiedModels: data.verifiedModels || [],
    };
  }

  public async logout(): Promise<void> {
    try {
      if (this.token) {
        await fetch(`${getApiBaseUrl()}/api/auth/logout`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ token: this.token }),
        });
      }
    } catch {
      // ignore
    } finally {
      this.token = null;
    }
  }

  public async getMe(): Promise<UserAccount> {
    const res = await fetch(`${getApiBaseUrl()}/api/auth/me`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to verify session.');
    }
    return data.user;
  }

  /** Returns the council seats' verified free model configuration (server-verified + DB-persisted). */
  public async fetchVerifiedModels(): Promise<VerifiedModelConfig[]> {
    const res = await fetch(`${getApiBaseUrl()}/api/models/verify`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to load verified free models.');
    }
    return data.models || [];
  }

  public async fetchThreads(): Promise<ThreadSummary[]> {
    const res = await fetch(`${getApiBaseUrl()}/api/threads`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch threads.');
    }
    return data;
  }

  public async createThread(title?: string): Promise<ThreadSummary> {
    const res = await fetch(`${getApiBaseUrl()}/api/threads`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create thread.');
    }
    return data;
  }

  public async fetchThreadMessages(threadId: string): Promise<MultiAgentTurn[]> {
    const res = await fetch(`${getApiBaseUrl()}/api/threads/${threadId}/messages`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch thread messages.');
    }
    return data;
  }

  public async sendPrompt(prompt: string, threadId?: string): Promise<MultiAgentTurn> {
    const res = await fetch(`${getApiBaseUrl()}/api/multi-agent`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ prompt, threadId }),
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'Failed to process prompt.');
    }
    return data;
  }
}

export const apiClient = new ApiClient();
