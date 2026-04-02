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

export interface UserMessage {
  id: number;
  sender: string;
  recipient: string;
  content: string;
  language: string;
  translatedContent?: string;
  translatedLanguage?: string;
  parentMessageId?: number | null;
  createdAt: string;
  direction?: 'inbound' | 'outbound';
}

export interface MessageHistoryItem {
  messageId: number;
  from: string;
  to: string;
  at: string;
  content: string;
  direction: 'inbound' | 'outbound';
}

export interface ConversationSummary {
  username: string;
  latestMessageId: number;
  latestAt: string;
  latestContent: string;
  latestDirection: 'inbound' | 'outbound';
}
