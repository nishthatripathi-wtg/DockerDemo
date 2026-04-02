import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthResponse } from '../shared/models';
import { AuthStateService } from '../shared/auth-state.service';

@Component({
  selector: 'app-auth',
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <h1>Welcome</h1>
        <p>Login or register to continue.</p>

        <div class="tab-row">
          <button class="tab-btn" [class.active-tab]="mode==='login'" (click)="switchMode('login')">Login</button>
          <button class="tab-btn" [class.active-tab]="mode==='register'" (click)="switchMode('register')">Register</button>
        </div>

        <div class="form-box" *ngIf="mode==='login'">
          <h3>Login</h3>
          <input [(ngModel)]="loginUsername" placeholder="username" />
          <input [(ngModel)]="loginPassword" type="password" placeholder="password" />
          <button class="full-btn" (click)="login()" [disabled]="loading">Login</button>
        </div>

        <div class="form-box" *ngIf="mode==='register'">
          <h3>Register</h3>
          <input [(ngModel)]="registerUsername" placeholder="username" />
          <input [(ngModel)]="registerPassword" type="password" placeholder="password (min 6 chars)" />
          <input [(ngModel)]="registerDisplayName" placeholder="display name" />
          <button class="full-btn" (click)="register()" [disabled]="loading">Create Account</button>
        </div>

        <div class="error" *ngIf="error">{{ error }}</div>
      </div>
    </div>
  `,
  styles: [`
    .auth-page { min-height: 100vh; display:flex; align-items:center; justify-content:center; background: linear-gradient(135deg,#111827 0%,#1f2937 50%,#374151 100%); padding: 16px; }
    .auth-card { width:100%; max-width:420px; background: rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.2); border-radius:16px; padding:24px; color:#fff; }
    h1 { margin:0 0 8px; }
    p { margin:0 0 16px; color:#d1d5db; }
    h3 { margin: 0 0 10px; color: #e5e7eb; font-size: 15px; }
    input { width:100%; margin-bottom:10px; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,.25); background:rgba(255,255,255,.08); color:#fff; }
    input::placeholder { color:#9ca3af; }
    .tab-row { display:flex; gap:8px; margin-bottom:14px; }
    .tab-btn { flex:1; padding:10px 12px; border:none; border-radius:10px; background:rgba(255,255,255,.18); color:#fff; font-weight:600; cursor:pointer; }
    .active-tab { background: linear-gradient(135deg,#4f46e5,#7c3aed); }
    .form-box { border:1px solid rgba(255,255,255,.2); border-radius:12px; padding:14px; background: rgba(255,255,255,.05); }
    .full-btn { width:100%; padding:10px 12px; border:none; border-radius:10px; background: linear-gradient(135deg,#4f46e5,#7c3aed); color:#fff; font-weight:600; cursor:pointer; }
    .error { margin-top:10px; color:#fca5a5; font-size:13px; }
  `]
})
export class AuthComponent {
  mode: 'login' | 'register' = 'login';
  loginUsername = '';
  loginPassword = '';
  registerUsername = '';
  registerPassword = '';
  registerDisplayName = '';
  loading = false;
  error = '';

  constructor(private http: HttpClient, private authState: AuthStateService, private router: Router) {}

  switchMode(mode: 'login' | 'register'): void {
    this.mode = mode;
    this.error = '';
  }

  register(): void {
    const username = this.registerUsername.trim();
    const password = this.registerPassword;
    const displayName = this.registerDisplayName.trim() || username;
    if (!username || !password) {
      this.error = 'Username and password are required';
      return;
    }

    this.loading = true;
    this.error = '';
    const query = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&displayName=${encodeURIComponent(displayName)}&preferredLanguage=en&timezone=UTC&theme=dark`;
    this.http.post<AuthResponse>(`/api/auth/register?${query}`, {}).subscribe({
      next: (res) => {
        this.authState.setCurrentUser(res.username);
        this.loading = false;
        this.router.navigate(['/app/messages']);
      },
      error: () => {
        this.error = 'Registration failed';
        this.loading = false;
      }
    });
  }

  login(): void {
    const username = this.loginUsername.trim();
    const password = this.loginPassword;
    if (!username || !password) {
      this.error = 'Username and password are required';
      return;
    }

    this.loading = true;
    this.error = '';
    const query = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    this.http.post<AuthResponse>(`/api/auth/login?${query}`, {}).subscribe({
      next: (res) => {
        this.authState.setCurrentUser(res.username);
        this.loading = false;
        this.router.navigate(['/app/messages']);
      },
      error: () => {
        this.error = 'Login failed';
        this.loading = false;
      }
    });
  }
}
