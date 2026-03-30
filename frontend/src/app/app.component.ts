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

interface Team {
  id: number;
  name: string;
  createdAt: string;
}

interface Board {
  id: number;
  teamId: number;
  title: string;
  description: string;
  owner: string;
  createdAt: string;
}

interface BoardComment {
  id: number;
  boardId: number;
  author: string;
  content: string;
  mentions: string[];
  createdAt: string;
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
        <div class="card greet-card">
          <div class="input-row">
            <input type="text" [(ngModel)]="name" placeholder="Enter your name" (keyup.enter)="getGreeting()" />
            <select [(ngModel)]="selectedLang">
              <option *ngFor="let lang of languages" [value]="lang.code">{{ lang.name }}</option>
            </select>
            <button (click)="getGreeting()" [disabled]="loading">{{ loading ? '...' : 'Say Hello' }}</button>
          </div>
          <div class="greeting-display" *ngIf="greeting"><span class="greeting-text">{{ greeting }}</span></div>
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

        <div class="card collaboration-card">
          <h2>🤝 Collaboration</h2>

          <div class="section">
            <h3>Teams</h3>
            <div class="input-row">
              <input type="text" [(ngModel)]="newTeamName" placeholder="Create team (e.g. Platform)" (keyup.enter)="createTeam()" />
              <button (click)="createTeam()">Add Team</button>
            </div>
            <div class="chip-row" *ngIf="teams.length > 0">
              <button class="chip" *ngFor="let t of teams" [class.active-chip]="selectedTeamId===t.id" (click)="selectTeam(t.id)">{{ t.name }}</button>
            </div>
            <div class="empty" *ngIf="teams.length===0">No teams yet.</div>
          </div>

          <div class="section" *ngIf="selectedTeamId">
            <h3>Shared Boards</h3>
            <div class="input-row">
              <input type="text" [(ngModel)]="newBoardTitle" placeholder="Board title" />
              <input type="text" [(ngModel)]="newBoardOwner" placeholder="Owner" />
              <button (click)="createBoard()">Create Board</button>
            </div>
            <textarea [(ngModel)]="newBoardDescription" placeholder="Board description" rows="2"></textarea>

            <div class="board-list" *ngIf="boards.length > 0">
              <div class="board-item" *ngFor="let b of boards" [class.active-board]="selectedBoardId===b.id" (click)="selectBoard(b.id)">
                <div><strong>{{ b.title }}</strong> · {{ b.owner }}</div>
                <small>{{ b.description }}</small>
              </div>
            </div>
            <div class="empty" *ngIf="boards.length===0">No boards for this team.</div>
          </div>

          <div class="section" *ngIf="selectedBoardId">
            <h3>Comments & Mentions</h3>
            <div class="input-row">
              <input type="text" [(ngModel)]="newCommentAuthor" placeholder="Author" />
              <input type="text" [(ngModel)]="newCommentText" placeholder="Comment (use @name mentions)" (keyup.enter)="addComment()" />
              <button (click)="addComment()">Post</button>
            </div>

            <div class="mention-row" *ngIf="mentionStats.length > 0">
              <span class="pill" *ngFor="let m of mentionStats">@{{ m.user }} <strong>×{{ m.count }}</strong></span>
            </div>

            <ul class="history-list" *ngIf="comments.length > 0">
              <li *ngFor="let c of comments">
                <div class="comment-line"><strong>{{ c.author }}:</strong> <span [innerHTML]="highlightMentions(c.content)"></span></div>
                <span class="history-meta">{{ formatTime(c.createdAt) }}</span>
              </li>
            </ul>
            <div class="empty" *ngIf="comments.length===0">No comments yet.</div>
          </div>
        </div>
      </main>
    </div>
  `,
  styles: [`
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .page { min-height: 100vh; background: linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%); font-family: 'Segoe UI', Arial, sans-serif; color: #eee; padding: 0 16px 40px; }
    header { text-align: center; padding: 40px 0 24px; }
    .header-icon { font-size: 48px; display: block; margin-bottom: 8px; }
    h1 { font-size: 2rem; font-weight: 700; color: #fff; }
    .subtitle { display: inline-block; margin-top: 6px; font-size: .9rem; color: #a0aec0; text-transform: capitalize; }
    main { max-width: 780px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
    .card { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 24px; backdrop-filter: blur(8px); }
    .input-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
    input, select, textarea { flex: 1; min-width: 140px; padding: 10px 12px; border: 1px solid rgba(255,255,255,.2); border-radius: 10px; background: rgba(255,255,255,.08); color: #fff; font-size: 14px; outline: none; }
    input::placeholder, textarea::placeholder { color: #718096; }
    select option { background:#1a1a2e; color:#fff; }
    button { padding: 10px 18px; background: linear-gradient(135deg,#667eea,#764ba2); color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .greeting-display { margin-top: 12px; padding: 16px; background: rgba(99,179,237,.12); border: 1px solid rgba(99,179,237,.3); border-radius: 12px; text-align: center; }
    .greeting-text { font-size: 1.4rem; font-weight: 600; color: #bee3f8; }
    .error { margin-top: 10px; color: #fc8181; font-size: 13px; }
    .stats-card h2, .history-card h2, .collaboration-card h2 { font-size: 1rem; margin-bottom: 12px; color: #a0aec0; }
    .stats-row { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
    .stat-number { font-size: 2.2rem; font-weight: 700; color: #68d391; line-height: 1; }
    .stat-label { font-size: .75rem; color: #718096; margin-top: 4px; display:block; }
    .name-pills, .mention-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .pill { padding: 4px 10px; background: rgba(102,126,234,.25); border: 1px solid rgba(102,126,234,.4); border-radius: 20px; font-size: 12px; color: #c3dafe; }
    .pill strong { color: #fff; }
    .history-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .clear-btn { padding: 6px 12px; font-size: 12px; background: rgba(252,129,129,.15); border: 1px solid rgba(252,129,129,.4); color: #fc8181; border-radius: 8px; }
    .empty { color: #718096; font-size: 13px; padding: 8px 0; }
    .history-list { list-style: none; display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
    .history-list li { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(255,255,255,.04); border-radius: 10px; gap: 10px; flex-wrap: wrap; }
    .history-msg { font-size: 14px; color: #e2e8f0; }
    .history-meta { font-size: 11px; color: #718096; white-space: nowrap; }
    .section { margin-top: 14px; padding-top: 12px; border-top: 1px dashed rgba(255,255,255,.12); }
    .section h3 { margin-bottom: 8px; color: #c3dafe; font-size: .9rem; }
    .chip-row { display:flex; gap:8px; flex-wrap: wrap; margin-top: 8px; }
    .chip { background: rgba(99,179,237,.18); border:1px solid rgba(99,179,237,.4); }
    .active-chip { background: rgba(104,211,145,.25); border-color: rgba(104,211,145,.6); }
    .board-list { display:flex; flex-direction:column; gap:8px; margin-top: 8px; }
    .board-item { padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.03); cursor:pointer; }
    .board-item small { color:#9fb3d1; }
    .active-board { border-color: rgba(104,211,145,.7); background: rgba(104,211,145,.12); }
    .comment-line { color: #e2e8f0; }
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

  newTeamName = '';
  teams: Team[] = [];
  selectedTeamId: number | null = null;

  newBoardTitle = '';
  newBoardDescription = '';
  newBoardOwner = '';
  boards: Board[] = [];
  selectedBoardId: number | null = null;

  newCommentAuthor = '';
  newCommentText = '';
  comments: BoardComment[] = [];
  mentionStats: { user: string; count: number }[] = [];

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.setTimeContext();
    this.loadLanguages();
    this.loadHistory();
    this.loadStats();
    this.loadTeams();
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

  loadTeams() {
    this.http.get<Team[]>('/api/collab/teams').subscribe({
      next: (teams) => {
        this.teams = teams;
        if (!this.selectedTeamId && teams.length > 0) {
          this.selectTeam(teams[0].id);
        }
      },
      error: () => {}
    });
  }

  createTeam() {
    const name = this.newTeamName.trim();
    if (!name) return;
    this.http.post<Team>(`/api/collab/teams?name=${encodeURIComponent(name)}`, {}).subscribe({
      next: (team) => {
        this.newTeamName = '';
        this.loadTeams();
        this.selectTeam(team.id);
      },
      error: () => {}
    });
  }

  selectTeam(teamId: number) {
    this.selectedTeamId = teamId;
    this.selectedBoardId = null;
    this.comments = [];
    this.mentionStats = [];
    this.loadBoards();
  }

  loadBoards() {
    if (!this.selectedTeamId) return;
    this.http.get<Board[]>(`/api/collab/boards?teamId=${this.selectedTeamId}`).subscribe({
      next: (boards) => {
        this.boards = boards;
        if (boards.length > 0) {
          this.selectBoard(boards[0].id);
        }
      },
      error: () => {}
    });
  }

  createBoard() {
    if (!this.selectedTeamId) return;
    const title = this.newBoardTitle.trim();
    if (!title) return;
    const owner = (this.newBoardOwner || 'Anonymous').trim();
    const description = this.newBoardDescription.trim();
    const url = `/api/collab/boards?teamId=${this.selectedTeamId}&title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}&owner=${encodeURIComponent(owner)}`;
    this.http.post<Board>(url, {}).subscribe({
      next: () => {
        this.newBoardTitle = '';
        this.newBoardDescription = '';
        this.newBoardOwner = '';
        this.loadBoards();
      },
      error: () => {}
    });
  }

  selectBoard(boardId: number) {
    this.selectedBoardId = boardId;
    this.loadComments();
    this.loadMentionStats();
  }

  addComment() {
    if (!this.selectedBoardId) return;
    const content = this.newCommentText.trim();
    if (!content) return;
    const author = (this.newCommentAuthor || 'Anonymous').trim();
    const url = `/api/collab/comments?boardId=${this.selectedBoardId}&author=${encodeURIComponent(author)}&content=${encodeURIComponent(content)}`;
    this.http.post<BoardComment>(url, {}).subscribe({
      next: () => {
        this.newCommentText = '';
        this.loadComments();
        this.loadMentionStats();
      },
      error: () => {}
    });
  }

  loadComments() {
    if (!this.selectedBoardId) return;
    this.http.get<BoardComment[]>(`/api/collab/comments?boardId=${this.selectedBoardId}`).subscribe({
      next: (comments) => this.comments = comments,
      error: () => {}
    });
  }

  loadMentionStats() {
    if (!this.selectedBoardId) return;
    this.http.get<{ user: string; count: number }[]>(`/api/collab/mentions?boardId=${this.selectedBoardId}`).subscribe({
      next: (stats) => this.mentionStats = stats,
      error: () => {}
    });
  }

  highlightMentions(text: string): string {
    return text.replace(
      /@([A-Za-z0-9._-]+)/g,
      '<span style="color:#68d391;font-weight:700;">@$1</span>'
    );
  }

  formatTime(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
}
