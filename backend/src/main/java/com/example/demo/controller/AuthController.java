package com.example.demo.controller;

import com.example.demo.service.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@CrossOrigin(origins = {"http://172.24.191.230:4200","http://172.24.191.221:4200","http://172.24.187.57:4200"})
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    @PostMapping("/register")
    public Map<String, Object> register(
            @RequestParam String username,
            @RequestParam String password,
            @RequestParam String displayName,
            @RequestParam(defaultValue = "en") String preferredLanguage,
            @RequestParam(defaultValue = "UTC") String timezone,
            @RequestParam(defaultValue = "dark") String theme
    ) {
        return authService.register(username, password, displayName, preferredLanguage, timezone, theme);
    }

    @PostMapping("/login")
    public Map<String, Object> login(
            @RequestParam String username,
            @RequestParam String password
    ) {
        return authService.login(username, password);
    }
}
