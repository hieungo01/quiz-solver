# Skillups AI Auto-Solver (Chrome Extension MV3)

Extension hỗ trợ tự động nhận diện và gợi ý/chọn đáp án bài thi Skillups bằng mô hình **Google Gemini** (Gemini 3.8 Flash / Gemini 3.0 Flash / Gemini 2.0 Flash).

## 🚀 Hướng dẫn cài đặt vào trình duyệt (Chrome/Edge/Brave)

1. Mở trình duyệt và truy cập: `chrome://extensions/`
2. Bật công tắc **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Bấm vào nút **Load unpacked** (Tải tiện ích đã giải nén).
4. Chọn thư mục:
   `c:\Users\Hieunm\.gemini\antigravity-ide\scratch\resume-latex\skillups-ai-solver`

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

---

## 🛠️ Tùy biến Selector cho Skillups
Nếu cấu hình DOM của bài thi Skillups có class đặc thù, bạn có thể bổ sung selector vào file `content/content.js` tại mảng `questionSelectors` và `optionSelectors`.
