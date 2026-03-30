package com.example.demo.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "board_comments")
public class BoardComment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "author_name", nullable = false)
    private String authorName;

    @Column(nullable = false, length = 4000)
    private String content;

    @Column(name = "mentions_csv", length = 1000)
    private String mentionsCsv;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public BoardComment() {}

    public BoardComment(Board board, String authorName, String content, String mentionsCsv, LocalDateTime createdAt) {
        this.board = board;
        this.authorName = authorName;
        this.content = content;
        this.mentionsCsv = mentionsCsv;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public Board getBoard() { return board; }
    public void setBoard(Board board) { this.board = board; }
    public String getAuthorName() { return authorName; }
    public void setAuthorName(String authorName) { this.authorName = authorName; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getMentionsCsv() { return mentionsCsv; }
    public void setMentionsCsv(String mentionsCsv) { this.mentionsCsv = mentionsCsv; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
