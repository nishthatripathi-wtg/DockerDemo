package com.example.demo.service;

import com.example.demo.model.UserAccount;
import com.example.demo.repository.UserAccountRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Service
public class AuthService {

    @Autowired
    private UserAccountRepository userAccountRepository;

    @Autowired
    private UserProfileService userProfileService;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public Map<String, Object> register(
            String username,
            String password,
            String displayName,
            String preferredLanguage,
            String timezone,
            String theme
    ) {
        String normalizedUsername = normalize(username, "username").toLowerCase();
        String rawPassword = normalize(password, "password");
        if (rawPassword.length() < 6) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "password must be at least 6 characters");
        }

        if (userAccountRepository.findByUsername(normalizedUsername).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "username already exists");
        }

        UserAccount account = new UserAccount(
                normalizedUsername,
                passwordEncoder.encode(rawPassword),
                LocalDateTime.now()
        );
        account.setLastLoginAt(LocalDateTime.now());
        userAccountRepository.save(account);

        Map<String, Object> profile = userProfileService.update(
                normalizedUsername,
                normalize(displayName, "displayName"),
                normalize(preferredLanguage, "preferredLanguage"),
                normalize(timezone, "timezone"),
                normalize(theme, "theme")
        );

        Map<String, Object> response = new HashMap<>();
        response.put("username", normalizedUsername);
        response.put("message", "registered");
        response.put("profile", profile);
        return response;
    }

    public Map<String, Object> login(String username, String password) {
        String normalizedUsername = normalize(username, "username").toLowerCase();
        String rawPassword = normalize(password, "password");

        UserAccount account = userAccountRepository.findByUsername(normalizedUsername)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid credentials"));

        if (!passwordEncoder.matches(rawPassword, account.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid credentials");
        }

        account.setLastLoginAt(LocalDateTime.now());
        userAccountRepository.save(account);

        Map<String, Object> response = new HashMap<>();
        response.put("username", normalizedUsername);
        response.put("message", "logged_in");
        response.put("profile", userProfileService.getOrCreate(normalizedUsername));
        return response;
    }

    private String normalize(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " is required");
        }
        return value.trim();
    }
}
