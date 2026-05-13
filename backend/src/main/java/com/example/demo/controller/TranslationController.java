package com.example.demo.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@RestController
@RequestMapping("/api/greeting")
public class TranslationController {

    private static final Logger log = LoggerFactory.getLogger(TranslationController.class);

    private final RestTemplate restTemplate;
    private final String translatorUrl;

    public TranslationController(
            RestTemplate restTemplate,
            @Value("${translator.service.url:http://translator_translator:8081}") String translatorUrl) {
        this.restTemplate = restTemplate;
        this.translatorUrl = translatorUrl;
    }

    @PostMapping("/translate")
    public Map<String, Object> translate(@RequestBody Map<String, String> request) {
        String name = request.getOrDefault("name", "World");
        String target = request.getOrDefault("target", "es");

        log.info("Translate request [name={}, target={}]", name, target);

        String textToTranslate = "Hello, " + name + "!";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, String> body = Map.of(
                "text", textToTranslate,
                "source", "en",
                "target", target
        );

        HttpEntity<Map<String, String>> entity = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    translatorUrl + "/api/translate",
                    HttpMethod.POST,
                    entity,
                    Map.class
            );

            String translatedText = (String) response.getBody().get("translatedText");
            log.info("Translation result: '{}'", translatedText);

            return Map.of(
                    "message", textToTranslate,
                    "translated", translatedText,
                    "language", target
            );
        } catch (Exception e) {
            log.error("Translation call failed: {}", e.getMessage());
            return Map.of(
                    "message", textToTranslate,
                    "translated", "[translation unavailable]",
                    "language", target,
                    "error", e.getMessage()
            );
        }
    }
}
