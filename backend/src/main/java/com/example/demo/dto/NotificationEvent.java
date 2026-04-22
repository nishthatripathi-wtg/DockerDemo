package com.example.demo.dto;

import java.time.LocalDateTime;

public class NotificationEvent {

    private String event;
    private String sender;
    private String recipient;
    private Long messageId;
    private String content;
    private String language;
    private LocalDateTime timestamp;

    // Enriched by NotificationRoute
    private String recipientDisplayName;
    private String recipientPreferredLanguage;

    public NotificationEvent() {}

    public NotificationEvent(String event, String sender, String recipient, Long messageId,
                             String content, String language, LocalDateTime timestamp) {
        this.event = event;
        this.sender = sender;
        this.recipient = recipient;
        this.messageId = messageId;
        this.content = content;
        this.language = language;
        this.timestamp = timestamp;
    }

    public String getEvent() { return event; }
    public void setEvent(String event) { this.event = event; }
    public String getSender() { return sender; }
    public void setSender(String sender) { this.sender = sender; }
    public String getRecipient() { return recipient; }
    public void setRecipient(String recipient) { this.recipient = recipient; }
    public Long getMessageId() { return messageId; }
    public void setMessageId(Long messageId) { this.messageId = messageId; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
    public String getRecipientDisplayName() { return recipientDisplayName; }
    public void setRecipientDisplayName(String recipientDisplayName) { this.recipientDisplayName = recipientDisplayName; }
    public String getRecipientPreferredLanguage() { return recipientPreferredLanguage; }
    public void setRecipientPreferredLanguage(String recipientPreferredLanguage) { this.recipientPreferredLanguage = recipientPreferredLanguage; }
}
