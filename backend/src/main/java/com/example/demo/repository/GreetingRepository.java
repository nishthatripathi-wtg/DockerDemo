package com.example.demo.repository;

import com.example.demo.model.GreetingRecord;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface GreetingRepository extends JpaRepository<GreetingRecord, Long> {

    List<GreetingRecord> findTop20ByOrderByCreatedAtDesc();

    @Query("SELECT g.name, COUNT(g) FROM GreetingRecord g GROUP BY g.name ORDER BY COUNT(g) DESC")
    List<Object[]> findTopNames(Pageable pageable);
}
