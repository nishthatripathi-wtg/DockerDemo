package com.example.demo.dto;

public class TranslationRequest {

    private Long messageId;
    private String targetLanguage;
    private String content;
    private String sourceLanguage;

    public TranslationRequest() {}

    public TranslationRequest(Long messageId, String targetLanguage, String content, String sourceLanguage) {
        this.messageId = messageId;
        this.targetLanguage = targetLanguage;
        this.content = content;
        this.sourceLanguage = sourceLanguage;
    }

    public Long getMessageId() { return messageId; }
    public void setMessageId(Long messageId) { this.messageId = messageId; }
    public String getTargetLanguage() { return targetLanguage; }
    public void setTargetLanguage(String targetLanguage) { this.targetLanguage = targetLanguage; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getSourceLanguage() { return sourceLanguage; }
    public void setSourceLanguage(String sourceLanguage) { this.sourceLanguage = sourceLanguage; }
}
