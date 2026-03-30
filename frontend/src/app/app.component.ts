import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface GreetingResponse {
  message: string;
  language: string;
  timeOfDay: string;
}

interface HistoryItem {
  name: string;
  language: string;
  message: string;
  timestamp: string;
}

interface StatsResponse {
  total: number;
  topNames: { name: string; count: number }[];
}

interface Language {
  code: string;
  name: string;
}

interface UserProfile {
  username: string;
  displayName: string;
  preferredLanguage: string;
  timezone: string;
  theme: 'dark' | 'light';
  updatedAt: string;
}

@Component({
  selector: 'app-root',
  template: `
    <div class="page" [class.light-theme]="activeTheme==='light'">
      <header>
        <span class="header-icon">{{ timeIcon }}</span>
        <h1>Greeting Service</h1>
        <span class="subtitle">{{ timeLabel }}</span>
      </header>

      <main>
        <div class="card personalization-card">
          <h2>👤 Personalization</h2>
          <div class="input-row">
            <input [(ngModel)]="profile.username" placeholder="username" />
            <button (click)="loadProfile()">Load Profile</button>
          </div>

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

          <div class="input-row">
            <button (click)="getPersonalizedGreeting()">Use My Preferences</button>
          </div>
          <div class="small" *ngIf="profile.updatedAt">Last updated: {{ formatTime(profile.updatedAt) }}</div>
        </div>

        <div class="card greet-card">
          <div class="input-row">
            <input type="text" [(ngModel)]="name" placeholder="Enter your name" (keyup.enter)="getGreeting()" />
            <select [(ngModel)]="selectedLang">
              <option *ngFor="let lang of languages" [value]="lang.code">{{ lang.name }}</option>
            </select>
            <button (click)="getGreeting()" [disabled]="loading">{{ loading ? '...' : 'Say Hello' }}</button>
          </div>

          <div class="greeting-display" *ngIf="greeting">
            <span class="greeting-text">{{ greeting }}</span>
          </div>
          <div class="error" *ngIf="error">{{ error }}</div>
        </div>

        <div class="card stats-card" *ngIf="stats">
          <h2>📊 Stats</h2>
          <div class="stats-row">
            <div class="stat-block">
              <span class="stat-number">{{ stats.total }}</span>
              <span class="stat-label">Total Greetings</span>
            </div>
            <div class="top-names" *ngIf="stats.topNames.length > 0">
              <span class="stat-label">Most Greeted</span>
              <div class="name-pills">
                <span class="pill" *ngFor="let n of stats.topNames">{{ n.name }} <strong>×{{ n.count }}</strong></span>
              </div>
            </div>
          </div>
        </div>

        <div class="card history-card">
          <div class="history-header">
            <h2>🕐 Recent Greetings</h2>
            <button class="clear-btn" (click)="clearHistory()" *ngIf="history.length > 0">Clear</button>
          </div>
          <div class="empty" *ngIf="history.length === 0">No greetings yet — say hello!</div>
          <ul class="history-list" *ngIf="history.length > 0">
            <li *ngFor="let item of history">
              <span class="history-msg">{{ item.message }}</span>
              <span class="history-meta">{{ formatTime(item.timestamp) }}</span>
            </li>
          </ul>
        </div>
      </main>
    </div>
  `,
  styles: [`
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .page {
      min-height: 100vh;
      background: linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #eee;
      padding: 0 16px 40px;
      transition: background 0.25s ease, color 0.25s ease;
    }
    .light-theme {
      background: linear-gradient(135deg,#f8fafc 0%,#e2e8f0 50%,#cbd5e1 100%);
      color: #1f2937;
    }
    header { text-align: center; padding: 40px 0 24px; }
    .header-icon { font-size: 48px; display: block; margin-bottom: 8px; }
    h1 { font-size: 2rem; font-weight: 700; }
    .subtitle { display: inline-block; margin-top: 6px; font-size: .9rem; color: #94a3b8; text-transform: capitalize; }
    .light-theme .subtitle { color: #475569; }
    main { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
    .card { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 24px; backdrop-filter: blur(8px); }
    .light-theme .card { background: rgba(255,255,255,.75); border-color: rgba(15,23,42,.15); }
    .input-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
    input, select { flex: 1; min-width: 130px; padding: 10px 12px; border: 1px solid rgba(255,255,255,.2); border-radius: 10px; background: rgba(255,255,255,.08); color: inherit; font-size: 14px; outline: none; }
    .light-theme input, .light-theme select { border-color: rgba(15,23,42,.25); background: rgba(255,255,255,.95); }
    input::placeholder { color: #718096; }
    button { padding: 10px 18px; background: linear-gradient(135deg,#667eea,#764ba2); color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .small { font-size: 12px; color: #94a3b8; }
    .light-theme .small { color: #334155; }
    .greeting-display { margin-top: 12px; padding: 16px; background: rgba(99,179,237,.12); border: 1px solid rgba(99,179,237,.3); border-radius: 12px; text-align: center; }
    .greeting-text { font-size: 1.4rem; font-weight: 600; }
    .error { margin-top: 10px; color: #ef4444; font-size: 13px; }
    .stats-card h2, .history-card h2, .personalization-card h2 { font-size: 1rem; margin-bottom: 12px; color: #a0aec0; }
    .light-theme .stats-card h2, .light-theme .history-card h2, .light-theme .personalization-card h2 { color: #334155; }
    .stats-row { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
    .stat-number { font-size: 2.2rem; font-weight: 700; color: #22c55e; line-height: 1; }
    .stat-label { font-size: .75rem; color: #718096; margin-top: 4px; display: block; }
    .name-pills { display: flex; flex-wrap: wrap; gap: 6px; }
    .pill { padding: 4px 10px; background: rgba(102,126,234,.25); border: 1px solid rgba(102,126,234,.4); border-radius: 20px; font-size: 12px; }
    .history-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .clear-btn { padding: 6px 12px; font-size: 12px; background: rgba(252,129,129,.15); border: 1px solid rgba(252,129,129,.4); color: #ef4444; border-radius: 8px; }
    .empty { color: #718096; font-size: 13px; padding: 8px 0; }
    .history-list { list-style: none; display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
    .history-list li { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(255,255,255,.04); border-radius: 10px; gap: 10px; flex-wrap: wrap; }
    .light-theme .history-list li { background: rgba(15,23,42,.06); }
    .history-msg { font-size: 14px; }
    .history-meta { font-size: 11px; color: #718096; white-space: nowrap; }
  `]
})
export class AppComponent implements OnInit {
  name = '';
  selectedLang = 'en';
  languages: Language[] = [];
  greeting = '';
  error = '';
  loading = false;
  timeIcon = '🌍';
  timeLabel = '';
  history: HistoryItem[] = [];
  stats: StatsResponse | null = null;

  profile: UserProfile = {
    username: 'nishtha',
    displayName: 'Nishtha',
    preferredLanguage: 'en',
    timezone: 'UTC',
    theme: 'dark',
    updatedAt: ''
  };

  timezones = ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'Asia/Tokyo'];
  activeTheme: 'dark' | 'light' = 'dark';

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.setTimeContext();
    this.loadLanguages();
    this.loadHistory();
    this.loadStats();
    this.loadProfile();
  }

  setTimeContext() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) { this.timeIcon = '☀️'; this.timeLabel = 'Good morning'; }
    else if (hour >= 12 && hour < 18) { this.timeIcon = '🌤️'; this.timeLabel = 'Good afternoon'; }
    else if (hour >= 18 && hour < 22) { this.timeIcon = '🌆'; this.timeLabel = 'Good evening'; }
    else { this.timeIcon = '🌙'; this.timeLabel = 'Good night'; }
  }

  loadLanguages() {
    this.http.get<Language[]>('/api/greeting/languages').subscribe({
      next: (langs) => this.languages = langs,
      error: () => this.languages = [{ code: 'en', name: 'English' }]
    });
  }

  loadProfile() {
    const username = (this.profile.username || '').trim();
    if (!username) return;
    this.http.get<UserProfile>(`/api/profile?username=${encodeURIComponent(username)}`).subscribe({
      next: (p) => {
        this.profile = p;
        this.selectedLang = p.preferredLanguage || 'en';
        this.name = p.displayName || '';
        this.activeTheme = p.theme || 'dark';
      },
      error: () => {}
    });
  }

  saveProfile() {
    const p = this.profile;
    const query = `username=${encodeURIComponent(p.username)}&displayName=${encodeURIComponent(p.displayName)}&preferredLanguage=${encodeURIComponent(p.preferredLanguage)}&timezone=${encodeURIComponent(p.timezone)}&theme=${encodeURIComponent(p.theme)}`;
    this.http.post<UserProfile>(`/api/profile?${query}`, {}).subscribe({
      next: (updated) => {
        this.profile = updated;
        this.selectedLang = updated.preferredLanguage;
        this.name = updated.displayName;
        this.activeTheme = updated.theme;
      },
      error: () => this.error = 'Failed to save profile'
    });
  }

  getPersonalizedGreeting() {
    const username = (this.profile.username || '').trim();
    if (!username) {
      this.error = 'Enter username first';
      return;
    }
    this.loading = true;
    this.error = '';
    this.http.get<GreetingResponse>(`/api/greeting/personalized?username=${encodeURIComponent(username)}`).subscribe({
      next: (res) => {
        this.greeting = res.message;
        this.loading = false;
        this.loadHistory();
        this.loadStats();
      },
      error: () => {
        this.loading = false;
        this.error = 'Failed to load personalized greeting';
      }
    });
  }

  getGreeting() {
    this.error = '';
    this.loading = true;
    const params = `?name=${encodeURIComponent(this.name || 'World')}&lang=${this.selectedLang}`;
    this.http.get<GreetingResponse>(`/api/greeting${params}`).subscribe({
      next: (res) => {
        this.greeting = res.message;
        this.loading = false;
        this.loadHistory();
        this.loadStats();
      },
      error: () => {
        this.error = 'Could not reach the backend. Is it running?';
        this.loading = false;
      }
    });
  }

  loadHistory() {
    this.http.get<HistoryItem[]>('/api/greeting/history').subscribe({ next: (h) => this.history = h, error: () => {} });
  }

  loadStats() {
    this.http.get<StatsResponse>('/api/greeting/stats').subscribe({ next: (s) => this.stats = s, error: () => {} });
  }

  clearHistory() {
    this.http.delete('/api/greeting/history').subscribe({
      next: () => {
        this.history = [];
        this.loadStats();
        this.greeting = '';
      },
      error: () => {}
    });
  }

  formatTime(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
}
