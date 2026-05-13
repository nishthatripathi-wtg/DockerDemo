package com.example.translator.dto;

public class TranslateResponse {
    private String translatedText;
    private String source;
    private String target;

    public TranslateResponse() {}

    public TranslateResponse(String translatedText, String source, String target) {
        this.translatedText = translatedText;
        this.source = source;
        this.target = target;
    }

    public String getTranslatedText() { return translatedText; }
    public void setTranslatedText(String translatedText) { this.translatedText = translatedText; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }

    public String getTarget() { return target; }
    public void setTarget(String target) { this.target = target; }
}
