import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthStateService } from '../shared/auth-state.service';
import { ConversationSummary, Language, UserMessage, UserProfile } from '../shared/models';

@Component({
  selector: 'app-messages',
  template: `
    <div class="page" [class.light-theme]="activeTheme==='light'">
      <header>
        <span class="header-icon">💬</span>
        <h1>Messages</h1>
        <span class="subtitle">Grouped conversations and threaded history</span>
      </header>

      <main>
        <div class="card topbar">
          <div>Logged in as <strong>{{ currentUser }}</strong></div>
          <div class="topbar-actions">
            <button (click)="goToDashboard()">Profile</button>
            <button (click)="logout()">Logout</button>
          </div>
        </div>

        <div class="card send-card">
          <h2>✉️ Send Message</h2>
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
            <input [(ngModel)]="messageText" placeholder="Write your message..." (keyup.enter)="sendMessage()" />
            <button (click)="sendMessage()">Send</button>
          </div>
        </div>

        <div class="card board">
          <aside class="threads">
            <h2>Users</h2>
            <div class="empty" *ngIf="conversations.length===0">No conversations yet.</div>
            <button
              class="thread-item"
              *ngFor="let c of conversations"
              [class.active]="selectedCounterpart===c.username"
              (click)="openConversation(c.username)"
            >
              <div class="thread-head">
                <strong>{{ c.username }}</strong>
                <span class="small">{{ formatTime(c.latestAt) }}</span>
              </div>
              <div class="thread-preview">{{ c.latestContent }}</div>
            </button>
          </aside>

          <section class="thread-view">
            <h2 *ngIf="selectedCounterpart">Conversation with {{ selectedCounterpart }}</h2>
            <div class="empty" *ngIf="!selectedCounterpart">Select a user to view history.</div>
            <div class="empty" *ngIf="selectedCounterpart && threadMessages.length===0">No messages in this conversation.</div>

            <ul class="message-list" *ngIf="threadMessages.length>0">
              <li *ngFor="let m of threadMessages">
                <button class="message-select" [class.selected]="selectedMessageId===m.id" (click)="selectMessage(m.id)">
                  <div class="line">
                    <span class="tag" [class.inbound]="m.direction==='inbound'" [class.outbound]="m.direction==='outbound'">{{ m.direction }}</span>
                    <strong>{{ m.sender }}</strong> → {{ m.recipient }} · {{ formatTime(m.createdAt) }}
                  </div>
                  <div class="line">{{ m.translatedContent || m.content }}</div>
                </button>
              </li>
            </ul>

            <div class="selected-actions" *ngIf="selectedMessage">
              <h3>Selected message #{{ selectedMessage.id }}</h3>
              <div class="actions">
                <input [(ngModel)]="replyDraft" placeholder="Reply to selected message..." />
                <button (click)="replyToSelected()">Reply</button>
              </div>
              <div class="actions">
                <select [(ngModel)]="translateTarget">
                  <option *ngFor="let lang of languages" [value]="lang.code">{{ lang.name }}</option>
                </select>
                <button (click)="translateSelected()" [disabled]="selectedMessage.direction !== 'inbound'">Translate</button>
                <span class="small" *ngIf="selectedMessage.direction !== 'inbound'">Translate only for messages sent by others</span>
              </div>
            </div>
          </section>
        </div>

        <div class="error" *ngIf="error">{{ error }}</div>
        <div class="success" *ngIf="success">{{ success }}</div>
      </main>
    </div>
  `,
  styles: [`
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .page { min-height: 100vh; background: linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%); font-family: 'Segoe UI', Arial, sans-serif; color: #eee; padding: 0 16px 40px; transition: background .25s ease, color .25s ease; }
    .light-theme { background: linear-gradient(135deg,#f8fafc 0%,#e2e8f0 50%,#cbd5e1 100%); color: #1f2937; }
    header { text-align: center; padding: 32px 0 20px; }
    .header-icon { font-size: 40px; display:block; margin-bottom:8px; }
    h1 { font-size: 1.9rem; font-weight: 700; }
    .subtitle { display:inline-block; margin-top:6px; font-size:.9rem; color:#94a3b8; }
    .light-theme .subtitle { color:#475569; }
    main { max-width: 980px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
    .card { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 16px; backdrop-filter: blur(8px); }
    .light-theme .card { background: rgba(255,255,255,.75); border-color: rgba(15,23,42,.15); }
    .topbar { display:flex; justify-content:space-between; align-items:center; }
    h2 { font-size: 1rem; margin-bottom: 10px; color: #a0aec0; }
    .light-theme h2 { color: #334155; }
    h3 { font-size: .92rem; margin-bottom: 8px; color:#a0aec0; }
    .light-theme h3 { color:#334155; }
    .input-row { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
    input, select { flex:1; min-width:140px; padding:10px 12px; border:1px solid rgba(255,255,255,.2); border-radius:10px; background:rgba(255,255,255,.08); color:inherit; font-size:14px; }
    .light-theme input, .light-theme select { border-color: rgba(15,23,42,.25); background: rgba(255,255,255,.95); }
    button { padding:10px 14px; border:none; border-radius:10px; background: linear-gradient(135deg,#667eea,#764ba2); color:#fff; font-weight:600; cursor:pointer; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .search-wrap { position: relative; flex: 1; min-width: 220px; }
    .search-wrap input { width: 100%; }
    .search-results { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 20; border: 1px solid rgba(255,255,255,.2); border-radius: 10px; background: #1f2937; max-height: 180px; overflow-y: auto; }
    .light-theme .search-results { background: #ffffff; border-color: rgba(15,23,42,.25); }
    .result-item { width: 100%; text-align: left; border: none; border-bottom: 1px solid rgba(255,255,255,.12); background: transparent; color: inherit; padding: 8px 10px; border-radius: 0; }
    .result-item:last-child { border-bottom: none; }
    .result-item:hover { background: rgba(99,102,241,.22); }
    .board { display:grid; grid-template-columns: 300px 1fr; gap: 12px; min-height: 440px; }
    .threads { border-right: 1px solid rgba(255,255,255,.15); padding-right: 10px; }
    .thread-item { width:100%; text-align:left; background: rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1); margin-bottom:8px; }
    .thread-item.active { border-color: #818cf8; }
    .thread-head { display:flex; justify-content:space-between; gap:8px; margin-bottom:4px; }
    .thread-preview { color:#cbd5e1; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .light-theme .thread-preview { color:#475569; }
    .thread-view { padding-left: 6px; display:flex; flex-direction:column; gap:10px; }
    .message-list { list-style:none; display:flex; flex-direction:column; gap:8px; }
    .message-select { width:100%; text-align:left; background: rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1); }
    .message-select.selected { border-color: #a78bfa; box-shadow: 0 0 0 1px rgba(167,139,250,.4) inset; }
    .line { margin-bottom:6px; }
    .selected-actions { border-top: 1px dashed rgba(255,255,255,.2); padding-top: 10px; display:flex; flex-direction:column; gap:8px; }
    .light-theme .selected-actions { border-top-color: rgba(15,23,42,.2); }
    .actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    .tag { padding:2px 8px; border-radius:99px; font-size:11px; margin-right:8px; }
    .inbound { background:#dcfce7; color:#166534; }
    .outbound { background:#dbeafe; color:#1e40af; }
    .empty { color:#94a3b8; font-size:13px; }
    .small { font-size:12px; color:#94a3b8; }
    .error { color:#ef4444; font-size:13px; }
    .success { color:#22c55e; font-size:13px; }
    @media (max-width: 900px) {
      .board { grid-template-columns: 1fr; }
      .threads { border-right: none; border-bottom: 1px solid rgba(255,255,255,.15); padding-right:0; padding-bottom:10px; }
      .thread-view { padding-left: 0; }
    }
  `]
})
export class MessagesComponent implements OnInit {
  currentUser = '';
  activeTheme: 'dark' | 'light' = 'dark';
  profile?: UserProfile;

  languages: Language[] = [];
  selectedLanguage = 'en';
  translateTarget = 'en';

  recipient = '';
  recipientQuery = '';
  recipientResults: string[] = [];
  messageText = '';

  conversations: ConversationSummary[] = [];
  selectedCounterpart = '';
  threadMessages: UserMessage[] = [];
  selectedMessageId?: number;
  replyDraft = '';

  error = '';
  success = '';

  constructor(private http: HttpClient, private authState: AuthStateService, private router: Router) {}

  ngOnInit(): void {
    this.currentUser = this.authState.getCurrentUser();
    if (!this.currentUser) {
      this.router.navigate(['/auth']);
      return;
    }
    this.loadLanguages();
    this.loadProfile();
    this.loadConversations();
  }

  get selectedMessage(): UserMessage | undefined {
    return this.threadMessages.find(m => m.id === this.selectedMessageId);
  }

  logout(): void {
    this.authState.logout();
    this.router.navigate(['/auth']);
  }

  goToDashboard(): void {
    this.router.navigate(['/app/profile']);
  }

  loadLanguages(): void {
    this.http.get<Language[]>('/api/greeting/languages').subscribe({
      next: (langs) => {
        this.languages = langs;
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
        this.translateTarget = p.preferredLanguage || 'en';
      },
      error: () => {}
    });
  }

  loadConversations(): void {
    this.http.get<ConversationSummary[]>(`/api/messages/conversations?username=${encodeURIComponent(this.currentUser)}`).subscribe({
      next: (items) => {
        this.conversations = items;
        if (this.selectedCounterpart) {
          const exists = items.some(i => i.username === this.selectedCounterpart);
          if (exists) {
            this.openConversation(this.selectedCounterpart);
          } else {
            this.selectedCounterpart = '';
            this.threadMessages = [];
            this.selectedMessageId = undefined;
          }
        }
      },
      error: () => {
        this.conversations = [];
      }
    });
  }

  openConversation(username: string): void {
    this.selectedCounterpart = username;
    this.selectedMessageId = undefined;
    this.replyDraft = '';
    const query = `username=${encodeURIComponent(this.currentUser)}&counterpart=${encodeURIComponent(username)}`;
    this.http.get<UserMessage[]>(`/api/messages/thread?${query}`).subscribe({
      next: (items) => {
        this.threadMessages = items;
      },
      error: () => {
        this.error = 'Failed to load conversation';
      }
    });
  }

  selectMessage(messageId: number): void {
    this.selectedMessageId = messageId;
    this.error = '';
    this.success = '';
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
        this.loadConversations();
        if (this.selectedCounterpart === recipient) {
          this.openConversation(recipient);
        }
      },
      error: () => {
        this.error = 'Failed to send message';
      }
    });
  }

  replyToSelected(): void {
    const selected = this.selectedMessage;
    if (!selected) {
      this.error = 'Select a message first';
      return;
    }
    const content = this.replyDraft.trim();
    if (!content) {
      this.error = 'Reply message is required';
      return;
    }
    const language = this.profile?.preferredLanguage || 'en';
    const query = `messageId=${selected.id}&sender=${encodeURIComponent(this.currentUser)}&content=${encodeURIComponent(content)}&language=${encodeURIComponent(language)}`;
    this.http.post<UserMessage>(`/api/messages/reply?${query}`, {}).subscribe({
      next: () => {
        this.replyDraft = '';
        this.success = 'Reply sent';
        this.error = '';
        this.loadConversations();
        if (this.selectedCounterpart) {
          this.openConversation(this.selectedCounterpart);
        }
      },
      error: () => {
        this.error = 'Failed to send reply';
      }
    });
  }

  translateSelected(): void {
    const selected = this.selectedMessage;
    if (!selected) {
      this.error = 'Select a message first';
      return;
    }
    if (selected.direction !== 'inbound') {
      this.error = 'You can only translate messages sent by others';
      return;
    }
    const query = `messageId=${selected.id}&targetLanguage=${encodeURIComponent(this.translateTarget)}&username=${encodeURIComponent(this.currentUser)}`;
    this.http.post<UserMessage>(`/api/messages/translate?${query}`, {}).subscribe({
      next: () => {
        this.success = 'Message translated';
        this.error = '';
        if (this.selectedCounterpart) {
          this.openConversation(this.selectedCounterpart);
        }
        this.loadConversations();
      },
      error: () => {
        this.error = 'Failed to translate message';
      }
    });
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

  formatTime(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
}
