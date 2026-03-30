package com.example.demo.service;

import com.example.demo.model.GreetingRecord;
import com.example.demo.repository.GreetingRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;

@Service
public class GreetingService {

    @Autowired
    private GreetingRepository repository;

    // Each entry: [morning, afternoon, evening, night]
    private static final Map<String, String[]> GREETINGS = new LinkedHashMap<>();

    static {
        GREETINGS.put("en", new String[]{"Good morning",     "Good afternoon",   "Good evening",     "Good night"});
        GREETINGS.put("es", new String[]{"Buenos días",      "Buenas tardes",    "Buenas tardes",    "Buenas noches"});
        GREETINGS.put("fr", new String[]{"Bonjour",          "Bon après-midi",   "Bonsoir",          "Bonne nuit"});
        GREETINGS.put("de", new String[]{"Guten Morgen",     "Guten Tag",        "Guten Abend",      "Gute Nacht"});
        GREETINGS.put("hi", new String[]{"शुभ प्रभात",       "नमस्कार",          "शुभ संध्या",       "शुभ रात्रि"});
        GREETINGS.put("pt", new String[]{"Bom dia",          "Boa tarde",        "Boa tarde",        "Boa noite"});
        GREETINGS.put("ja", new String[]{"おはようございます", "こんにちは",       "こんばんは",       "おやすみなさい"});
        GREETINGS.put("ar", new String[]{"صباح الخير",       "مساء الخير",       "مساء الخير",       "تصبح على خير"});
    }

    private static final Map<String, String> LANGUAGE_NAMES = new LinkedHashMap<>();

    static {
        LANGUAGE_NAMES.put("en", "English");
        LANGUAGE_NAMES.put("es", "Español");
        LANGUAGE_NAMES.put("fr", "Français");
        LANGUAGE_NAMES.put("de", "Deutsch");
        LANGUAGE_NAMES.put("hi", "हिन्दी");
        LANGUAGE_NAMES.put("pt", "Português");
        LANGUAGE_NAMES.put("ja", "日本語");
        LANGUAGE_NAMES.put("ar", "العربية");
    }

    private int getTimeIndex() {
        int hour = LocalTime.now().getHour();
        if (hour >= 5 && hour < 12) return 0;
        if (hour >= 12 && hour < 18) return 1;
        if (hour >= 18 && hour < 22) return 2;
        return 3;
    }

    private String getTimeOfDayLabel() {
        return new String[]{"morning", "afternoon", "evening", "night"}[getTimeIndex()];
    }

    public Map<String, Object> greet(String name, String lang) {
        String[] phrases = GREETINGS.getOrDefault(lang, GREETINGS.get("en"));
        String message = phrases[getTimeIndex()] + ", " + name + "!";

        repository.save(new GreetingRecord(name, lang, message, LocalDateTime.now()));

        Map<String, Object> response = new HashMap<>();
        response.put("message", message);
        response.put("language", lang);
        response.put("timeOfDay", getTimeOfDayLabel());
        return response;
    }

    public List<Map<String, Object>> getHistory() {
        List<Map<String, Object>> history = new ArrayList<>();
        for (GreetingRecord r : repository.findTop20ByOrderByCreatedAtDesc()) {
            Map<String, Object> item = new HashMap<>();
            item.put("name", r.getName());
            item.put("language", r.getLanguage());
            item.put("message", r.getMessage());
            item.put("timestamp", r.getCreatedAt().toString());
            history.add(item);
        }
        return history;
    }

    public Map<String, Object> getStats() {
        List<Map<String, Object>> topNames = new ArrayList<>();
        for (Object[] row : repository.findTopNames(PageRequest.of(0, 5))) {
            Map<String, Object> item = new HashMap<>();
            item.put("name", row[0]);
            item.put("count", row[1]);
            topNames.add(item);
        }
        Map<String, Object> stats = new HashMap<>();
        stats.put("total", repository.count());
        stats.put("topNames", topNames);
        return stats;
    }

    public void clearHistory() {
        repository.deleteAll();
    }

    public List<Map<String, String>> getSupportedLanguages() {
        List<Map<String, String>> result = new ArrayList<>();
        for (Map.Entry<String, String> entry : LANGUAGE_NAMES.entrySet()) {
            Map<String, String> lang = new HashMap<>();
            lang.put("code", entry.getKey());
            lang.put("name", entry.getValue());
            result.add(lang);
        }
        return result;
    }
}
