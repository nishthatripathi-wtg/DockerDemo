package com.example.demo.repository;

import com.example.demo.model.UserMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UserMessageRepository extends JpaRepository<UserMessage, Long> {
    List<UserMessage> findByRecipientUsernameOrderByCreatedAtDesc(String recipientUsername);

    List<UserMessage> findByRecipientUsernameOrSenderUsernameOrderByCreatedAtDesc(String recipientUsername, String senderUsername);
}
