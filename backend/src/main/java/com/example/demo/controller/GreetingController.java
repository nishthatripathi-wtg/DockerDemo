package com.example.demo.controller;

import com.example.demo.service.UserProfileService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.List;
import java.util.Map;

@EnableAutoConfiguration
@RestController
@CrossOrigin(origins = {"http://172.24.191.230:4200","http://172.24.191.221:4200","http://172.24.187.57:4200"})
public class GreetingController {

    private static final Logger log = LoggerFactory.getLogger(GreetingController.class);

    @Autowired
    private UserProfileService userProfileService;

    @Autowired
    private DataSource dataSource;

    @GetMapping("/api/greeting/languages")
    public List<Map<String, String>> languages() {
        return List.of(
                Map.of("code", "en", "name", "English"),
                Map.of("code", "es", "name", "Español"),
                Map.of("code", "fr", "name", "Français"),
                Map.of("code", "de", "name", "Deutsch"),
                Map.of("code", "hi", "name", "हिन्दी"),
                Map.of("code", "pt", "name", "Português"),
                Map.of("code", "ja", "name", "日本語"),
                Map.of("code", "ar", "name", "العربية")
        );
    }

    @GetMapping("/api/profile")
    public Map<String, Object> profile(@RequestParam String username) {
        log.info("Profile fetch [username={}]", username);
        return userProfileService.getOrCreate(username);
    }

    @PostMapping("/api/profile")
    public Map<String, Object> updateProfile(
            @RequestParam String username,
            @RequestParam String displayName,
            @RequestParam String preferredLanguage,
            @RequestParam String timezone,
            @RequestParam String theme) {
        log.info("Profile update [username={} language={} theme={}]", username, preferredLanguage, theme);
        return userProfileService.update(username, displayName, preferredLanguage, timezone, theme);
    }

    @GetMapping("/db")
    public ResponseEntity<String> checkDb() {
        try (Connection c = dataSource.getConnection()) {
            String url = c.getMetaData().getURL();
            return ResponseEntity.ok("Connected: " + url);
        } catch (Exception e) {
            log.error("DB health check failed", e);
            return ResponseEntity.status(500).body("DB connection failed: " + e.getMessage());
        }
    }
}
