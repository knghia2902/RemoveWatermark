# 🎥 AI Watermark Remover (Web UI)

A powerful, local AI tool to automatically remove watermarks, logos, and subtitles from videos using state-of-the-art Inpainting models. Now featuring a **professional Split-Panel Web UI** with manual object tracking and precise timeline segment processing.

Được tối ưu hóa hoàn toàn để chạy tại máy (Local), không giới hạn độ dài video và hoàn toàn miễn phí.

---

## 🚀 Các tính năng nổi bật
* **🎨 Xóa Watermark bằng AI (Inpainting):** Tái tạo chân thực phần hình ảnh bị che khuất nhờ các Model AI hàng đầu thế giới như `LaMA`, `Anime-LaMA`, `ZITS`, `MAT`, `LDM`, `FCF`.
* **🖥️ Giao diện Web siêu mượt (Split Panel Layout):** Bảng điều khiển công cụ riêng biệt và 2 Khung xem Video (Gốc - Kết quả) đặt song song, thiết kế chuẩn công nghiệp, dễ dàng thao tác.
* **✂️ Xử lý theo phân đoạn (Trimming):** Cắt chính xác khoảng thời gian `Từ - Đến` cần xử lý logo trong video dài, giúp tiết kiệm tối đa thời gian chờ đợi. Âm thanh được đồng bộ chuẩn xác đến từng frame.
* **🤖 Tự động Tracking (Auto Detect):** Tự động phát hiện và bám theo logo đang di chuyển dựa trên prompt văn bản của bạn (Text-to-BBox).
* **⚡ Trải nghiệm xem Video mượt mà (Async Streaming):** Hệ thống API truyền tải video bằng HTTP Range Request bất đồng bộ (aiofiles), cho phép bạn **tua nhanh (seeking)** tức thời, mượt mà trên mọi trình duyệt mà không gây nghẽn máy chủ.
* **💎 Trích xuất chất lượng cực cao:** Hỗ trợ xuất video nguyên gốc từ CRF 18 (Standard) lên đến CRF 0 (Lossless) thông qua bộ mã hóa tiên tiến của FFmpeg.

---

## 📦 Cài đặt
1. Cài đặt **Python 3.10+** (Khuyến nghị cài thêm CUDA Toolkit để tăng tốc tối đa bằng card đồ họa GPU Nvidia).
2. Chạy file khởi tạo để tự động tải mô hình AI và cài môi trường:
   * **Windows:** Chạy `setup.bat` (Click đúp chuột)
   * **Linux/macOS:** Mở terminal và chạy lệnh `bash setup.sh`

---

## 🕹️ Hướng dẫn sử dụng
Chỉ mất đúng 1 giây để khởi động Giao diện Web:
1. Click đúp chuột vào file **`run_web.bat`**.
2. Truy cập vào đường dẫn: **[http://localhost:8765](http://localhost:8765)** trên trình duyệt Chrome/Edge của bạn.

### Cách vẽ vùng chọn (Fixed Mask):
Bạn có thể vẽ nhiều vùng chọn và cài đặt thời gian hiển thị riêng biệt cho từng vùng:
1. Bấm nút tải Video từ máy bạn lên ở khung bên phải.
2. Tại bảng điều khiển trái, chọn chế độ **Fixed mask**.
3. Kéo thả chuột trên Video bên trái để vẽ một vùng mặt nạ (hình chữ nhật đỏ) bao quanh Watermark/Logo.
4. Nhập khoảng thời gian tồn tại của mặt nạ này ở mục **Thời gian tồn tại của Mask này** (Nếu bỏ trống, mặt nạ sẽ áp dụng cho toàn bộ video).
5. Bấm **[➕ Thêm mặt nạ]**.
6. (Tiếp tục lặp lại các bước 3-5 nếu bạn muốn che thêm các logo khác ở các khoảng thời gian khác nhau).
7. *(Tùy chọn)* Nhập khoảng thời gian bạn muốn cắt xử lý ở phần **Thời điểm xử lý (Từ - Đến)** để giới hạn thời lượng video render.
8. Bấm **Chạy AI removal** và chờ hệ thống render siêu tốc!

---

## 🧩 Kiến trúc mã nguồn
* `web_app.py`: Máy chủ FastAPI lõi, điều phối API, xử lý File I/O, Async Streaming và tính toán nội suy điểm ảnh.
* `web/`: Toàn bộ mã nguồn Frontend UI (Vanilla JS, HTML5, CSS3) với bố cục giao diện tách lớp.
* `remwm.py`: Lõi xử lý AI Inpainting (tương tác trực tiếp qua đường ống dẫn lệnh với web_app).
* `utils.py`: Các thuật toán tính toán khung hình và ma trận.

---

## 🤝 Tác giả & Lời cảm ơn
Dự án được tùy biến, tối ưu hóa toàn diện và đập đi xây lại toàn bộ hệ thống Web UI dựa trên nền tảng cốt lõi [WatermarkRemover-AI](https://github.com/D-Ogi/WatermarkRemover-AI) gốc. Chân thành cảm ơn cộng đồng mã nguồn mở.
