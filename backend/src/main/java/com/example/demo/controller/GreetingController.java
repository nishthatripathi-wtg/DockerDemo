package com.example.demo.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.Map;

@EnableAutoConfiguration
@RestController
@CrossOrigin(origins = "http://localhost:4200")
public class GreetingController {

    @Autowired
    private DataSource dataSource;

    @GetMapping("/api/greeting1")
    public Map<String, String> greeting(@RequestParam(defaultValue = "World") String name) {
        System.out.println("Called by : "+name);
        return Map.of("message", "Hello, " + name + "!");
    }

    @GetMapping("/db1")
    public ResponseEntity<String> checkDb() {
        try (Connection c = dataSource.getConnection()) {
            String url = c.getMetaData().getURL();
            return ResponseEntity.ok("Connected: " + url);
        } catch (Exception e) {
            return ResponseEntity.status(500).body("DB connection failed: " + e.getMessage());
        }
    }
}
