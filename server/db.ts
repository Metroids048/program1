import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInitialAppState } from "../src/lib/interviewEngine";
import type {
  AnswerCueCard,
  ApiStateSnapshot,
  BackendState,
  InterviewRecord,
  MockSessionRecord,
  Position,
  PromptRun,
  RagChunk,
  RagDocument,
  RagSourceType,
  RetrievalRun,
  SearchResult,
} from "./types";

export interface AppDb {
  db: Database.Database | null;
  mode: "sqlite" | "file";
  getState(userId?: string): BackendState;
  saveState(state: BackendState, userId?: string): void;
  saveCueCard(card: AnswerCueCard): void;
  listCueCards(): AnswerCueCard[];
  saveRecord(record: InterviewRecord): void;
  listRecords(): InterviewRecord[];
  getRecord(id: string): InterviewRecord | undefined;
  saveSearchResult(result: SearchResult): void;
  savePromptRun(run: PromptRun): void;
  saveMockSession(session: MockSessionRecord): void;
  getMockSession(id: string): MockSessionRecord | undefined;
  getCachedCueCard(key: string): AnswerCueCard | undefined;
  saveCachedCueCard(key: string, card: AnswerCueCard, positionId: string): void;
  deleteCachedCueCardsByPosition(positionId: string): void;
  upsertDocument(document: RagDocument): void;
  replaceDocumentChunks(documentId: string, chunks: RagChunk[]): void;
  deleteDocument(sourceType: RagSourceType, sourceId: string): void;
  deleteDocumentsBySource(sourceType: RagSourceType, positionId: string): void;
  searchRagChunks(query: string, positionId?: string): Array<RagChunk & { score: number }>;
  saveRetrievalRun(run: RetrievalRun): void;
  // Auth
  insertUser(user: UserRow): void;
  getUserByPhone(phone: string): UserRow | undefined;
  getUserById(id: string): UserRow | undefined;
  insertAuthIdentity(identity: AuthIdentityRow): void;
  insertSession(session: SessionRow): void;
  deleteSessionByJti(jti: string): void;
  getSessionByJti(jti: string, afterDate: string): SessionRow | undefined;
}

export interface UserRow {
  id: string;
  phone: string | null;
  displayName: string;
  passwordHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthIdentityRow {
  id: string;
  userId: string;
  provider: string;
  identifier: string;
  createdAt: string;
}

export interface SessionRow {
  id: string;
  userId: string;
  tokenJti: string;
  expiresAt: string;
  createdAt: string;
}

const DEFAULT_DB_PATH = ".data/ai-job-platform.sqlite";

type FileStore = {
  state: BackendState;
  cueCards: AnswerCueCard[];
  records: InterviewRecord[];
  searchResults: SearchResult[];
  promptRuns: PromptRun[];
  mockSessions: MockSessionRecord[];
  cueCardCache: Array<{ cacheKey: string; positionId: string; card: AnswerCueCard; createdAt: string }>;
  documents: RagDocument[];
  documentChunks: RagChunk[];
  retrievalRuns: RetrievalRun[];
  users: UserRow[];
  authIdentities: AuthIdentityRow[];
  sessions: SessionRow[];
};

export function createDb(dbPath = process.env.AI_JOB_DB_PATH ?? DEFAULT_DB_PATH): AppDb {
  const resolved = resolve(dbPath);
  mkdirSync(dirname(resolved), { recursive: true });
  const fallbackFilePath = resolve(process.env.AI_JOB_FILE_PATH ?? deriveFilePath(resolved));

  try {
    const db = new Database(resolved);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
    return createSqliteDb(db);
  } catch {
    return createFileDb(fallbackFilePath);
  }
}

function createSqliteDb(db: Database.Database): AppDb {
  return {
    db,
    mode: "sqlite",
    getState(userId) {
      const key = userId ?? "default";
      const raw = db.prepare("select json from app_state where id = ?").get(key) as { json: string } | undefined;
      if (raw) return JSON.parse(raw.json) as BackendState;
      const initial = createInitialAppState();
      const state: BackendState = { profile: initial.profile, positions: initial.positions, records: [], journeyState: "guest" };
      this.saveState(state, userId);
      return state;
    },
    saveState(state, userId) {
      const key = userId ?? "default";
      db.prepare("insert into app_state(id, json, updated_at, user_id) values (?, ?, ?, ?) on conflict(id) do update set json = excluded.json, updated_at = excluded.updated_at, user_id = excluded.user_id").run(
        key,
        JSON.stringify(state),
        new Date().toISOString(),
        userId ?? null,
      );
    },
    saveCueCard(card) {
      db.prepare("insert or replace into cue_cards(id, json, created_at) values (?, ?, ?)").run(card.id, JSON.stringify(card), card.createdAt);
    },
    listCueCards() {
      return db.prepare("select json from cue_cards order by created_at desc").all().map((row) => JSON.parse((row as { json: string }).json) as AnswerCueCard);
    },
    saveRecord(record) {
      db.prepare("insert or replace into interview_records(id, mode, json, created_at) values (?, ?, ?, ?)").run(record.id, record.mode, JSON.stringify(record), record.createdAt);
    },
    listRecords() {
      return db
        .prepare("select json from interview_records order by created_at desc")
        .all()
        .map((row) => JSON.parse((row as { json: string }).json) as InterviewRecord);
    },
    getRecord(id) {
      const row = db.prepare("select json from interview_records where id = ?").get(id) as { json: string } | undefined;
      return row ? (JSON.parse(row.json) as InterviewRecord) : undefined;
    },
    saveSearchResult(result) {
      db.prepare("insert or replace into search_results(id, query, provider, json, created_at) values (?, ?, ?, ?, ?)").run(
        result.id,
        result.query,
        result.provider,
        JSON.stringify(result),
        result.createdAt,
      );
    },
    savePromptRun(run) {
      db.prepare("insert into prompt_runs(id, skill_id, prompt_id, model, provider, status, latency_ms, retrieval_count, search_used, fallback_reason, json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        run.id,
        run.skillId,
        run.promptId,
        run.model,
        run.provider,
        run.status,
        run.latencyMs,
        run.retrievalCount,
        Number(run.searchUsed),
        run.fallbackReason,
        JSON.stringify(run),
        run.createdAt,
      );
    },
    saveMockSession(session) {
      db.prepare("insert or replace into mock_sessions(id, position_id, json, updated_at, created_at) values (?, ?, ?, ?, ?)").run(
        session.id,
        session.positionId,
        JSON.stringify(session),
        session.updatedAt,
        session.createdAt,
      );
    },
    getMockSession(id) {
      const row = db.prepare("select json from mock_sessions where id = ?").get(id) as { json: string } | undefined;
      return row ? (JSON.parse(row.json) as MockSessionRecord) : undefined;
    },
    getCachedCueCard(key) {
      const row = db.prepare("select json from cue_card_cache where cache_key = ?").get(key) as { json: string } | undefined;
      return row ? (JSON.parse(row.json) as AnswerCueCard) : undefined;
    },
    saveCachedCueCard(key, card, positionId) {
      db.prepare("insert or replace into cue_card_cache(cache_key, json, position_id, created_at) values (?, ?, ?, ?)").run(key, JSON.stringify(card), positionId, card.createdAt);
    },
    deleteCachedCueCardsByPosition(positionId) {
      db.prepare("delete from cue_card_cache where position_id = ?").run(positionId);
    },
    upsertDocument(document) {
      db.prepare(
        `
        insert into documents(id, position_id, source_type, source_id, source_sub_type, owner_key, title, summary, content, priority, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          position_id = excluded.position_id,
          source_type = excluded.source_type,
          source_id = excluded.source_id,
          source_sub_type = excluded.source_sub_type,
          owner_key = excluded.owner_key,
          title = excluded.title,
          summary = excluded.summary,
          content = excluded.content,
          priority = excluded.priority,
          updated_at = excluded.updated_at
      `,
      ).run(
        document.id,
        document.positionId ?? null,
        document.sourceType,
        document.sourceId,
        document.sourceSubType ?? null,
        document.ownerKey,
        document.title,
        document.summary,
        document.content,
        document.priority,
        document.createdAt,
        document.updatedAt,
      );
    },
    replaceDocumentChunks(documentId, chunks) {
      const existingChunkIds = db
        .prepare("select id from document_chunks where document_id = ?")
        .all(documentId)
        .map((row) => (row as { id: string }).id);
      existingChunkIds.forEach((chunkId) => {
        db.prepare("delete from document_chunks_fts where chunk_id = ?").run(chunkId);
      });
      db.prepare("delete from document_chunks where document_id = ?").run(documentId);
      const insertChunk = db.prepare(
        "insert into document_chunks(id, document_id, position_id, source_type, source_id, source_sub_type, owner_key, title, content, chunk_index, priority, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      const insertFts = db.prepare(
        "insert into document_chunks_fts(content, title, source_type, source_id, position_id, owner_key, chunk_id) values (?, ?, ?, ?, ?, ?, ?)",
      );
      const transaction = db.transaction((items: RagChunk[]) => {
        items.forEach((chunk) => {
          insertChunk.run(
            chunk.id,
            chunk.documentId,
            chunk.positionId ?? null,
            chunk.sourceType,
            chunk.sourceId,
            chunk.sourceSubType ?? null,
            chunk.ownerKey,
            chunk.title,
            chunk.content,
            chunk.chunkIndex,
            chunk.priority,
            chunk.createdAt,
            chunk.updatedAt,
          );
          insertFts.run(
            chunk.content,
            chunk.title,
            chunk.sourceType,
            chunk.sourceId,
            chunk.positionId ?? "",
            chunk.ownerKey,
            chunk.id,
          );
        });
      });
      transaction(chunks);
    },
    deleteDocument(sourceType, sourceId) {
      const ids = db
        .prepare("select id from documents where source_type = ? and source_id = ?")
        .all(sourceType, sourceId)
        .map((row) => (row as { id: string }).id);
      ids.forEach((id) => {
        const chunkIds = db
          .prepare("select id from document_chunks where document_id = ?")
          .all(id)
          .map((row) => (row as { id: string }).id);
        chunkIds.forEach((chunkId) => {
          db.prepare("delete from document_chunks_fts where chunk_id = ?").run(chunkId);
        });
        db.prepare("delete from document_chunks where document_id = ?").run(id);
      });
      db.prepare("delete from documents where source_type = ? and source_id = ?").run(sourceType, sourceId);
    },
    deleteDocumentsBySource(sourceType, positionId) {
      const ids = db
        .prepare("select id from documents where source_type = ? and position_id = ?")
        .all(sourceType, positionId)
        .map((row) => (row as { id: string }).id);
      ids.forEach((id) => {
        const chunkIds = db
          .prepare("select id from document_chunks where document_id = ?")
          .all(id)
          .map((row) => (row as { id: string }).id);
        chunkIds.forEach((chunkId) => {
          db.prepare("delete from document_chunks_fts where chunk_id = ?").run(chunkId);
        });
        db.prepare("delete from document_chunks where document_id = ?").run(id);
      });
      db.prepare("delete from documents where source_type = ? and position_id = ?").run(sourceType, positionId);
    },
    searchRagChunks(query, positionId) {
      const rows = db
        .prepare(
          `
          select
            c.id,
            c.document_id,
            c.position_id,
            c.source_type,
            c.source_id,
            c.source_sub_type,
            c.owner_key,
            c.title,
            c.content,
            c.chunk_index,
            c.priority,
            c.created_at,
            c.updated_at,
            bm25(document_chunks_fts) as score
          from document_chunks_fts
          join document_chunks c on c.id = document_chunks_fts.chunk_id
          where document_chunks_fts match ?
            and (? is null or c.position_id = ? or c.position_id is null or c.position_id = '')
          order by score
          limit 20
        `,
        )
        .all(normalizeFtsQuery(query), positionId ?? null, positionId ?? null);
      return rows.map((row) => ({
        id: String((row as { id: string }).id),
        documentId: String((row as { document_id: string }).document_id),
        positionId: ((row as { position_id?: string }).position_id || undefined) as string | undefined,
        sourceType: String((row as { source_type: string }).source_type) as RagSourceType,
        sourceId: String((row as { source_id: string }).source_id),
        sourceSubType: ((row as { source_sub_type?: string }).source_sub_type || undefined) as string | undefined,
        ownerKey: String((row as { owner_key: string }).owner_key),
        title: String((row as { title: string }).title),
        content: String((row as { content: string }).content),
        chunkIndex: Number((row as { chunk_index: number }).chunk_index),
        priority: Number((row as { priority: number }).priority),
        createdAt: String((row as { created_at: string }).created_at),
        updatedAt: String((row as { updated_at: string }).updated_at),
        score: Number((row as { score: number }).score ?? 0),
      }));
    },
    saveRetrievalRun(run) {
      db.prepare("insert into retrieval_runs(id, query, position_id, owner_key, chunk_ids_json, latency_ms, created_at) values (?, ?, ?, ?, ?, ?, ?)").run(
        run.id,
        run.query,
        run.positionId ?? null,
        run.ownerKey,
        JSON.stringify(run.chunkIds),
        run.latencyMs,
        run.createdAt,
      );
    },
    insertUser(user) {
      db.prepare("insert into users(id, phone, display_name, password_hash, created_at, updated_at) values (?, ?, ?, ?, ?, ?)").run(
        user.id, user.phone, user.displayName, user.passwordHash, user.createdAt, user.updatedAt,
      );
    },
    getUserByPhone(phone) {
      const row = db.prepare("select id, phone, display_name, password_hash, created_at, updated_at from users where phone = ?").get(phone) as Record<string, unknown> | undefined;
      if (!row) return undefined;
      return { id: String(row.id ?? ""), phone: row.phone as string | null, displayName: String(row.display_name ?? ""), passwordHash: row.password_hash as string | null, createdAt: String(row.created_at ?? ""), updatedAt: String(row.updated_at ?? "") };
    },
    getUserById(id) {
      const row = db.prepare("select id, phone, display_name, password_hash, created_at, updated_at from users where id = ?").get(id) as Record<string, unknown> | undefined;
      if (!row) return undefined;
      return { id: String(row.id ?? ""), phone: row.phone as string | null, displayName: String(row.display_name ?? ""), passwordHash: row.password_hash as string | null, createdAt: String(row.created_at ?? ""), updatedAt: String(row.updated_at ?? "") };
    },
    insertAuthIdentity(identity) {
      db.prepare("insert into auth_identities(id, user_id, provider, identifier, created_at) values (?, ?, ?, ?, ?)").run(
        identity.id, identity.userId, identity.provider, identity.identifier, identity.createdAt,
      );
    },
    insertSession(session) {
      db.prepare("insert into user_sessions(id, user_id, token_jti, expires_at, created_at) values (?, ?, ?, ?, ?)").run(
        session.id, session.userId, session.tokenJti, session.expiresAt, session.createdAt,
      );
    },
    deleteSessionByJti(jti) {
      db.prepare("delete from user_sessions where token_jti = ?").run(jti);
    },
    getSessionByJti(jti, afterDate) {
      const row = db.prepare("select id, user_id, token_jti, expires_at, created_at from user_sessions where token_jti = ? and expires_at > ?").get(jti, afterDate) as Record<string, unknown> | undefined;
      if (!row) return undefined;
      return { id: String(row.id ?? ""), userId: String(row.user_id ?? ""), tokenJti: String(row.token_jti ?? ""), expiresAt: String(row.expires_at ?? ""), createdAt: String(row.created_at ?? "") };
    },
  };
}

function createFileDb(filePath: string): AppDb {
  mkdirSync(dirname(filePath), { recursive: true });
  const readStore = (): FileStore => {
    if (!existsSync(filePath)) {
      const initial = createInitialAppState();
      return {
        state: { profile: initial.profile, positions: initial.positions, records: [], journeyState: "guest" },
        cueCards: [],
        records: [],
        searchResults: [],
        promptRuns: [],
        mockSessions: [],
        cueCardCache: [],
        documents: [],
        documentChunks: [],
        retrievalRuns: [],
        users: [],
        authIdentities: [],
        sessions: [],
      };
    }
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<FileStore>;
    const initial = createInitialAppState();
    return {
      state: parsed.state ?? { profile: initial.profile, positions: initial.positions, records: [], journeyState: "guest" },
      cueCards: parsed.cueCards ?? [],
      records: parsed.records ?? [],
      searchResults: parsed.searchResults ?? [],
      promptRuns: parsed.promptRuns ?? [],
      mockSessions: parsed.mockSessions ?? [],
      cueCardCache: parsed.cueCardCache ?? [],
      documents: parsed.documents ?? [],
      documentChunks: parsed.documentChunks ?? [],
      retrievalRuns: parsed.retrievalRuns ?? [],
      users: parsed.users ?? [],
      authIdentities: parsed.authIdentities ?? [],
      sessions: parsed.sessions ?? [],
    };
  };
  const writeStore = (store: FileStore) => {
    writeFileSync(filePath, JSON.stringify(store, null, 2), "utf8");
  };

  const replace = (updater: (store: FileStore) => FileStore) => {
    const next = updater(readStore());
    writeStore(next);
    return next;
  };

  return {
    db: null,
    mode: "file",
    getState(_userId: string | undefined) {
      void _userId;
      return readStore().state;
    },
    saveState(state: BackendState, _userId: string | undefined) {
      void _userId;
      replace((store) => ({ ...store, state }));
    },
    saveCueCard(card) {
      replace((store) => ({ ...store, cueCards: [card, ...store.cueCards.filter((item) => item.id !== card.id)] }));
    },
    listCueCards() {
      return readStore().cueCards;
    },
    saveRecord(record) {
      replace((store) => ({
        ...store,
        records: [record, ...store.records.filter((item) => item.id !== record.id)],
        state: { ...store.state, records: [record, ...store.state.records.filter((item) => item.id !== record.id)] },
      }));
    },
    listRecords() {
      return readStore().records;
    },
    getRecord(id) {
      return readStore().records.find((item) => item.id === id);
    },
    saveSearchResult(result) {
      replace((store) => ({ ...store, searchResults: [result, ...store.searchResults.filter((item) => item.id !== result.id)] }));
    },
    savePromptRun(run) {
      replace((store) => ({ ...store, promptRuns: [run, ...store.promptRuns] }));
    },
    saveMockSession(session) {
      replace((store) => ({ ...store, mockSessions: [session, ...store.mockSessions.filter((item) => item.id !== session.id)] }));
    },
    getMockSession(id) {
      return readStore().mockSessions.find((item) => item.id === id);
    },
    getCachedCueCard(key) {
      return readStore().cueCardCache.find((item) => item.cacheKey === key)?.card;
    },
    saveCachedCueCard(key, card, positionId) {
      replace((store) => ({
        ...store,
        cueCardCache: [
          { cacheKey: key, positionId, card, createdAt: card.createdAt },
          ...store.cueCardCache.filter((item) => item.cacheKey !== key),
        ],
      }));
    },
    deleteCachedCueCardsByPosition(positionId) {
      replace((store) => ({ ...store, cueCardCache: store.cueCardCache.filter((item) => item.positionId !== positionId) }));
    },
    upsertDocument(document) {
      replace((store) => ({
        ...store,
        documents: [document, ...store.documents.filter((item) => item.id !== document.id)],
      }));
    },
    replaceDocumentChunks(documentId, chunks) {
      replace((store) => ({
        ...store,
        documentChunks: [...chunks, ...store.documentChunks.filter((item) => item.documentId !== documentId)],
      }));
    },
    deleteDocument(sourceType, sourceId) {
      replace((store) => {
        const removedIds = store.documents.filter((item) => item.sourceType === sourceType && item.sourceId === sourceId).map((item) => item.id);
        return {
          ...store,
          documents: store.documents.filter((item) => !(item.sourceType === sourceType && item.sourceId === sourceId)),
          documentChunks: store.documentChunks.filter((item) => !removedIds.includes(item.documentId)),
        };
      });
    },
    deleteDocumentsBySource(sourceType, positionId) {
      replace((store) => {
        const removedIds = store.documents.filter((item) => item.sourceType === sourceType && item.positionId === positionId).map((item) => item.id);
        return {
          ...store,
          documents: store.documents.filter((item) => !(item.sourceType === sourceType && item.positionId === positionId)),
          documentChunks: store.documentChunks.filter((item) => !removedIds.includes(item.documentId)),
        };
      });
    },
    searchRagChunks(query, positionId) {
      const terms = query
        .toLowerCase()
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
      const chunks = (readStore().documentChunks ?? []).filter((item) => !positionId || item.positionId === positionId || !item.positionId);
      return chunks
        .map((chunk) => {
          const haystack = `${chunk.title}\n${chunk.content}`.toLowerCase();
          const hits = terms.reduce((count, term) => (haystack.includes(term) ? count + 1 : count), 0);
          return { ...chunk, score: hits ? 1 / hits : 999 };
        })
        .sort((a, b) => a.score - b.score)
        .slice(0, 20);
    },
    saveRetrievalRun(run) {
      replace((store) => ({ ...store, retrievalRuns: [run, ...store.retrievalRuns] }));
    },
    insertUser(user) {
      replace((store) => ({ ...store, users: [...store.users, user] }));
    },
    getUserByPhone(phone) {
      return readStore().users.find((u) => u.phone === phone);
    },
    getUserById(id) {
      return readStore().users.find((u) => u.id === id);
    },
    insertAuthIdentity(identity) {
      replace((store) => ({ ...store, authIdentities: [...store.authIdentities, identity] }));
    },
    insertSession(session) {
      replace((store) => ({ ...store, sessions: [...store.sessions, session] }));
    },
    deleteSessionByJti(jti) {
      replace((store) => ({ ...store, sessions: store.sessions.filter((s) => s.tokenJti !== jti) }));
    },
    getSessionByJti(jti, afterDate) {
      return readStore().sessions.find((s) => s.tokenJti === jti && s.expiresAt > afterDate);
    },
  };
}

function migrate(db: Database.Database): void {
  const migrationPath = resolve("server/migrations/001_init.sql");
  const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
  if (sql.trim()) db.exec(sql);

  // Phase 1.1: Auth tables
  const authMigrationPath = resolve("server/migrations/002_auth.sql");
  const authSql = existsSync(authMigrationPath) ? readFileSync(authMigrationPath, "utf8") : "";
  if (authSql.trim()) db.exec(authSql);

  // Phase 1.2: user_id columns
  const userIdMigrationPath = resolve("server/migrations/003_user_id.sql");
  const userIdSql = existsSync(userIdMigrationPath) ? readFileSync(userIdMigrationPath, "utf8") : "";
  if (userIdSql.trim()) {
    try {
      db.exec(userIdSql);
    } catch {
      // Columns may already exist — not fatal
    }
  }

  // Phase 2: quota ledger
  const quotaMigrationPath = resolve("server/migrations/004_quota.sql");
  const quotaSql = existsSync(quotaMigrationPath) ? readFileSync(quotaMigrationPath, "utf8") : "";
  if (quotaSql.trim()) {
    try {
      db.exec(quotaSql);
    } catch {
      // May already exist
    }
  }

  // Phase 3+4: growth, feedback, audit
  const miscMigrationPath = resolve("server/migrations/005_growth_feedback.sql");
  const miscSql = existsSync(miscMigrationPath) ? readFileSync(miscMigrationPath, "utf8") : "";
  if (miscSql.trim()) {
    try {
      db.exec(miscSql);
    } catch {
      // May already exist
    }
  }

  const columns = db.prepare("pragma table_info(prompt_runs)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "skill_id")) {
    db.exec("alter table prompt_runs add column skill_id text not null default ''");
  }
}

export function upsertPosition(state: BackendState, position: Position): BackendState {
  const exists = state.positions.some((item) => item.id === position.id);
  return { ...state, positions: exists ? state.positions.map((item) => (item.id === position.id ? position : item)) : [position, ...state.positions] };
}

export function toApiSnapshot(state: BackendState, activePositionId?: string): ApiStateSnapshot {
  return {
    ...state,
    journeyState: state.journeyState ?? "guest",
    activePositionId: state.positions.some((position) => position.id === activePositionId) ? activePositionId! : state.positions[0]?.id ?? "",
  };
}

function normalizeFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((item) => item.replace(/["']/g, ""))
    .filter(Boolean)
    .join(" OR ");
}

function deriveFilePath(dbPath: string): string {
  if (dbPath.endsWith(".json")) return dbPath;
  if (/\.[^.\\/:]+$/.test(dbPath)) return dbPath.replace(/\.[^.\\/:]+$/, ".json");
  return `${dbPath}.json`;
}
