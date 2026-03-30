package com.example.demo.service;

import com.example.demo.model.UserProfile;
import com.example.demo.repository.UserProfileRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Service
public class UserProfileService {

    @Autowired
    private UserProfileRepository repository;

    public Map<String, Object> getOrCreate(String username) {
        String key = normalize(username, "username").toLowerCase();
        UserProfile profile = repository.findByUsername(key).orElseGet(() ->
                repository.save(new UserProfile(
                        key,
                        key,
                        "en",
                        "UTC",
                        "dark",
                        LocalDateTime.now(),
                        LocalDateTime.now()
                ))
        );
        return toMap(profile);
    }

    public Map<String, Object> update(String username, String displayName, String preferredLanguage, String timezone, String theme) {
        String key = normalize(username, "username").toLowerCase();
        UserProfile profile = repository.findByUsername(key).orElseGet(() ->
                new UserProfile(key, key, "en", "UTC", "dark", LocalDateTime.now(), LocalDateTime.now())
        );

        profile.setDisplayName(normalize(displayName, "displayName"));
        profile.setPreferredLanguage(normalize(preferredLanguage, "preferredLanguage"));
        profile.setTimezone(normalize(timezone, "timezone"));

        String t = normalize(theme, "theme").toLowerCase();
        if (!t.equals("dark") && !t.equals("light")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "theme must be dark or light");
        }
        profile.setTheme(t);
        profile.setUpdatedAt(LocalDateTime.now());

        return toMap(repository.save(profile));
    }

    private String normalize(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " is required");
        }
        return value.trim();
    }

    private Map<String, Object> toMap(UserProfile profile) {
        Map<String, Object> map = new HashMap<>();
        map.put("username", profile.getUsername());
        map.put("displayName", profile.getDisplayName());
        map.put("preferredLanguage", profile.getPreferredLanguage());
        map.put("timezone", profile.getTimezone());
        map.put("theme", profile.getTheme());
        map.put("updatedAt", profile.getUpdatedAt().toString());
        return map;
    }
}
