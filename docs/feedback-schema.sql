-- ============================================================
-- Torotic CAD — bảng feedback (báo lỗi / góp ý) trên Cloudflare D1
-- Chạy 1 lần: dashboard D1 → Console (hoặc `wrangler d1 execute`).
-- ============================================================

create table if not exists feedback (
  id            integer primary key autoincrement,
  loai          text not null,                       -- 'bao_loi' | 'tinh_nang'
  mo_ta         text not null,
  modules       text,                                -- JSON array (vd '["Sketch","AI"]')
  anh           text,                                -- ảnh viewport (data URL base64), có thể null
  cay_tinh_nang text,                                -- feature tree JSON lúc báo
  phien_ban     text,                                -- version app
  trang         text,                                -- location.href
  trinh_duyet   text,                                -- userAgent
  man_hinh      text,                                -- "1920x1080"
  trang_thai    text not null default 'moi',         -- moi|dang_xem|dang_lam|da_xong|tu_choi
  ghi_chu_admin text,
  ly_do_tu_choi text,
  created_at    text not null default (datetime('now')),
  updated_at    text
);

create index if not exists feedback_trangthai_idx on feedback(trang_thai, created_at desc);
