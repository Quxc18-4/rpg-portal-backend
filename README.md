Quy ước chuẩn hóa Output & Đa ngôn ngữ (i18n)
Không hardcode text: Mọi thông báo trả về qua ApiResponse.success(), ApiResponse.error() hoặc ném lỗi qua AppError đều phải sử dụng Message Key định nghĩa trong utils/language.util.js.

Quy trình bắt buộc khi thêm mới 1 output trả về:

Bước 1: Mở và kiểm tra phiên bản mới nhất của utils/language.util.js.

Bước 2: Nếu trong object MESSAGES đã tồn tại key mang ý nghĩa tương ứng, bắt buộc tái sử dụng key đó (tránh tạo key trùng lặp nội dung).

Bước 3: Nếu chưa có, khai báo key mới theo định dạng UPPER_SNAKE_CASE kèm đầy đủ cả hai ngôn ngữ vi và en trong MESSAGES trước khi gọi ở Controller hoặc Service.