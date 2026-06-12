# Triển khai Torotic CAD lên Cloudflare Pages

App chạy 100% tĩnh (mọi tính toán ở trình duyệt — WASM, solver). Không cần backend ở bước này.

## 1. Đẩy mã nguồn lên GitHub (một lần)

Repo đã được `git init` + commit sẵn ở máy (tác giả: `torotic.vn@gmail.com`).

1. Đăng nhập GitHub bằng tài khoản **torotic**, tạo repo rỗng tại
   https://github.com/new (ví dụ tên `torotic-cad`) — **KHÔNG** tick thêm
   README / .gitignore / license.
2. Đẩy lên (đổi `<torotic-username>` thành đúng username GitHub của tài khoản đó):

```bash
git remote add origin https://github.com/<torotic-username>/torotic-cad.git
git push -u origin main
```

> Khi push, Git/trình duyệt sẽ hỏi đăng nhập — dùng tài khoản GitHub gắn với
> torotic.vn@gmail.com. (Nếu hỏi mật khẩu, GitHub yêu cầu Personal Access Token
> thay cho mật khẩu thường — tạo tại Settings → Developer settings → Personal access tokens.)

## 2. Nối Cloudflare Pages (một lần)

1. Vào **dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git**.
2. Chọn repo `torotic-cad`, nhánh `main`.
3. **Build settings:**
   - Framework preset: **Vite** (hoặc None)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - Node version: đã ghim bằng `.nvmrc` (20). Nếu cần, đặt thêm biến môi trường `NODE_VERSION=20`.
   - ⚠️ KHÔNG dùng `NODE_OPTIONS=--use-system-ca` (đó chỉ là cách chữa lỗi chứng chỉ trên máy local; môi trường build của Cloudflare không cần).
4. **Save and Deploy.** Lần build đầu mất vài phút (tải + biên dịch). Xong sẽ có URL `https://torotic-cad.pages.dev`.

## 3. Cập nhật về sau

Mỗi lần `git push` lên `main`, Cloudflare tự build và phát hành bản mới. Bản preview cho mỗi PR/nhánh cũng tự sinh.

## Ghi chú kỹ thuật
- Dùng bản WASM **single-thread** của replicad ⇒ KHÔNG cần header COOP/COEP (cross-origin isolation).
- File WASM ~11MB (< giới hạn 25MB/file của Cloudflare Pages). `public/_headers` đặt cache vĩnh viễn cho `/assets/*` (đã có hash) và luôn revalidate `index.html`.
- Bundle JS ~1MB (gzip ~306KB) — chấp nhận được; có thể tối ưu code-split three.js/WASM sau.
