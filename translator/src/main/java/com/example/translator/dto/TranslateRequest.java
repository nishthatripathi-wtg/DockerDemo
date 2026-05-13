package com.example.translator.dto;

public class TranslateRequest {
    private String text;
    private String target;
    private String source = "en";

    public String getText() { return text; }
    public void setText(String text) { this.text = text; }

    public String getTarget() { return target; }
    public void setTarget(String target) { this.target = target; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
}
