import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');

// 确保 data 目录存在
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'surveys.db');
const db = new Database(dbPath);

// 启用外键约束
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 创建表
db.exec(`
  -- 问卷配置表
  CREATE TABLE IF NOT EXISTS surveys (
    survey_id TEXT PRIMARY KEY,
    config TEXT NOT NULL,
    info_fields TEXT NOT NULL,
    questions TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 问卷提交表
  CREATE TABLE IF NOT EXISTS submissions (
    submission_id TEXT PRIMARY KEY,
    survey_id TEXT NOT NULL,
    user_info TEXT NOT NULL,
    answers TEXT NOT NULL,
    recording_durations TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (survey_id) REFERENCES surveys(survey_id)
  );

  -- 录音文件表
  CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    duration INTEGER,
    file_size INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (submission_id) REFERENCES submissions(submission_id),
    UNIQUE(submission_id, question_id)
  );

  -- 索引
  CREATE INDEX IF NOT EXISTS idx_submissions_survey ON submissions(survey_id);
  CREATE INDEX IF NOT EXISTS idx_submissions_time ON submissions(submitted_at);
  CREATE INDEX IF NOT EXISTS idx_recordings_submission ON recordings(submission_id);
`);

export default db;