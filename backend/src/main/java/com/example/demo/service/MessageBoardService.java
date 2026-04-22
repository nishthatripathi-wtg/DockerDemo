package com.example.demo.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.demo.dto.NotificationEvent;
import com.example.demo.dto.TranslationRequest;
import com.example.demo.model.UserMessage;
import com.example.demo.repository.UserAccountRepository;
import com.example.demo.repository.UserMessageRepository;
import org.apache.camel.ProducerTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDateTime;
import java.time.Duration;
import java.util.*;

@Service
public class MessageBoardService {

    private static final Logger log = LoggerFactory.getLogger(MessageBoardService.class);

    @Autowired
    private UserMessageRepository messageRepository;

    @Autowired
    private UserAccountRepository userAccountRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ProducerTemplate producerTemplate;

    @Value("${translation.provider.url}")
    private String translationUrl;

    @Value("${translation.provider.api-key:}")
    private String translationApiKey;

    @Value("${translation.provider.timeout-ms:5000}")
    private int translationTimeoutMs;

    private final HttpClient httpClient = HttpClient.newBuilder().build();

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
        log.info("Message sent [from={} to={} language={}]", senderName, recipientName, lang);

        // Fire-and-forget JMS notification to Camel route
        try {
            NotificationEvent event = new NotificationEvent(
                    "message_sent", senderName, recipientName,
                    message.getId(), text, lang, LocalDateTime.now());
            producerTemplate.sendBody("jms:queue:message.notifications",
                    objectMapper.writeValueAsString(event));
        } catch (Exception ex) {
            log.warn("Failed to send JMS notification [messageId={}]: {}", message.getId(), ex.getMessage());
        }

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
        log.info("Reply sent [from={} to={} parentId={} language={}]", senderName, replyTo, parent.getId(), lang);
        return toMap(reply);
    }

    public Map<String, Object> translate(Long messageId, String targetLanguage) {
        UserMessage message = messageRepository.findById(messageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "message not found"));

        String target = normalizeLanguage(targetLanguage);

        // Same-language: skip JMS, update directly
        if (target.equals(message.getLanguage())) {
            message.setTranslatedContent(message.getContent());
            message.setTranslatedLanguage(target);
            log.info("Message translated (same language) [messageId={} targetLanguage={}]", messageId, target);
            return toMap(messageRepository.save(message));
        }

        // Send JMS request-reply to Camel TranslationRoute
        TranslationRequest request = new TranslationRequest(
                messageId, target, message.getContent(), message.getLanguage());
        try {
            String requestJson = objectMapper.writeValueAsString(request);
            String responseJson = producerTemplate.requestBody(
                    "jms:queue:translation.requests?requestTimeout=10000",
                    requestJson, String.class);

            JsonNode responseNode = objectMapper.readTree(responseJson);
            if (responseNode.path("error").asBoolean(false)) {
                String errorMsg = responseNode.path("message").asText("translation failed");
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, errorMsg);
            }

            // Reload the message since Camel route updated it
            message = messageRepository.findById(messageId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "message not found"));
            log.info("Message translated via Camel [messageId={} targetLanguage={}]", messageId, target);
            return toMap(message);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("JMS translation request failed [messageId={} targetLanguage={}]", messageId, target, ex);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "translation request failed: " + ex.getMessage());
        }
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

    /**
     * Called by Camel TranslationRoute — performs the actual translation and updates DB.
     */
    public Map<String, Object> performTranslation(TranslationRequest request) {
        UserMessage message = messageRepository.findById(request.getMessageId())
                .orElseThrow(() -> new RuntimeException("message not found: " + request.getMessageId()));

        String translated = translateWithProvider(
                request.getContent(), request.getSourceLanguage(), request.getTargetLanguage());
        message.setTranslatedContent(translated);
        message.setTranslatedLanguage(request.getTargetLanguage());
        messageRepository.save(message);

        log.info("Camel translation completed [messageId={} from={} to={}]",
                request.getMessageId(), request.getSourceLanguage(), request.getTargetLanguage());

        Map<String, Object> result = new HashMap<>();
        result.put("messageId", request.getMessageId());
        result.put("translatedContent", translated);
        result.put("targetLanguage", request.getTargetLanguage());
        return result;
    }

    private String translateWithProvider(String text, String sourceLanguage, String targetLanguage) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("q", text);
        payload.put("source", sourceLanguage);
        payload.put("target", targetLanguage);
        payload.put("format", "text");
        if (translationApiKey != null && !translationApiKey.trim().isEmpty()) {
            payload.put("api_key", translationApiKey.trim());
        }

        final String body;
        try {
            body = objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "failed to build translation request", ex);
        }

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(translationUrl))
                .timeout(Duration.ofMillis(translationTimeoutMs))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        final HttpResponse<String> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException ex) {
            log.error("Translation provider request failed [url={} source={} target={}]", translationUrl, sourceLanguage, targetLanguage, ex);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "translation provider request failed", ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            log.error("Translation provider request interrupted [url={}]", translationUrl, ex);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "translation provider request interrupted", ex);
        }

        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "translation provider returned status " + response.statusCode()
            );
        }

        final JsonNode root;
        try {
            root = objectMapper.readTree(response.body());
        } catch (JsonProcessingException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "invalid translation provider response", ex);
        }

        String translated = root.path("translatedText").asText("").trim();
        if (translated.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "translation provider returned empty translation");
        }
        return translated;
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
