-- Phase 7: conversation sessions and interview sessions
create table if not exists conversation_sessions (
  id text primary key,
  linked_position_id text,
  status text not null default 'draft',
  messages_json text not null default '[]',
  extracted_fields_json text not null default '[]',
  jd_draft text not null default '',
  config_draft_json text not null default '{}',
  updated_at text not null,
  foreign key(linked_position_id) references positions(id) on delete set null
);

create index if not exists idx_conversation_sessions_status on conversation_sessions(status, updated_at desc);
create index if not exists idx_conversation_sessions_position on conversation_sessions(linked_position_id);

create table if not exists interview_sessions (
  id text primary key,
  position_id text not null,
  mode text not null check(mode in ('live', 'mock')),
  config_snapshot_json text not null default '{}',
  current_question_id text,
  helper_panel_state text not null default 'cueCard',
  backend_status text not null default 'disconnected',
  transcript_json text not null default '[]',
  created_at text not null,
  updated_at text not null,
  foreign key(position_id) references positions(id) on delete cascade
);

create index if not exists idx_interview_sessions_position on interview_sessions(position_id, created_at desc);
