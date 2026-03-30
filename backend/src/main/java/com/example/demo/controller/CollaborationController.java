package com.example.demo.controller;

import com.example.demo.service.CollaborationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@CrossOrigin(origins = {"http://172.24.191.230:4200","http://172.24.191.221:4200","http://172.24.187.57:4200"})
@RequestMapping("/api/collab")
public class CollaborationController {

    @Autowired
    private CollaborationService collaborationService;

    @PostMapping("/teams")
    public Map<String, Object> createTeam(@RequestParam String name) {
        return collaborationService.createTeam(name);
    }

    @GetMapping("/teams")
    public List<Map<String, Object>> teams() {
        return collaborationService.getTeams();
    }

    @PostMapping("/boards")
    public Map<String, Object> createBoard(
            @RequestParam Long teamId,
            @RequestParam String title,
            @RequestParam(defaultValue = "") String description,
            @RequestParam(defaultValue = "Anonymous") String owner) {
        return collaborationService.createBoard(teamId, title, description, owner);
    }

    @GetMapping("/boards")
    public List<Map<String, Object>> boards(@RequestParam Long teamId) {
        return collaborationService.getBoards(teamId);
    }

    @PostMapping("/comments")
    public Map<String, Object> addComment(
            @RequestParam Long boardId,
            @RequestParam(defaultValue = "Anonymous") String author,
            @RequestParam String content) {
        return collaborationService.addComment(boardId, author, content);
    }

    @GetMapping("/comments")
    public List<Map<String, Object>> comments(@RequestParam Long boardId) {
        return collaborationService.getComments(boardId);
    }

    @GetMapping("/mentions")
    public List<Map<String, Object>> mentions(@RequestParam Long boardId) {
        return collaborationService.getMentionStats(boardId);
    }
}
