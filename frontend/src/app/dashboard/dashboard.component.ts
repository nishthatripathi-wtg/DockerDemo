import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthStateService } from '../shared/auth-state.service';
import { Language, MessageHistoryItem, UserMessage, UserProfile } from '../shared/models';

@Component({
  selector: 'app-dashboard',
  template: `
    <div class="page" [class.light-theme]="activeTheme==='light'">
      <header>
        <span class="header-icon">💬</span>
        <h1>Message Board</h1>
        <span class="subtitle">Send custom greetings to other users</span>
      </header>

      <main>
        <div class="card topbar">
          <div>Logged in as <strong>{{ currentUser }}</strong></div>
          <button (click)="logout()">Logout</button>
        </div>

        <div class="card personalization-card">
          <h2>👤 Personalization</h2>
          <div class="input-row">
            <input [(ngModel)]="profile.displayName" placeholder="display name" />
            <select [(ngModel)]="profile.preferredLanguage">
              <option *ngFor="let lang of languages" [value]="lang.code">{{ lang.name }}</option>
            </select>
            <select [(ngModel)]="profile.timezone">
              <option *ngFor="let tz of timezones" [value]="tz">{{ tz }}</option>
            </select>
            <select [(ngModel)]="profile.theme">
              <option value="dark">dark</option>
              <option value="light">light</option>
            </select>
            <button (click)="saveProfile()">Save</button>
          </div>
          <div class="small" *ngIf="profile.updatedAt">Last updated: {{ formatTime(profile.updatedAt) }}</div>
        </div>

        <div class="card send-card">
          <h2>✉️ Send Greeting Message</h2>
          <div class="input-row">
            <div class="search-wrap">
              <input [(ngModel)]="recipientQuery" (input)="searchRecipients()" placeholder="Search recipient username" />
              <div class="search-results" *ngIf="recipientResults.length > 0">
                <button class="result-item" *ngFor="let user of recipientResults" (click)="selectRecipient(user)">{{ user }}</button>
              </div>
            </div>
            <select [(ngModel)]="selectedLanguage">
              <option *ngFor="let lang of languages" [value]="lang.code">{{ lang.name }}</option>
            </select>
          </div>
          <div class="input-row">
            <input [(ngModel)]="messageText" placeholder="Write your custom greeting..." (keyup.enter)="sendMessage()" />
            <button (click)="sendMessage()">Send</button>
          </div>
          <div class="error" *ngIf="error">{{ error }}</div>
          <div class="success" *ngIf="success">{{ success }}</div>
        </div>

        <div class="card inbox-card">
          <h2>📥 Inbox</h2>
          <div class="empty" *ngIf="inbox.length===0">No messages yet.</div>
          <ul class="message-list" *ngIf="inbox.length>0">
            <li *ngFor="let m of inbox">
              <div class="message-box">
                <div class="message-main">
                  <div class="line"><strong>From:</strong> {{ m.sender }} · <strong>At:</strong> {{ formatTime(m.createdAt) }}</div>
                  <div class="line">{{ m.translatedContent || m.content }}</div>
                </div>
                <div class="message-actions">
                  <div class="actions">
                    <select [(ngModel)]="translateTarget[m.id]">
                      <option *ngFor="let lang of languages" [value]="lang.code">{{ lang.name }}</option>
                    </select>
                    <button (click)="translateMessage(m.id)">Translate</button>
                  </div>
                  <div class="actions">
                    <input [(ngModel)]="replyText[m.id]" placeholder="Reply..." />
                    <button (click)="replyToMessage(m.id)">Reply</button>
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </div>

        <div class="card history-card">
          <h2>🕓 Message History</h2>
          <div class="empty" *ngIf="history.length===0">No history yet.</div>
          <ul class="message-list" *ngIf="history.length>0">
            <li *ngFor="let h of history">
              <div class="line">
                <span class="tag" [class.inbound]="h.direction==='inbound'" [class.outbound]="h.direction==='outbound'">{{ h.direction }}</span>
                {{ h.from }} → {{ h.to }} · {{ formatTime(h.at) }}
              </div>
              <div class="line">{{ h.content }}</div>
            </li>
          </ul>
        </div>
      </main>
    </div>
  `,
  styles: [`
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .page { min-height: 100vh; background: linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%); font-family: 'Segoe UI', Arial, sans-serif; color: #eee; padding: 0 16px 40px; transition: background .25s ease, color .25s ease; }
    .light-theme { background: linear-gradient(135deg,#f8fafc 0%,#e2e8f0 50%,#cbd5e1 100%); color: #1f2937; }
    header { text-align: center; padding: 40px 0 24px; }
    .header-icon { font-size: 44px; display:block; margin-bottom:8px; }
    h1 { font-size: 2rem; font-weight: 700; }
    .subtitle { display:inline-block; margin-top:6px; font-size:.9rem; color:#94a3b8; }
    .light-theme .subtitle { color:#475569; }
    main { max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
    .card { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 20px; backdrop-filter: blur(8px); }
    .light-theme .card { background: rgba(255,255,255,.75); border-color: rgba(15,23,42,.15); }
    .topbar { display:flex; justify-content:space-between; align-items:center; }
    h2 { font-size: 1rem; margin-bottom: 12px; color: #a0aec0; }
    .light-theme h2 { color: #334155; }
    .input-row { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
    input, select { flex:1; min-width:140px; padding:10px 12px; border:1px solid rgba(255,255,255,.2); border-radius:10px; background:rgba(255,255,255,.08); color:inherit; font-size:14px; }
    .light-theme input, .light-theme select { border-color: rgba(15,23,42,.25); background: rgba(255,255,255,.95); }
    button { padding:10px 16px; border:none; border-radius:10px; background: linear-gradient(135deg,#667eea,#764ba2); color:#fff; font-weight:600; cursor:pointer; }
    .message-list { list-style:none; display:flex; flex-direction:column; gap:10px; }
    .message-list li { padding:12px; border-radius:10px; background: rgba(255,255,255,.04); }
    .light-theme .message-list li { background: rgba(15,23,42,.06); }
    .line { margin-bottom:6px; }
    .actions { display:flex; gap:8px; flex-wrap:wrap; }
    .message-box { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap; }
    .message-main { flex:1; min-width:240px; }
    .message-actions { display:flex; flex-direction:column; gap:8px; min-width:260px; }
    .search-wrap { position: relative; flex: 1; min-width: 220px; }
    .search-wrap input { width: 100%; }
    .search-results { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 20; border: 1px solid rgba(255,255,255,.2); border-radius: 10px; background: #1f2937; max-height: 180px; overflow-y: auto; }
    .light-theme .search-results { background: #ffffff; border-color: rgba(15,23,42,.25); }
    .result-item { width: 100%; text-align: left; border: none; border-bottom: 1px solid rgba(255,255,255,.12); background: transparent; color: inherit; padding: 8px 10px; border-radius: 0; }
    .result-item:last-child { border-bottom: none; }
    .result-item:hover { background: rgba(99,102,241,.22); }
    .tag { padding:2px 8px; border-radius:99px; font-size:11px; margin-right:8px; }
    .inbound { background:#dcfce7; color:#166534; }
    .outbound { background:#dbeafe; color:#1e40af; }
    .empty { color:#718096; font-size:13px; }
    .small { font-size:12px; color:#94a3b8; }
    .error { color:#ef4444; font-size:13px; }
    .success { color:#22c55e; font-size:13px; }
  `]
})
export class DashboardComponent implements OnInit {
  currentUser = '';
  profile: UserProfile = {
    username: '',
    displayName: '',
    preferredLanguage: 'en',
    timezone: 'UTC',
    theme: 'dark',
    updatedAt: ''
  };

  languages: Language[] = [];
  timezones = ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'Asia/Tokyo'];
  activeTheme: 'dark' | 'light' = 'dark';

  recipient = '';
  recipientQuery = '';
  recipientResults: string[] = [];
  messageText = '';
  selectedLanguage = 'en';
  inbox: UserMessage[] = [];
  history: MessageHistoryItem[] = [];
  replyText: Record<number, string> = {};
  translateTarget: Record<number, string> = {};

  error = '';
  success = '';

  constructor(private http: HttpClient, private authState: AuthStateService, private router: Router) {}

  ngOnInit(): void {
    this.currentUser = this.authState.getCurrentUser();
    if (!this.currentUser) {
      this.router.navigate(['/auth']);
      return;
    }
    this.profile.username = this.currentUser;
    this.loadLanguages();
    this.loadProfile();
    this.loadInbox();
    this.loadHistory();
  }

  logout(): void {
    this.authState.logout();
    this.router.navigate(['/auth']);
  }

  loadLanguages(): void {
    this.http.get<Language[]>('/api/greeting/languages').subscribe({
      next: (langs) => {
        this.languages = langs;
        if (!this.translateTarget) {
          this.translateTarget = {};
        }
      },
      error: () => {
        this.languages = [{ code: 'en', name: 'English' }];
      }
    });
  }

  loadProfile(): void {
    this.http.get<UserProfile>(`/api/profile?username=${encodeURIComponent(this.currentUser)}`).subscribe({
      next: (p) => {
        this.profile = p;
        this.activeTheme = p.theme || 'dark';
        this.selectedLanguage = p.preferredLanguage || 'en';
      },
      error: () => {}
    });
  }

  saveProfile(): void {
    const p = this.profile;
    const query = `username=${encodeURIComponent(this.currentUser)}&displayName=${encodeURIComponent(p.displayName)}&preferredLanguage=${encodeURIComponent(p.preferredLanguage)}&timezone=${encodeURIComponent(p.timezone)}&theme=${encodeURIComponent(p.theme)}`;
    this.http.post<UserProfile>(`/api/profile?${query}`, {}).subscribe({
      next: (updated) => {
        this.profile = updated;
        this.activeTheme = updated.theme || 'dark';
        this.success = 'Profile saved';
        this.error = '';
      },
      error: () => {
        this.error = 'Failed to save profile';
        this.success = '';
      }
    });
  }

  sendMessage(): void {
    this.error = '';
    this.success = '';
    const recipient = this.recipient.trim().toLowerCase();
    const content = this.messageText.trim();
    if (!recipient || !content) {
      this.error = 'Recipient and message are required';
      return;
    }
    const query = `sender=${encodeURIComponent(this.currentUser)}&recipient=${encodeURIComponent(recipient)}&content=${encodeURIComponent(content)}&language=${encodeURIComponent(this.selectedLanguage)}`;
    this.http.post<UserMessage>(`/api/messages/send?${query}`, {}).subscribe({
      next: () => {
        this.messageText = '';
        this.recipient = '';
        this.recipientQuery = '';
        this.recipientResults = [];
        this.success = 'Message sent';
        this.loadHistory();
      },
      error: () => {
        this.error = 'Failed to send message';
      }
    });
  }

  loadInbox(): void {
    this.http.get<UserMessage[]>(`/api/messages/inbox?username=${encodeURIComponent(this.currentUser)}`).subscribe({
      next: (items) => {
        this.inbox = items;
        for (const item of items) {
          if (!this.translateTarget[item.id]) {
            this.translateTarget[item.id] = this.profile.preferredLanguage || 'en';
          }
        }
      },
      error: () => {}
    });
  }

  loadHistory(): void {
    this.http.get<MessageHistoryItem[]>(`/api/messages/history?username=${encodeURIComponent(this.currentUser)}`).subscribe({
      next: (items) => this.history = items,
      error: () => {}
    });
  }

  translateMessage(messageId: number): void {
    const targetLanguage = this.translateTarget[messageId] || 'en';
    const query = `messageId=${messageId}&targetLanguage=${encodeURIComponent(targetLanguage)}`;
    this.http.post<UserMessage>(`/api/messages/translate?${query}`, {}).subscribe({
      next: () => this.loadInbox(),
      error: () => this.error = 'Failed to translate message'
    });
  }

  replyToMessage(messageId: number): void {
    const content = (this.replyText[messageId] || '').trim();
    if (!content) {
      this.error = 'Reply message is required';
      return;
    }
    const query = `messageId=${messageId}&sender=${encodeURIComponent(this.currentUser)}&content=${encodeURIComponent(content)}&language=${encodeURIComponent(this.profile.preferredLanguage || 'en')}`;
    this.http.post<UserMessage>(`/api/messages/reply?${query}`, {}).subscribe({
      next: () => {
        this.replyText[messageId] = '';
        this.loadInbox();
        this.loadHistory();
        this.success = 'Reply sent';
        this.error = '';
      },
      error: () => {
        this.error = 'Failed to send reply';
      }
    });
  }

  formatTime(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  searchRecipients(): void {
    const q = this.recipientQuery.trim();
    if (q.length < 1) {
      this.recipientResults = [];
      return;
    }
    const query = `query=${encodeURIComponent(q)}&exclude=${encodeURIComponent(this.currentUser)}`;
    this.http.get<string[]>(`/api/auth/users/search?${query}`).subscribe({
      next: (users) => this.recipientResults = users,
      error: () => this.recipientResults = []
    });
  }

  selectRecipient(username: string): void {
    this.recipient = username;
    this.recipientQuery = username;
    this.recipientResults = [];
  }
}
