# AI Video Watermark Remover (Web UI)

Công cụ xóa watermark/logo khỏi video sử dụng trí tuệ nhân tạo (AI Inpainting) với sức mạnh của **LaMA, ZITS, MAT**... nay đã có **Giao diện Web chuyên nghiệp** (chuẩn CapCut).

Được tối ưu hóa hoàn toàn để chạy tại máy (Local), không giới hạn dung lượng và hoàn toàn miễn phí.

## 🚀 Các tính năng nổi bật
* **Xóa Watermark bằng AI (Inpainting):** Tái tạo chân thực phần hình ảnh bị che khuất nhờ các Model AI hàng đầu như `LaMA`, `Anime-LaMA`, `ZITS`, `MAT`, `LDM`, `FCF`.
* **Giao diện Web siêu mượt (Split Panel Layout):** Bảng điều khiển riêng biệt và Khung xem Video căn giữa tự động, thiết kế chuẩn công nghiệp, dễ thao tác.
* **Hệ thống Keyframe chuẩn CapCut:** Dễ dàng tạo các Keyframe (♦) để thay đổi vị trí vùng chọn mặt nạ theo thời gian thực (hỗ trợ nội suy tự động màu vàng giữa các khung hình).
* **Tự động Tracking (Auto Detect):** Tự động phát hiện và bám theo logo đang di chuyển dựa trên prompt văn bản (Text-to-BBox).
* **Hỗ trợ HTTP 206 Partial Content:** Hệ thống Backend được thiết kế đặc biệt cho phép tua video (seek) tức thời không bị khựng, đáp ứng chuẩn render video trên mọi trình duyệt.
* **Trích xuất chất lượng cực cao:** Hỗ trợ render video CRF 14 (High) lên đến CRF 0 (Lossless) xịn xò với bộ mã hóa FFmpeg.

## 📦 Cài đặt Môi trường
1. Cài đặt Python 3.10+ (Khuyến nghị cài thêm CUDA Toolkit để xử lý bằng GPU Nvidia).
2. Chạy file khởi tạo để tự động cài môi trường:
   * Windows: Chạy `setup.bat` (hoặc click đúp)
   * Linux/macOS: Chạy `bash setup.sh`

## 🕹️ Hướng dẫn sử dụng Web Tool
Khởi động máy chủ Web cực nhanh với 1 thao tác:
1. **Mở file `run_web.bat`** (Click đúp chuột).
2. Truy cập vào đường dẫn: [http://localhost:8765](http://localhost:8765) trên trình duyệt.

**Cách dùng chức năng Manual Keyframe (Thủ công):**
1. Mở trang Web, bấm chọn và tải Video từ máy bạn lên.
2. Tại bảng điều khiển bên trái, chọn chế độ **Manual Keyframes (Chuẩn CapCut)**.
3. Dùng chuột vẽ một vùng mặt nạ (hình chữ nhật) bao quanh Watermark trên video ở bên phải.
4. Bấm nút **♦ Thêm** để ghim lại vị trí của mặt nạ ở giây hiện tại (Xuất hiện vạch đỏ trên thanh tua).
5. Tua video đến thời điểm logo di chuyển, vẽ lại mặt nạ (hoặc giữ nguyên) và tiếp tục bấm **♦ Thêm**.
6. Thuật toán sẽ tự động tính toán nội suy vị trí mặt nạ (hiển thị nét đứt màu vàng) giữa các điểm Keyframe.
7. Bấm **Chạy AI removal** và chờ hệ thống render thành quả!

## 🧩 Kiến trúc dự án
* `web_app.py`: Máy chủ FastAPI lõi, xử lý yêu cầu API, HTTP Range và tính toán toán học nội suy Keyframe.
* `web/`: Toàn bộ source code Frontend (HTML Layout 2 cột, CSS Flexbox, app.js quản lý Timeline Keyframe).
* `remwm.py`: Core AI Inpainting Engine (được gọi từ web_app bằng subprocess).
* `utils.py`: Các tiện ích xử lý khung hình (OpenCV).

## 🤝 Lời cảm ơn
Dự án được tùy biến từ nền tảng mã nguồn gốc [WatermarkRemover-AI](https://github.com/D-Ogi/WatermarkRemover-AI). Phiên bản hiện tại đã được nâng cấp, đập đi xây lại hệ thống UI Web và thuật toán Keyframe hoàn chỉnh.
