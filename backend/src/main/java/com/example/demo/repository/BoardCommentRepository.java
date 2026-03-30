package com.example.demo.repository;

import com.example.demo.model.BoardComment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BoardCommentRepository extends JpaRepository<BoardComment, Long> {
    List<BoardComment> findByBoardIdOrderByCreatedAtAsc(Long boardId);
}
