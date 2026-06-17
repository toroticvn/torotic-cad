-- ============================================================
-- Torotic CAD — tài khoản + dự án đám mây (Cloudflare D1)
-- Chạy 1 lần trong cùng D1 database đã dùng cho feedback (binding `DB`).
-- ============================================================

-- Người dùng
create table if not exists users (
  id            integer primary key autoincrement,
  email         text unique not null,
  password_hash text not null,                 -- pbkdf2$iter$saltB64$hashB64
  ten           text,                          -- tên hiển thị
  created_at    text not null default (datetime('now'))
);

-- Phiên đăng nhập (cookie token)
create table if not exists sessions (
  token      text primary key,                 -- 256-bit hex ngẫu nhiên
  user_id    integer not null references users(id),
  created_at text not null default (datetime('now')),
  expires_at text not null
);
create index if not exists sessions_user_idx on sessions(user_id);

-- Dự án lưu đám mây (Phần 2)
create table if not exists projects (
  id         integer primary key autoincrement,
  user_id    integer not null references users(id),
  ten        text not null,
  data       text not null default '{"version":1,"features":[]}',  -- JSON cây tính năng
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);
create index if not exists projects_user_idx on projects(user_id, updated_at desc);
