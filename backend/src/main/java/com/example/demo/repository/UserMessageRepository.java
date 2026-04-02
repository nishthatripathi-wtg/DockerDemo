package com.example.demo.repository;

import com.example.demo.model.UserMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface UserMessageRepository extends JpaRepository<UserMessage, Long> {
    List<UserMessage> findByRecipientUsernameOrderByCreatedAtDesc(String recipientUsername);

    List<UserMessage> findByRecipientUsernameOrSenderUsernameOrderByCreatedAtDesc(String recipientUsername, String senderUsername);

    @Query("""
            select m from UserMessage m
            where (m.senderUsername = :userA and m.recipientUsername = :userB)
               or (m.senderUsername = :userB and m.recipientUsername = :userA)
            order by m.createdAt asc, m.id asc
            """)
    List<UserMessage> findConversation(@Param("userA") String userA, @Param("userB") String userB);
}
