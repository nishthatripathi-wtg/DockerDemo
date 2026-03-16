package com.example.demo.controller;

import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@CrossOrigin(origins = "http://localhost:4200")
public class GreetingController {

    @Autowired
    private DataSource dataSource;

    @GetMapping("/api/greeting")
    public Map<String, String> greeting(@RequestParam(defaultValue = "World") String name) {
        System.out.println("Called by : "+name);
        return Map.of("message", "Hello, " + name + "!");
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
