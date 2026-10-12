# 🔮 AncestralWhisper — Tổ Tiên Mách Bảo (Chrome Extension MV3)
> *"Tai nghe mắt thấy, mách chuẩn từng câu - Trợ lý thi cử Multimodal bằng Google Gemini AI"*

## 🚀 Hướng dẫn cài đặt vào trình duyệt (Chrome/Edge/Brave)

1. Mở trình duyệt và truy cập: `chrome://extensions/`
2. Bật công tắc **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Bấm vào nút **Load unpacked** (Tải tiện ích đã giải nén).
4. Chọn thư mục chứa mã nguồn extension (thư mục `skillups-ai-solver` hoặc thư mục dự án bạn đã tải về máy).

---

## ⚙️ Cấu hình API Key
1. Bấm vào icon Extension **Skillups AI** trên thanh công cụ của trình duyệt.
2. Dán **Gemini API Key** của bạn (lấy miễn phí tại [Google AI Studio](https://aistudio.google.com/apikey)).
3. Bấm **Lưu cấu hình** -> Bấm **Kiểm tra kết nối** để xác nhận API hoạt động bình thường.

---

## 🎮 Cách sử dụng trên trang thi Skillups

### 1. Dạng bài Đọc / Trắc nghiệm / Code / Sơ đồ thông thường:
* Bấm tổ hợp phím **`Alt + S`** (hoặc nút **📸 Chụp & Giải** trên widget).
* Extension tự động chụp màn hình câu hỏi gửi cho Gemini Vision để phân tích và trả về đáp án.
* **Giao diện kín đáo (Stealth Mode):** Không làm đổi màu nền hay vẽ viền lộ liễu, chỉ gắn một **dấu tích xanh nhỏ xíu (`✓`)** tinh tế ngay cạnh phương án đúng.

### 2. Dạng bài Nghe (Listening Exam - 1 Audio cho nhiều câu hỏi):
* **Mặc định tính năng ghi âm luôn TẮT**.
* **Bước 1 (Nghe audio):** Khi bài nghe bắt đầu phát:
  * Nhấn **`Alt + L`** (hoặc nút **🎙️ Thu Âm**): Nút chuyển sang màu đỏ nhấp nháy 🔴 và ghi âm âm thanh sạch từ tab.
  * Khi bài nghe kết thúc: Nhấn lại **`Alt + L`** (hoặc **⏹️ Dừng & Giải**).
  * Extension giải câu đầu tiên, đồng thời **tự động lưu lại toàn bộ Transcript / Ngữ cảnh bài nghe** (hiển thị badge màu tím `🎧 Ngữ cảnh nghe: Đã lưu` trên Widget).
* **Bước 2 (Giải các câu hỏi tiếp theo 32, 33, 34... mà không cần nghe lại):**
  * Bạn chỉ cần cuộn tới câu hỏi tiếp theo và bấm **`Alt + S`**.
  * Extension sẽ tự động chụp màn hình câu hỏi mới + nhúng ngữ cảnh bài nghe vừa lưu để Gemini giải ngay lập tức!
* **Bước 3 (Sang bài mới):**
  * Nhấn biểu tượng dấu **✕** trên badge ngữ cảnh (hoặc chỉ cần bấm `Alt + L` thu bài nghe mới), ngữ cảnh cũ sẽ được tự động làm mới!

## 🌐 Khả năng tương thích nền tảng (Universal Platform Support)
Extension được thiết kế theo mô hình **Hybrid Adaptor**, hoạt động trơn tru trên:
* **Skillups Platform** (Được tối ưu hóa nhận diện chuyên sâu)
* **Google Forms & Microsoft Forms**
* **Moodle, Canvas LMS, Blackboard** (Hệ thống thi của hầu hết các trường Đại học)
* **Quizizz, Kahoot, Azota, Subre**
* **Coursera, Udemy, LinkedIn Learning**
* Bất kỳ trang web trắc nghiệm hoặc bài thi nào trên Internet!

---

## ⌨️ Bảng phím tắt điều khiển siêu tốc
* **`Alt + S`**: Chụp màn hình giải câu hỏi (Bài đọc, code, ảnh, sơ đồ - Tự động kèm ngữ cảnh nghe nếu có).
* **`Alt + L`**: Bật / Tắt thu âm giải bài **Nghe (Listening)**.
* **`Alt + H`**: Ẩn / Hiện widget điều khiển (cho đỡ vướng khi lướt web bình thường).
