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

@Component({
  selector: 'app-root',
  template: `
    <div class="page">
      <header>
        <span class="header-icon">{{ timeIcon }}</span>
        <h1>Greeting Service</h1>
        <span class="subtitle">{{ timeLabel }}</span>
      </header>

      <main>
        <!-- Greet Card -->
        <div class="card greet-card">
          <div class="input-row">
            <input
              type="text"
              [(ngModel)]="name"
              placeholder="Enter your name"
              (keyup.enter)="getGreeting()"
            />
            <select [(ngModel)]="selectedLang">
              <option *ngFor="let lang of languages" [value]="lang.code">
                {{ lang.name }}
              </option>
            </select>
            <button (click)="getGreeting()" [disabled]="loading">
              {{ loading ? '...' : 'Say Hello' }}
            </button>
          </div>

          <div class="greeting-display" *ngIf="greeting">
            <span class="greeting-text">{{ greeting }}</span>
          </div>
          <div class="error" *ngIf="error">{{ error }}</div>
        </div>

        <!-- Stats Card -->
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
                <span class="pill" *ngFor="let n of stats.topNames">
                  {{ n.name }} <strong>×{{ n.count }}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- History Card -->
        <div class="card history-card">
          <div class="history-header">
            <h2>🕐 Recent Greetings</h2>
            <button class="clear-btn" (click)="clearHistory()" *ngIf="history.length > 0">
              Clear
            </button>
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
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #eee;
      padding: 0 16px 40px;
    }

    header {
      text-align: center;
      padding: 40px 0 24px;
    }
    .header-icon { font-size: 48px; display: block; margin-bottom: 8px; }
    h1 { font-size: 2rem; font-weight: 700; color: #fff; }
    .subtitle {
      display: inline-block;
      margin-top: 6px;
      font-size: 0.9rem;
      color: #a0aec0;
      text-transform: capitalize;
    }

    main {
      max-width: 680px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .card {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 24px;
      backdrop-filter: blur(8px);
    }

    /* Greet card */
    .input-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    input {
      flex: 1;
      min-width: 140px;
      padding: 12px 16px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 10px;
      background: rgba(255,255,255,0.08);
      color: #fff;
      font-size: 15px;
      outline: none;
      transition: border-color 0.2s;
    }
    input::placeholder { color: #718096; }
    input:focus { border-color: #63b3ed; }

    select {
      padding: 12px 14px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 10px;
      background: rgba(255,255,255,0.08);
      color: #fff;
      font-size: 15px;
      cursor: pointer;
      outline: none;
    }
    select option { background: #1a1a2e; color: #fff; }

    button {
      padding: 12px 24px;
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.1s;
      white-space: nowrap;
    }
    button:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }

    .greeting-display {
      margin-top: 20px;
      padding: 20px;
      background: rgba(99,179,237,0.12);
      border: 1px solid rgba(99,179,237,0.3);
      border-radius: 12px;
      text-align: center;
      animation: fadeIn 0.4s ease;
    }
    .greeting-text { font-size: 1.6rem; font-weight: 600; color: #bee3f8; }

    .error {
      margin-top: 12px;
      color: #fc8181;
      font-size: 14px;
      text-align: center;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* Stats card */
    .stats-card h2 { font-size: 1rem; margin-bottom: 16px; color: #a0aec0; }
    .stats-row { display: flex; align-items: center; gap: 32px; flex-wrap: wrap; }
    .stat-block { display: flex; flex-direction: column; align-items: center; }
    .stat-number { font-size: 2.4rem; font-weight: 700; color: #68d391; line-height: 1; }
    .stat-label { font-size: 0.75rem; color: #718096; margin-top: 4px; }
    .top-names { display: flex; flex-direction: column; gap: 8px; }
    .name-pills { display: flex; flex-wrap: wrap; gap: 6px; }
    .pill {
      padding: 4px 12px;
      background: rgba(102,126,234,0.25);
      border: 1px solid rgba(102,126,234,0.4);
      border-radius: 20px;
      font-size: 13px;
      color: #c3dafe;
    }
    .pill strong { color: #fff; }

    /* History card */
    .history-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .history-card h2 { font-size: 1rem; color: #a0aec0; }
    .clear-btn {
      padding: 6px 14px;
      font-size: 13px;
      background: rgba(252,129,129,0.15);
      border: 1px solid rgba(252,129,129,0.4);
      color: #fc8181;
      border-radius: 8px;
    }
    .clear-btn:hover:not(:disabled) { background: rgba(252,129,129,0.3); }

    .empty { color: #718096; font-size: 14px; text-align: center; padding: 16px 0; }

    .history-list { list-style: none; display: flex; flex-direction: column; gap: 10px; }
    .history-list li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: rgba(255,255,255,0.04);
      border-radius: 10px;
      gap: 12px;
      flex-wrap: wrap;
    }
    .history-msg { font-size: 15px; color: #e2e8f0; }
    .history-meta { font-size: 12px; color: #718096; white-space: nowrap; }
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

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.setTimeContext();
    this.loadLanguages();
    this.loadHistory();
    this.loadStats();
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
      error: () => {
        this.languages = [{ code: 'en', name: 'English' }];
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
    this.http.get<HistoryItem[]>('/api/greeting/history').subscribe({
      next: (h) => this.history = h,
      error: () => {}
    });
  }

  loadStats() {
    this.http.get<StatsResponse>('/api/greeting/stats').subscribe({
      next: (s) => this.stats = s,
      error: () => {}
    });
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
