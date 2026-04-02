import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthStateService {
  private readonly KEY = 'greeting-user';

  getCurrentUser(): string {
    return localStorage.getItem(this.KEY) || '';
  }

  isLoggedIn(): boolean {
    return this.getCurrentUser().trim().length > 0;
  }

  setCurrentUser(username: string): void {
    localStorage.setItem(this.KEY, username);
  }

  logout(): void {
    localStorage.removeItem(this.KEY);
  }
}
