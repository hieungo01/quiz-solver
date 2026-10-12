#!/usr/bin/env bash
# ==============================================================================
# AncestralWhisper (Tổ Tiên Mách Bảo) - Cross-Platform Auto Setup Script
# Hỗ trợ: macOS, Linux, Windows (Git Bash / WSL / MSYS2)
# ==============================================================================

set -e

# Màu sắc hiển thị terminal
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${PURPLE}${BOLD}"
echo "  🔮 ====================================================="
echo "      ANCESTRALWHISPER - TỔ TIÊN MÁCH BẢO AUTO SETUP"
echo "  🔮 ====================================================="
echo -e "${NC}"

# 1. Phát hiện hệ điều hành (OS Detection)
OS_TYPE="Unknown"
case "$OSTYPE" in
  darwin*)  OS_TYPE="macOS" ;;
  linux*)   OS_TYPE="Linux" ;;
  msys*|cygwin*|mingw*) OS_TYPE="Windows" ;;
  *)        OS_TYPE=$(uname -s) ;;
esac

echo -e "🖥️  Hệ điều hành phát hiện: ${CYAN}${BOLD}${OS_TYPE}${NC}"

# Đường dẫn thư mục hiện tại
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo -e "📁 Thư mục extension: ${YELLOW}${SCRIPT_DIR}${NC}\n"

# 2. Khởi tạo file .env
ENV_FILE="${SCRIPT_DIR}/.env"
ENV_EXAMPLE="${SCRIPT_DIR}/.env.example"

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_EXAMPLE" ]; then
    echo -e "📄 Đang khởi tạo file ${CYAN}.env${NC} từ ${CYAN}.env.example${NC}..."
    cp "$ENV_EXAMPLE" "$ENV_FILE"
  else
    echo -e "📄 Đang tạo mới file ${CYAN}.env${NC}..."
    cat << 'EOF' > "$ENV_FILE"
# AncestralWhisper Configuration
GEMINI_API_KEY=
GEMINI_MODEL=auto
DEFAULT_MODE=semi-auto
EOF
  fi
  echo -e "✅ Đã tạo file ${GREEN}.env${NC} thành công."
else
  echo -e "ℹ️  File ${GREEN}.env${NC} đã tồn tại sẵn."
fi

# 3. Kiểm tra và nhập API Key
CURRENT_KEY=""
if [ -f "$ENV_FILE" ]; then
  CURRENT_KEY=$(grep -E '^GEMINI_API_KEY=' "$ENV_FILE" | cut -d '=' -f2- | tr -d ' "' || true)
fi

if [ -z "$CURRENT_KEY" ]; then
  echo -e "\n${YELLOW}🔑 Chưa có Gemini API Key được thiết lập.${NC}"
  echo -e "   (Bạn có thể lấy miễn phí tại: ${CYAN}https://aistudio.google.com/apikey${NC})"
  read -r -p "👉 Vui lòng dán Gemini API Key của bạn (hoặc nhấn Enter để cấu hình sau): " INPUT_KEY

  INPUT_KEY=$(echo "$INPUT_KEY" | tr -d ' "')

  if [ -n "$INPUT_KEY" ]; then
    # Ghi API Key vào .env
    if grep -q '^GEMINI_API_KEY=' "$ENV_FILE"; then
      if [ "$OS_TYPE" = "macOS" ]; then
        sed -i '' "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=${INPUT_KEY}|" "$ENV_FILE"
      else
        sed -i "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=${INPUT_KEY}|" "$ENV_FILE"
      fi
    else
      echo "GEMINI_API_KEY=${INPUT_KEY}" >> "$ENV_FILE"
    fi
    echo -e "${GREEN}✅ Đã lưu Gemini API Key vào file .env thành công!${NC}"
  else
    echo -e "${YELLOW}⚠️  Bỏ qua nhập key. Bạn có thể mở file .env để điền bất cứ lúc nào.${NC}"
  fi
else
  MASKED_KEY="${CURRENT_KEY:0:7}...${CURRENT_KEY: -4}"
  echo -e "🔑 API Key hiện tại: ${GREEN}${MASKED_KEY}${NC} (Đã sẵn sàng)"
fi

# 4. Sao chép đường dẫn thư mục vào Clipboard nếu có thể
COPIED=false
if [ "$OS_TYPE" = "macOS" ] && command -v pbcopy >/dev/null 2>&1; then
  echo "$SCRIPT_DIR" | pbcopy
  COPIED=true
elif [ "$OS_TYPE" = "Windows" ] && command -v clip.exe >/dev/null 2>&1; then
  # Chuyển đổi sang Windows path nếu cần
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$SCRIPT_DIR" | clip.exe
  else
    echo "$SCRIPT_DIR" | clip.exe
  fi
  COPIED=true
elif [ "$OS_TYPE" = "Linux" ] && command -v xclip >/dev/null 2>&1; then
  echo "$SCRIPT_DIR" | xclip -selection clipboard
  COPIED=true
fi

# 5. Hướng dẫn nạp vào trình duyệt
echo -e "\n${CYAN}=====================================================${NC}"
echo -e "${BOLD}🚀 HƯỚNG DẪN CÀI ĐẶT VÀO TRÌNH DUYỆT (CHROME / EDGE / BRAVE):${NC}"
echo -e "${CYAN}=====================================================${NC}"
echo -e "1. Mở trình duyệt và truy cập: ${BOLD}chrome://extensions/${NC}"
echo -e "2. Bật công tắc ${BOLD}Developer mode${NC} (Chế độ dành cho nhà phát triển ở góc phải trên)."
echo -e "3. Nhấn nút ${BOLD}Load unpacked${NC} (Tải tiện ích đã giải nén)."
if [ "$COPIED" = true ]; then
  echo -e "4. ${GREEN}📋 Đường dẫn thư mục đã được tự động copy vào Clipboard!${NC}"
  echo -e "   Chỉ cần dán (${BOLD}Ctrl+V${NC} hoặc ${BOLD}Cmd+V${NC}) và bấm Chọn (Select Folder)."
else
  echo -e "4. Chọn thư mục: ${YELLOW}${SCRIPT_DIR}${NC}"
fi

echo -e "\n${PURPLE}⌨️  PHÍM TẮT SỬ DỤNG:${NC}"
if [ "$OS_TYPE" = "macOS" ]; then
  echo -e "   • ${BOLD}Option ⌥ + S${NC} : Chụp màn hình giải bài thi (Skillups & mọi web)"
  echo -e "   • ${BOLD}Option ⌥ + L${NC} : Bật/Tắt thu âm bài nghe Listening"
  echo -e "   • ${BOLD}Option ⌥ + H${NC} : Ẩn/Hiện widget điều khiển"
else
  echo -e "   • ${BOLD}Alt + S${NC}      : Chụp màn hình giải bài thi (Skillups & mọi web)"
  echo -e "   • ${BOLD}Alt + L${NC}      : Bật/Tắt thu âm bài nghe Listening"
  echo -e "   • ${BOLD}Alt + H${NC}      : Ẩn/Hiện widget điều khiển"
fi

echo -e "\n${GREEN}✨ Chúc bạn làm bài thi đạt điểm tuyệt đối! Tổ tiên luôn đồng hành mách bảo 🔮${NC}\n"
