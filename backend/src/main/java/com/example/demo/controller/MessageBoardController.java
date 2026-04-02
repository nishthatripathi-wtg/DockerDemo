package com.example.demo.controller;

import com.example.demo.service.MessageBoardService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@CrossOrigin(origins = {"http://172.24.191.230:4200","http://172.24.191.221:4200","http://172.24.187.57:4200"})
@RequestMapping("/api/messages")
public class MessageBoardController {

    @Autowired
    private MessageBoardService messageBoardService;

    @PostMapping("/send")
    public Map<String, Object> send(
            @RequestParam String sender,
            @RequestParam String recipient,
            @RequestParam String content,
            @RequestParam(defaultValue = "en") String language) {
        return messageBoardService.send(sender, recipient, content, language);
    }

    @PostMapping("/reply")
    public Map<String, Object> reply(
            @RequestParam Long messageId,
            @RequestParam String sender,
            @RequestParam String content,
            @RequestParam(defaultValue = "en") String language) {
        return messageBoardService.reply(messageId, sender, content, language);
    }

    @PostMapping("/translate")
    public Map<String, Object> translate(
            @RequestParam Long messageId,
            @RequestParam String targetLanguage,
            @RequestParam(required = false) String username) {
        if (username == null || username.trim().isEmpty()) {
            return messageBoardService.translate(messageId, targetLanguage);
        }
        return messageBoardService.translateForUser(messageId, username, targetLanguage);
    }

    @GetMapping("/inbox")
    public List<Map<String, Object>> inbox(@RequestParam String username) {
        return messageBoardService.inbox(username);
    }

    @GetMapping("/history")
    public List<Map<String, Object>> history(@RequestParam String username) {
        return messageBoardService.history(username);
    }

    @GetMapping("/conversations")
    public List<Map<String, Object>> conversations(@RequestParam String username) {
        return messageBoardService.conversations(username);
    }

    @GetMapping("/thread")
    public List<Map<String, Object>> thread(
            @RequestParam String username,
            @RequestParam String counterpart
    ) {
        return messageBoardService.thread(username, counterpart);
    }
}
