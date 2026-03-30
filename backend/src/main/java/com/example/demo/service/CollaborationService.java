package com.example.demo.service;

import com.example.demo.model.Board;
import com.example.demo.model.BoardComment;
import com.example.demo.model.Team;
import com.example.demo.repository.BoardCommentRepository;
import com.example.demo.repository.BoardRepository;
import com.example.demo.repository.TeamRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class CollaborationService {

    @Autowired
    private TeamRepository teamRepository;

    @Autowired
    private BoardRepository boardRepository;

    @Autowired
    private BoardCommentRepository boardCommentRepository;

    private static final Pattern MENTION_PATTERN = Pattern.compile("@([A-Za-z0-9._-]+)");

    public Map<String, Object> createTeam(String name) {
        String normalized = normalize(name, "team name");
        Team team = teamRepository.save(new Team(normalized, LocalDateTime.now()));
        return toTeam(team);
    }

    public List<Map<String, Object>> getTeams() {
        List<Map<String, Object>> teams = new ArrayList<>();
        for (Team team : teamRepository.findAllByOrderByNameAsc()) {
            teams.add(toTeam(team));
        }
        return teams;
    }

    public Map<String, Object> createBoard(Long teamId, String title, String description, String owner) {
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Team not found"));

        Board board = boardRepository.save(new Board(
                normalize(title, "board title"),
                normalize(description, "board description"),
                normalize(owner, "owner"),
                team,
                LocalDateTime.now()
        ));
        return toBoard(board);
    }

    public List<Map<String, Object>> getBoards(Long teamId) {
        List<Map<String, Object>> boards = new ArrayList<>();
        for (Board board : boardRepository.findByTeamIdOrderByCreatedAtDesc(teamId)) {
            boards.add(toBoard(board));
        }
        return boards;
    }

    public Map<String, Object> addComment(Long boardId, String author, String content) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found"));

        String commentText = normalize(content, "comment content");
        Set<String> mentions = extractMentions(commentText);
        String mentionsCsv = String.join(",", mentions);

        BoardComment comment = boardCommentRepository.save(new BoardComment(
                board,
                normalize(author, "author"),
                commentText,
                mentionsCsv,
                LocalDateTime.now()
        ));
        return toComment(comment);
    }

    public List<Map<String, Object>> getComments(Long boardId) {
        List<Map<String, Object>> comments = new ArrayList<>();
        for (BoardComment comment : boardCommentRepository.findByBoardIdOrderByCreatedAtAsc(boardId)) {
            comments.add(toComment(comment));
        }
        return comments;
    }

    public List<Map<String, Object>> getMentionStats(Long boardId) {
        Map<String, Integer> counts = new HashMap<>();
        for (BoardComment comment : boardCommentRepository.findByBoardIdOrderByCreatedAtAsc(boardId)) {
            if (comment.getMentionsCsv() == null || comment.getMentionsCsv().isBlank()) {
                continue;
            }
            for (String mention : comment.getMentionsCsv().split(",")) {
                if (!mention.isBlank()) {
                    counts.put(mention, counts.getOrDefault(mention, 0) + 1);
                }
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        counts.entrySet().stream()
                .sorted((a, b) -> Integer.compare(b.getValue(), a.getValue()))
                .forEach(e -> {
                    Map<String, Object> item = new HashMap<>();
                    item.put("user", e.getKey());
                    item.put("count", e.getValue());
                    result.add(item);
                });
        return result;
    }

    private Set<String> extractMentions(String content) {
        Set<String> mentions = new LinkedHashSet<>();
        Matcher matcher = MENTION_PATTERN.matcher(content);
        while (matcher.find()) {
            mentions.add(matcher.group(1));
        }
        return mentions;
    }

    private String normalize(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " is required");
        }
        return value.trim();
    }

    private Map<String, Object> toTeam(Team team) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", team.getId());
        map.put("name", team.getName());
        map.put("createdAt", team.getCreatedAt().toString());
        return map;
    }

    private Map<String, Object> toBoard(Board board) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", board.getId());
        map.put("teamId", board.getTeam().getId());
        map.put("title", board.getTitle());
        map.put("description", board.getDescription());
        map.put("owner", board.getOwnerName());
        map.put("createdAt", board.getCreatedAt().toString());
        return map;
    }

    private Map<String, Object> toComment(BoardComment comment) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", comment.getId());
        map.put("boardId", comment.getBoard().getId());
        map.put("author", comment.getAuthorName());
        map.put("content", comment.getContent());
        List<String> mentions = comment.getMentionsCsv() == null || comment.getMentionsCsv().isBlank()
                ? new ArrayList<>()
                : Arrays.asList(comment.getMentionsCsv().split(","));
        map.put("mentions", mentions);
        map.put("createdAt", comment.getCreatedAt().toString());
        return map;
    }
}
