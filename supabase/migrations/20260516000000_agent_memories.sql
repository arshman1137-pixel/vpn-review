-- Agent memories table for "Dreaming" feature
-- Stores synthesized learnings from past CxO council sessions
create table if not exists agent_memories (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  startup_id text not null,
  memory_type text not null default 'dream',
  content text not null,
  session_count int,
  created_at timestamptz not null default now()
);

-- Index for fast lookup: latest dream per startup
create index if not exists idx_agent_memories_startup_created
  on agent_memories (startup_id, created_at desc);

-- Index for user-scoped queries
create index if not exists idx_agent_memories_user
  on agent_memories (user_id, created_at desc);
