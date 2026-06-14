# Hướng dẫn dùng Mirror trong Torotic CAD

> 3 cấp Mirror giống SolidWorks: **Sketch / Feature / Body**. Đọc đúng cấp bạn cần.

---

## 1) Sketch Mirror — soi gương nét vẽ 2D (parametric)

**Khi nào dùng:** vẽ 1 nửa hình rồi soi gương sang nửa kia. Bản mirror **liên kết** với bản gốc — sửa nửa gốc thì nửa kia tự đổi.

**Các bước:**
1. Mở **Sketch** (bấm 1 mặt phẳng để vào chế độ vẽ).
2. Trên ribbon, chọn **Đường tâm** (┄) → vẽ 1 đường làm **trục đối xứng** (ví dụ đường dọc giữa).
3. Vẽ **một nửa hình** (Đường / Tròn / Cung …) ở một bên trục.
4. Bấm công cụ **Chọn** (🖱️) trên ribbon.
5. Click chọn **các nét cần soi gương** + click **đường tâm** (mẹo: chọn đường tâm **cuối cùng** — nó được lấy làm trục).
6. Panel **bên trái** → mục **"Mirror & Pattern"** → bấm nút **Mirror**.

✅ Nửa còn lại xuất hiện, đối xứng và **gắn quan hệ symmetric**. Thử kéo/sửa nửa gốc → nửa mirror đi theo.

---

## 2) Feature Mirror — soi gương 1 feature (lỗ, boss, cắt…)

**Khi nào dùng:** đã có 1 feature (Extrude/Revolve, ví dụ 1 lỗ) muốn nhân đối xứng sang phía kia của khối.

**Các bước:**
1. Trong **cây feature** (danh sách bên trái/phải), **click chọn** feature Extrude hoặc Revolve cần soi gương.
2. Panel **Thuộc tính Feature** hiện hàng nút → bấm **🪞 Mirror**.
3. Trong ô **Mặt phẳng**, chọn mặt soi gương:
   - **YZ / XZ / XY** (3 mặt chuẩn), hoặc
   - một **Datum plane** bạn đã tạo (xem mục 4).

✅ Feature được soi gương và gộp vào khối.

---

## 3) Body Mirror — soi gương cả khối 3D

**Khi nào dùng:** soi gương toàn bộ khối (vỏ nhựa, housing, chi tiết tay trái/tay phải).

**Các bước:**
1. Phải có sẵn ít nhất **1 khối 3D**.
2. Trên **thanh công cụ trên cùng** → nhóm có nút **🪞 Mirror** → bấm.
3. Panel **Thuộc tính Feature**:
   - **Mặt phẳng**: chọn YZ / XZ / XY hoặc Datum plane.
   - **Gộp khối (Merge solids)**:
     - ✔ **Bật** = nối thành **1 khối liền**.
     - ✘ **Tắt** = tạo **khối riêng** (để làm bản đối xứng tay trái/phải, hoặc xoá khối gốc).

✅ Khối soi gương xuất hiện qua mặt phẳng đã chọn.

---

## 4) Tạo Datum plane (mặt phẳng để soi gương ở vị trí tuỳ ý)

Khi muốn mirror **không** qua gốc toạ độ:
1. Trên thanh công cụ → nút **▭ Mặt phẳng** (Datum plane).
2. Panel chọn **mặt gốc** (Front/Top/Right) + **khoảng offset**.
3. Quay lại Feature/Body Mirror, ô **Mặt phẳng** sẽ có thêm Datum plane vừa tạo để chọn.

---

## Lỗi thường gặp
| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| Nút **Mirror** (sketch) mờ, bấm không được | Chưa chọn đối tượng. Phải dùng công cụ **Chọn** click vào nét trước. |
| Sketch Mirror báo cần "đường trục" | Chưa chọn đường tâm. Phải chọn thêm 1 **đường** làm trục (nên là Đường tâm). |
| Nút **🪞 Mirror** (khối) mờ | Chưa có khối 3D nào. Phải Extrude tạo khối trước. |
| Mirror khối ra sai phía | Đổi **Mặt phẳng** (YZ↔XZ↔XY) cho đúng hướng đối xứng. |
| Muốn 2 khối tách rời | **Bỏ chọn** "Gộp khối (Merge solids)". |
