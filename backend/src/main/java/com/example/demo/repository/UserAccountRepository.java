package com.example.demo.repository;

import com.example.demo.model.UserAccount;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserAccountRepository extends JpaRepository<UserAccount, Long> {
    Optional<UserAccount> findByUsername(String username);
    List<UserAccount> findByUsernameContainingIgnoreCaseOrderByUsernameAsc(String query, Pageable pageable);
}
