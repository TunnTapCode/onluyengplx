# Vững Tay Lái — Ứng dụng ôn luyện GPLX

Web app ôn tập câu hỏi lý thuyết và thi thử: React + TypeScript ở frontend, Django REST Framework ở backend và MySQL làm cơ sở dữ liệu.

## Tình trạng dữ liệu

Workspace hiện có `600_cau_hoi.json` (600 bản ghi, chia thành 6 chương) và `images.zip` (318 ảnh). Dữ liệu đầu vào có `correct_answer`, nhưng chưa có nguồn đối chiếu chính thức trong workspace để xác minh nội dung, đáp án hoặc tính áp dụng năm 2025. Cả 600 bản ghi đều để `is_critical: null`; dữ liệu không có trường giải thích hay phân hạng GPLX. Vì vậy:

- Không đánh dấu hoặc dùng câu điểm liệt để chấm đề cho đến khi được xác minh.
- Không suy diễn rằng toàn bộ câu hỏi thuộc hạng B hoặc một hạng khác.
- Ứng dụng không tuyên bố bộ dữ liệu đã được chứng nhận chính thức.
- Hãy đối chiếu với tài liệu do cơ quan có thẩm quyền công bố trước khi bật cấu hình thi production.

Schema kiểm tra định dạng nguồn nằm tại [`data/questions.schema.json`](./data/questions.schema.json). Câu hỏi phải được nhập qua lệnh quản trị; không có đáp án/demo bịa sẵn trong database.

## Chạy với Docker Compose

Yêu cầu Docker Desktop có Docker Compose plugin.

1. Tạo cấu hình môi trường local:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Thay `DJANGO_SECRET_KEY` và các mật khẩu MySQL trong `.env` bằng giá trị riêng cho máy local. Không commit `.env`.
3. Khởi động MySQL, backend và frontend:

   ```powershell
   docker compose up --build
   ```

   Compose áp dụng migration Django khi backend khởi động. Giao diện ở `http://localhost:8080`, API ở `http://localhost:8000/api/v1/`.
4. Tạo tài khoản quản trị:

   ```powershell
   docker compose exec backend python manage.py createsuperuser
   ```

5. Kiểm tra dữ liệu trước khi nhập; chỉ nhập sau khi đã xác minh nguồn:

   ```powershell
   docker compose exec backend python manage.py import_questions /app/data/600_cau_hoi.json --dry-run
   docker compose exec backend python manage.py import_questions /app/data/600_cau_hoi.json
   ```

   Tệp JSON và archive ảnh đầu vào được mount read-only ở `/app/data/`. Lệnh import hỗ trợ kiểm tra ảnh mà không ghi đè dữ liệu đang có khi phát hiện lỗi.
6. Swagger/OpenAPI có tại `http://localhost:8000/api/docs/` (đường dẫn chính xác được cấu hình trong backend URL router).
7. Tắt dịch vụ:

   ```powershell
   docker compose down
   ```

   Dữ liệu MySQL được giữ trong volume `mysql_data`.

## Chạy khi phát triển frontend

Yêu cầu Node.js 22+ và backend/MySQL đã chạy.

```powershell
Set-Location frontend
npm ci
npm run dev
```

Vite phục vụ giao diện tại `http://localhost:5173`. Có thể đổi API bằng `VITE_API_BASE_URL` (mặc định `http://localhost:8000/api/v1`).

Kiểm tra frontend:

```powershell
Set-Location frontend
npm test
npm run build
npm audit
```

## Cấu trúc

- `frontend/` — SPA responsive, điều hướng, xác thực JWT, truy vấn API/cache, luồng ôn tập và thi thử.
- `backend/` — Django REST API, database models, import dữ liệu, chấm thi và Django Admin.
- `data/questions.schema.json` — JSON Schema cho file dữ liệu nguồn đã cung cấp.
- `600_cau_hoi.json`, `images.zip` — tài liệu đầu vào do người dùng cung cấp.

## Các nguyên tắc nghiệp vụ

- Backend chọn và chụp snapshot đề thi; không gửi đáp án đúng trong phiên thi.
- Điểm và quy tắc câu điểm liệt do backend quyết định; request của client không thể tự đặt kết quả.
- Mỗi người dùng chỉ truy cập tiến độ, câu đánh dấu và lịch sử của chính mình.
- Không bật cấu hình đề thi nếu chưa có bộ câu hỏi, đáp án, phân hạng và quy tắc đạt được xác minh.
