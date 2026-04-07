-- PostgreSQL init script — runs once on first database creation
-- Creates monitoring user and enables pg_stat_statements

-- 1. Create monitoring user with read-only stats access
CREATE USER monitor WITH PASSWORD 'monitor';
GRANT pg_monitor TO monitor;

-- 2. Enable pg_stat_statements for query-level metrics
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
