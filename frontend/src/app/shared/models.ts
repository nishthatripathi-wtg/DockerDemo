export interface GreetingResponse {
  message: string;
  language: string;
  timeOfDay: string;
}

export interface HistoryItem {
  name: string;
  language: string;
  message: string;
  timestamp: string;
}

export interface StatsResponse {
  total: number;
  topNames: { name: string; count: number }[];
}

export interface Language {
  code: string;
  name: string;
}

export interface UserProfile {
  username: string;
  displayName: string;
  preferredLanguage: string;
  timezone: string;
  theme: 'dark' | 'light';
  updatedAt: string;
}

export interface AuthResponse {
  username: string;
  message: string;
  profile: UserProfile;
}
