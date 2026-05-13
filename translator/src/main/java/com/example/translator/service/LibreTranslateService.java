package com.example.translator.service;

import com.example.translator.dto.TranslateResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Service
public class LibreTranslateService {

    private static final Logger log = LoggerFactory.getLogger(LibreTranslateService.class);

    private final RestTemplate restTemplate;
    private final String libreTranslateUrl;

    private static final Map<String, Map<String, String>> DICTIONARY = Map.of(
        "es", Map.of("hello", "hola", "goodbye", "adiós", "thank you", "gracias", "good morning", "buenos días", "how are you", "cómo estás"),
        "fr", Map.of("hello", "bonjour", "goodbye", "au revoir", "thank you", "merci", "good morning", "bonjour", "how are you", "comment allez-vous"),
        "de", Map.of("hello", "hallo", "goodbye", "auf wiedersehen", "thank you", "danke", "good morning", "guten morgen", "how are you", "wie geht es ihnen"),
        "hi", Map.of("hello", "नमस्ते", "goodbye", "अलविदा", "thank you", "धन्यवाद", "good morning", "सुप्रभात", "how are you", "आप कैसे हैं"),
        "pt", Map.of("hello", "olá", "goodbye", "adeus", "thank you", "obrigado", "good morning", "bom dia", "how are you", "como vai você"),
        "ja", Map.of("hello", "こんにちは", "goodbye", "さようなら", "thank you", "ありがとう", "good morning", "おはよう", "how are you", "お元気ですか"),
        "ar", Map.of("hello", "مرحبا", "goodbye", "مع السلامة", "thank you", "شكرا", "good morning", "صباح الخير", "how are you", "كيف حالك")
    );

    public LibreTranslateService(
            @Value("${translator.libretranslate.url}") String libreTranslateUrl) {
        this.restTemplate = new RestTemplate();
        this.libreTranslateUrl = libreTranslateUrl;
    }

    public TranslateResponse translate(String text, String source, String target) {
        log.info("Translating '{}' from {} to {} via {}", text, source, target, libreTranslateUrl);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, String> body = Map.of(
                "q", text,
                "source", source,
                "target", target,
                "format", "text"
        );

        HttpEntity<Map<String, String>> request = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    libreTranslateUrl,
                    HttpMethod.POST,
                    request,
                    Map.class
            );

            String translatedText = (String) response.getBody().get("translatedText");
            log.info("Translation result: '{}'", translatedText);
            return new TranslateResponse(translatedText, source, target);

        } catch (Exception e) {
            log.warn("LibreTranslate failed, using mock: {}", e.getMessage());
            String mock = mockTranslate(text, target);
            log.info("Mock translation result: '{}'", mock);
            return new TranslateResponse(mock, source, target);
        }
    }

    private String mockTranslate(String text, String target) {
        Map<String, String> langDict = DICTIONARY.getOrDefault(target, Map.of());
        String lower = text.toLowerCase().trim();
        // Strip trailing punctuation for lookup
        String stripped = lower.replaceAll("[!.,?]+$", "");
        for (Map.Entry<String, String> entry : langDict.entrySet()) {
            if (stripped.contains(entry.getKey())) {
                return text.toLowerCase().replace(entry.getKey(), entry.getValue());
            }
        }
        return "[" + target + "] " + text;
    }
}
