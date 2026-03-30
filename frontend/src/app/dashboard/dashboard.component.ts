import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthStateService } from '../shared/auth-state.service';
import { Language, UserProfile } from '../shared/models';

@Component({
  selector: 'app-dashboard',
  template: `
    <div class="page" [class.light-theme]="activeTheme==='light'">
      <header>
        <span class="header-icon">👤</span>
        <h1>Profile</h1>
        <span class="subtitle">Manage your personalization settings</span>
      </header>

      <main>
        <div class="card topbar">
          <div>Logged in as <strong>{{ currentUser }}</strong></div>
          <div class="actions">
            <button (click)="goToMessages()">Messages</button>
            <button (click)="logout()">Logout</button>
          </div>
        </div>

        <div class="card personalization-card">
          <h2>Personalization</h2>
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

        <div class="error" *ngIf="error">{{ error }}</div>
        <div class="success" *ngIf="success">{{ success }}</div>
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
    .actions { display:flex; gap:8px; }
    h2 { font-size: 1rem; margin-bottom: 12px; color: #a0aec0; }
    .light-theme h2 { color: #334155; }
    .input-row { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
    input, select { flex:1; min-width:140px; padding:10px 12px; border:1px solid rgba(255,255,255,.2); border-radius:10px; background:rgba(255,255,255,.08); color:inherit; font-size:14px; }
    .light-theme input, .light-theme select { border-color: rgba(15,23,42,.25); background: rgba(255,255,255,.95); }
    button { padding:10px 16px; border:none; border-radius:10px; background: linear-gradient(135deg,#667eea,#764ba2); color:#fff; font-weight:600; cursor:pointer; }
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
  }

  loadLanguages(): void {
    this.http.get<Language[]>('/api/greeting/languages').subscribe({
      next: (langs) => this.languages = langs,
      error: () => this.languages = [{ code: 'en', name: 'English' }]
    });
  }

  loadProfile(): void {
    this.http.get<UserProfile>(`/api/profile?username=${encodeURIComponent(this.currentUser)}`).subscribe({
      next: (p) => {
        this.profile = p;
        this.activeTheme = p.theme || 'dark';
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

  goToMessages(): void {
    this.router.navigate(['/app/messages']);
  }

  logout(): void {
    this.authState.logout();
    this.router.navigate(['/auth']);
  }

  formatTime(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
}
