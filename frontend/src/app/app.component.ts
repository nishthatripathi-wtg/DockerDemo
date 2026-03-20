import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  template: `
    <div class="container">
      <h1>Greeting Service</h1>
      <div class="input-group">
        <input type="text" [(ngModel)]="name" placeholder="Enter your name" />
        <button (click)="getGreeting()">Say Hello</button>
      </div>
      <div class="message" *ngIf="greeting">
        {{ greeting }}
      </div>
    </div>
  `,
  styles: [`
    .container {
      max-width: 400px;
      margin: 100px auto;
      text-align: center;
      font-family: Arial, sans-serif;
    }
    h1 {
      color: #333;
    }
    .input-group {
      margin: 20px 0;
    }
    input {
      padding: 10px;
      font-size: 16px;
      border: 1px solid #ccc;
      border-radius: 4px;
      margin-right: 10px;
    }
    button {
      padding: 10px 20px;
      font-size: 16px;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover {
      background-color: #0056b3;
    }
    .message {
      margin-top: 20px;
      padding: 20px;
      background-color: #e7f3ff;
      border-radius: 8px;
      font-size: 24px;
      color: #333;
    }
  `]
})
export class AppComponent {
  name = '';
  greeting = '';

  constructor(private http: HttpClient) {}

  getGreeting() {
    const param = this.name ? `?name=${this.name}` : '';
    this.http.get<{ message: string }>(`http://72.24.191.23/:8080/api/greeting${param}`)
      .subscribe({
        next: (response) => this.greeting = response.message,
        error: (err) => this.greeting = 'Error connecting to backend'
      });
  }
}
