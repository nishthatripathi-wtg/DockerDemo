package com.example.demo.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "user_messages")
public class UserMessage {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "sender_username", nullable = false)
    private String senderUsername;

    @Column(name = "recipient_username", nullable = false)
    private String recipientUsername;

    @Column(nullable = false, length = 4000)
    private String content;

    @Column(nullable = false)
    private String language;

    @Column(name = "translated_content", length = 4000)
    private String translatedContent;

    @Column(name = "translated_language")
    private String translatedLanguage;

    @Column(name = "parent_message_id")
    private Long parentMessageId;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public UserMessage() {}

    public UserMessage(String senderUsername, String recipientUsername, String content, String language, Long parentMessageId, LocalDateTime createdAt) {
        this.senderUsername = senderUsername;
        this.recipientUsername = recipientUsername;
        this.content = content;
        this.language = language;
        this.parentMessageId = parentMessageId;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public String getSenderUsername() { return senderUsername; }
    public void setSenderUsername(String senderUsername) { this.senderUsername = senderUsername; }
    public String getRecipientUsername() { return recipientUsername; }
    public void setRecipientUsername(String recipientUsername) { this.recipientUsername = recipientUsername; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public String getTranslatedContent() { return translatedContent; }
    public void setTranslatedContent(String translatedContent) { this.translatedContent = translatedContent; }
    public String getTranslatedLanguage() { return translatedLanguage; }
    public void setTranslatedLanguage(String translatedLanguage) { this.translatedLanguage = translatedLanguage; }
    public Long getParentMessageId() { return parentMessageId; }
    public void setParentMessageId(Long parentMessageId) { this.parentMessageId = parentMessageId; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
