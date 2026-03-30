package com.example.demo.service;

import com.example.demo.model.UserMessage;
import com.example.demo.repository.UserAccountRepository;
import com.example.demo.repository.UserMessageRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.*;

@Service
public class MessageBoardService {

    @Autowired
    private UserMessageRepository messageRepository;

    @Autowired
    private UserAccountRepository userAccountRepository;

    private static final Map<String, String> LANGUAGE_NAMES = Map.of(
            "en", "English",
            "es", "Spanish",
            "fr", "French",
            "de", "German",
            "hi", "Hindi",
            "pt", "Portuguese",
            "ja", "Japanese",
            "ar", "Arabic"
    );

    public Map<String, Object> send(String sender, String recipient, String content, String language) {
        String senderName = normalizeUsername(sender, "sender");
        String recipientName = normalizeUsername(recipient, "recipient");
        String text = normalize(content, "content");
        String lang = normalizeLanguage(language);

        if (senderName.equals(recipientName)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "sender and recipient must be different");
        }

        UserMessage message = messageRepository.save(
                new UserMessage(senderName, recipientName, text, lang, null, LocalDateTime.now())
        );
        return toMap(message);
    }

    public Map<String, Object> reply(Long messageId, String sender, String content, String language) {
        UserMessage parent = messageRepository.findById(messageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "message not found"));

        String senderName = normalizeUsername(sender, "sender");
        if (!senderName.equals(parent.getSenderUsername()) && !senderName.equals(parent.getRecipientUsername())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "sender is not part of selected message");
        }
        String replyTo = senderName.equals(parent.getSenderUsername()) ? parent.getRecipientUsername() : parent.getSenderUsername();
        String text = normalize(content, "content");
        String lang = normalizeLanguage(language);

        UserMessage reply = messageRepository.save(
                new UserMessage(senderName, replyTo, text, lang, parent.getId(), LocalDateTime.now())
        );
        return toMap(reply);
    }

    public Map<String, Object> translate(Long messageId, String targetLanguage) {
        UserMessage message = messageRepository.findById(messageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "message not found"));

        String target = normalizeLanguage(targetLanguage);
        if (target.equals(message.getLanguage())) {
            message.setTranslatedContent(message.getContent());
        } else {
            message.setTranslatedContent(fakeTranslate(message.getContent(), target));
        }
        message.setTranslatedLanguage(target);

        return toMap(messageRepository.save(message));
    }

    public Map<String, Object> translateForUser(Long messageId, String username, String targetLanguage) {
        String user = normalizeUsername(username, "username");
        UserMessage message = messageRepository.findById(messageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "message not found"));
        if (!user.equals(message.getRecipientUsername())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "can only translate messages sent by others");
        }
        return translate(messageId, targetLanguage);
    }

    public List<Map<String, Object>> inbox(String username) {
        String user = normalizeUsername(username, "username");
        List<Map<String, Object>> items = new ArrayList<>();
        for (UserMessage m : messageRepository.findByRecipientUsernameOrderByCreatedAtDesc(user)) {
            items.add(toMap(m));
        }
        return items;
    }

    public List<Map<String, Object>> conversations(String username) {
        String user = normalizeUsername(username, "username");
        Map<String, UserMessage> latestByCounterpart = new HashMap<>();
        for (UserMessage m : messageRepository.findByRecipientUsernameOrSenderUsernameOrderByCreatedAtDesc(user, user)) {
            String counterpart = counterpart(user, m);
            if (!latestByCounterpart.containsKey(counterpart)) {
                latestByCounterpart.put(counterpart, m);
            }
        }
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map.Entry<String, UserMessage> e : latestByCounterpart.entrySet()) {
            UserMessage m = e.getValue();
            Map<String, Object> row = new HashMap<>();
            row.put("username", e.getKey());
            row.put("latestMessageId", m.getId());
            row.put("latestAt", m.getCreatedAt().toString());
            row.put("latestContent", m.getTranslatedContent() != null ? m.getTranslatedContent() : m.getContent());
            row.put("latestDirection", user.equals(m.getRecipientUsername()) ? "inbound" : "outbound");
            items.add(row);
        }
        items.sort((a, b) -> String.valueOf(b.get("latestAt")).compareTo(String.valueOf(a.get("latestAt"))));
        return items;
    }

    public List<Map<String, Object>> thread(String username, String counterpartUsername) {
        String user = normalizeUsername(username, "username");
        String counterpart = normalizeUsername(counterpartUsername, "counterpart");
        if (user.equals(counterpart)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "counterpart must be different");
        }
        List<Map<String, Object>> items = new ArrayList<>();
        for (UserMessage m : messageRepository.findConversation(user, counterpart)) {
            Map<String, Object> row = toMap(m);
            row.put("direction", user.equals(m.getRecipientUsername()) ? "inbound" : "outbound");
            items.add(row);
        }
        return items;
    }

    public List<Map<String, Object>> history(String username) {
        String user = normalizeUsername(username, "username");
        List<Map<String, Object>> items = new ArrayList<>();
        for (UserMessage m : messageRepository.findByRecipientUsernameOrSenderUsernameOrderByCreatedAtDesc(user, user)) {
            Map<String, Object> row = new HashMap<>();
            row.put("messageId", m.getId());
            row.put("from", m.getSenderUsername());
            row.put("to", m.getRecipientUsername());
            row.put("at", m.getCreatedAt().toString());
            row.put("content", m.getContent());
            row.put("direction", user.equals(m.getRecipientUsername()) ? "inbound" : "outbound");
            items.add(row);
        }
        return items;
    }

    private String fakeTranslate(String text, String targetLanguage) {
        String languageName = LANGUAGE_NAMES.getOrDefault(targetLanguage, targetLanguage);
        return "[" + languageName + "] " + text;
    }

    private String counterpart(String user, UserMessage message) {
        return user.equals(message.getSenderUsername()) ? message.getRecipientUsername() : message.getSenderUsername();
    }

    private String normalize(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " is required");
        }
        return value.trim();
    }

    private String normalizeUsername(String value, String field) {
        String normalized = normalize(value, field).toLowerCase();
        if (userAccountRepository.findByUsername(normalized).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, field + " user not found");
        }
        return normalized;
    }

    private String normalizeLanguage(String value) {
        String lang = normalize(value, "language").toLowerCase();
        if (!LANGUAGE_NAMES.containsKey(lang)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unsupported language");
        }
        return lang;
    }

    private Map<String, Object> toMap(UserMessage m) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", m.getId());
        map.put("sender", m.getSenderUsername());
        map.put("recipient", m.getRecipientUsername());
        map.put("content", m.getContent());
        map.put("language", m.getLanguage());
        map.put("translatedContent", m.getTranslatedContent());
        map.put("translatedLanguage", m.getTranslatedLanguage());
        map.put("parentMessageId", m.getParentMessageId());
        map.put("createdAt", m.getCreatedAt().toString());
        return map;
    }
}
