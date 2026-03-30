package com.example.demo.controller;

import com.example.demo.service.GreetingService;
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

    @Autowired
    private GreetingService greetingService;

    @Autowired
    private DataSource dataSource;

    @GetMapping("/api/greeting")
    public Map<String, Object> greeting(
            @RequestParam(defaultValue = "World") String name,
            @RequestParam(defaultValue = "en") String lang) {
        return greetingService.greet(name, lang);
    }

    @GetMapping("/api/greeting/history")
    public List<Map<String, Object>> history() {
        return greetingService.getHistory();
    }

    @GetMapping("/api/greeting/stats")
    public Map<String, Object> stats() {
        return greetingService.getStats();
    }

    @DeleteMapping("/api/greeting/history")
    public ResponseEntity<Void> clearHistory() {
        greetingService.clearHistory();
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/greeting/languages")
    public List<Map<String, String>> languages() {
        return greetingService.getSupportedLanguages();
    }

    @GetMapping("/db")
    public ResponseEntity<String> checkDb() {
        try (Connection c = dataSource.getConnection()) {
            String url = c.getMetaData().getURL();
            return ResponseEntity.ok("Connected: " + url);
        } catch (Exception e) {
            return ResponseEntity.status(500).body("DB connection failed: " + e.getMessage());
        }
    }
}
