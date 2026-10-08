create extension if not exists vector;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now()
);

create unique index organization_members_org_user on organization_members (organization_id, user_id);

create table projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  role text not null,
  title text,
  abstract_text text,
  original_filename text not null,
  storage_key text not null,
  mime_type text not null,
  byte_size integer not null,
  page_count integer,
  status text not null,
  error text,
  metadata jsonb,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_project_idx on documents (project_id);

create table document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  page_number integer not null,
  width double precision,
  height double precision,
  text text not null default '',
  ocr_applied boolean not null default false
);

create unique index document_pages_doc_page on document_pages (document_id, page_number);

create table document_sections (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  kind text not null,
  heading text,
  text text not null default '',
  page_start integer,
  page_end integer,
  sort_order integer not null default 0
);

create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  page_id uuid references document_pages(id) on delete set null,
  section_id uuid references document_sections(id) on delete set null,
  chunk_index integer not null,
  text text not null,
  page_number integer not null,
  bbox jsonb
);

create index document_chunks_document_idx on document_chunks (document_id);

create table embeddings (
  id uuid primary key default gen_random_uuid(),
  chunk_id uuid not null unique references document_chunks(id) on delete cascade,
  model text not null,
  dimensions integer not null,
  embedding vector(768) not null,
  created_at timestamptz not null default now()
);

create index embeddings_embedding_hnsw on embeddings using hnsw (embedding vector_cosine_ops);

create table claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  claim_number integer not null,
  text text not null,
  is_independent boolean not null default true,
  sort_order integer not null,
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index claims_project_idx on claims (project_id);

create table claim_elements (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  element_key text not null,
  text text not null,
  element_type text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index claim_elements_claim_idx on claim_elements (claim_id);

create table evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  source_document_id uuid not null references documents(id) on delete cascade,
  chunk_id uuid references document_chunks(id) on delete set null,
  page_number integer not null,
  evidence_text text not null,
  explanation text not null,
  confidence double precision not null,
  relationship text not null,
  model text,
  bbox jsonb,
  created_at timestamptz not null default now()
);

create index evidence_project_idx on evidence (project_id);

create table claim_element_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_element_id uuid not null references claim_elements(id) on delete cascade,
  evidence_id uuid references evidence(id) on delete cascade,
  prior_art_document_id uuid references documents(id) on delete cascade,
  ai_relationship text not null,
  ai_confidence double precision,
  analyst_relationship text,
  analyst_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index claim_element_evidence_element_idx on claim_element_evidence (claim_element_id);

create table annotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id),
  target_type text not null,
  target_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  status text not null,
  snapshot jsonb,
  docx_storage_key text,
  pdf_storage_key text,
  error text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table processing_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  claim_id uuid references claims(id) on delete cascade,
  claim_element_id uuid references claim_elements(id) on delete cascade,
  report_id uuid references reports(id) on delete cascade,
  type text not null,
  status text not null,
  bull_job_id text,
  attempt integer not null default 0,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index processing_jobs_document_idx on processing_jobs (document_id);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_org_idx on audit_logs (organization_id, created_at);

create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  provider text not null,
  model text not null,
  operation text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd double precision not null default 0,
  created_at timestamptz not null default now()
);

create table ai_result_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  operation text not null,
  model text not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);
