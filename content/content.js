// Content Script: Skillups Question Parser & Semi-Auto UI
// Tự động nhận diện câu hỏi, options, ảnh và hỗ trợ click/fill

(function () {
  let latestSolution = null;
  let cachedAudioContext = ""; // Bộ nhớ đệm lưu Transcript/Ngữ cảnh bài nghe
  let parsedElements = {
    questionEl: null,
    optionElements: [],
    inputElement: null
  };

  // Tham chiếu Root và Host cho Closed Shadow DOM (Chống anti-cheat quét DOM)
  let widgetHost = null;
  let widgetRoot = null;

  // Hàm mã hóa an toàn các chuỗi trả về từ AI để chống DOM XSS / Prompt Injection
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getWidgetEl(id) {
    return widgetRoot ? widgetRoot.getElementById(id) : null;
  }

  // Quản lý trạng thái hiển thị của widget (Mặc định luôn là TẮT hoàn toàn, chỉ bật khi bấm Alt + H)
  let isWidgetVisibleState = false;

  function isWidgetVisible() {
    return isWidgetVisibleState;
  }

  function setWidgetVisibility(visible) {
    isWidgetVisibleState = !!visible;
    if (widgetHost) {
      widgetHost.style.display = isWidgetVisibleState ? "block" : "none";
    }
    try {
      chrome.storage.local.set({ aw_widget_visible: isWidgetVisibleState });
      localStorage.setItem("aw_widget_closed", isWidgetVisibleState ? "false" : "true");
    } catch (e) {}
  }

  function updateAudioContext(contextText) {
    cachedAudioContext = contextText || "";
    const badge = getWidgetEl("audio-context-badge");
    const snippet = getWidgetEl("audio-context-snippet");
    if (badge && snippet) {
      if (cachedAudioContext) {
        snippet.textContent = cachedAudioContext.slice(0, 30) + "...";
        badge.style.display = "flex";
      } else {
        badge.style.display = "none";
      }
    }
  }

  function clearAudioContext() {
    updateAudioContext("");
    const statusEl = getWidgetEl("ai-status");
    if (statusEl) {
      statusEl.textContent = "🗑️ Đã xóa ngữ cảnh bài nghe.";
    }
  }

  // 1. Tạo floating widget điều khiển trực tiếp trên trang bằng Closed Shadow DOM
  function createFloatingWidget() {
    if (widgetHost) return;

    const host = document.createElement("div");
    host.id = "ancestral-whisper-container";
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.bottom = "0";
    host.style.right = "0";
    host.style.pointerEvents = "auto";

    // Khởi tạo Closed Shadow DOM: Các script giám sát thi cử của trang web không thể quét thấy ID/Class của widget
    const shadow = host.attachShadow({ mode: "closed" });
    widgetHost = host;
    widgetRoot = shadow;

    // Nhúng trực tiếp toàn bộ CSS vào bên trong Shadow DOM qua thẻ style để render ngay lập tức 100% không bị chặn
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      #skillups-ai-widget {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid #3b82f6;
        border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        width: 320px;
        transition: all 0.3s ease;
        overflow: hidden;
        box-sizing: border-box;
      }

      #skillups-ai-widget * {
        box-sizing: border-box;
      }

      #skillups-ai-widget.collapsed {
        width: auto;
        border-radius: 50px;
      }

      #skillups-ai-widget .widget-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: #1e293b;
        cursor: pointer;
        user-select: none;
      }

      #skillups-ai-widget .widget-title {
        font-size: 13px;
        font-weight: 700;
        color: #60a5fa;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      #skillups-ai-widget .widget-body {
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      #skillups-ai-widget .status-badge {
        font-size: 12px;
        color: #94a3b8;
        line-height: 1.4;
      }

      #skillups-ai-widget .explanation-box {
        background: #1e293b;
        border-left: 3px solid #3b82f6;
        padding: 8px;
        border-radius: 4px;
        font-size: 11px;
        color: #cbd5e1;
        max-height: 100px;
        overflow-y: auto;
      }

      #skillups-ai-widget .action-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }

      #skillups-ai-widget button.ai-btn {
        padding: 8px 8px;
        font-size: 11.5px;
        font-weight: 600;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }

      #skillups-ai-widget button.btn-solve {
        background: #2563eb;
        color: #fff;
      }

      #skillups-ai-widget button.btn-solve:hover {
        background: #1d4ed8;
      }

      #skillups-ai-widget button.btn-speaking {
        background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%);
        color: #fff;
      }

      #skillups-ai-widget button.btn-speaking:hover {
        background: linear-gradient(135deg, #6d28d9 0%, #4f46e5 100%);
      }

      #skillups-ai-widget button.btn-audio {
        background: #475569;
        color: #fff;
      }

      #skillups-ai-widget button.btn-audio:hover {
        background: #334155;
      }

      #skillups-ai-widget button.btn-audio.recording {
        background: #dc2626 !important;
        color: #fff !important;
        animation: pulseRecording 1s infinite alternate;
      }

      @keyframes pulseRecording {
        from { transform: scale(1); box-shadow: 0 0 0 rgba(220, 38, 38, 0.4); }
        to { transform: scale(1.05); box-shadow: 0 0 10px rgba(220, 38, 38, 0.8); }
      }

      #skillups-ai-widget button.btn-apply {
        background: #10b981;
        color: #fff;
      }

      #skillups-ai-widget button.btn-apply:hover {
        background: #059669;
      }

      #skillups-ai-widget button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* TELEPROMPTER MODAL CHO BÀI NÓI (SPEAKING ASSISTANT) */
      #ancestral-speaking-teleprompter {
        position: fixed;
        bottom: 24px;
        right: 360px;
        width: 480px;
        max-width: calc(100vw - 390px);
        max-height: 84vh;
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid #7c3aed;
        border-radius: 14px;
        box-shadow: 0 20px 45px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(124, 58, 237, 0.35);
        display: none;
        flex-direction: column;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        overflow: hidden;
        box-sizing: border-box;
      }

      #ancestral-speaking-teleprompter * {
        box-sizing: border-box;
      }

      .sp-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: linear-gradient(135deg, #1e1b4b 0%, #2e1065 100%);
        border-bottom: 1px solid rgba(124, 58, 237, 0.4);
      }

      .sp-title {
        font-size: 13px;
        font-weight: 700;
        color: #c4b5fd;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .sp-level-ribbon {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: #1e293b;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        gap: 8px;
      }

      .sp-level-pills {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .sp-pill {
        padding: 4px 9px;
        font-size: 11px;
        font-weight: 600;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.05);
        color: #cbd5e1;
        cursor: pointer;
        transition: all 0.2s;
        user-select: none;
      }

      .sp-pill:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
      }

      .sp-pill.active {
        background: linear-gradient(135deg, #7c3aed, #4f46e5);
        color: #fff;
        border-color: #a78bfa;
        box-shadow: 0 0 10px rgba(124, 58, 237, 0.5);
      }

      .sp-meta-bar {
        padding: 8px 12px;
        background: rgba(15, 23, 42, 0.7);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        font-size: 11px;
      }

      .sp-topic {
        color: #e2e8f0;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
      }

      .sp-badges {
        display: flex;
        gap: 6px;
        flex-shrink: 0;
      }

      .sp-badge {
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
      }

      .sp-badge.time {
        background: rgba(14, 165, 233, 0.2);
        color: #38bdf8;
        border: 1px solid rgba(14, 165, 233, 0.4);
      }

      .sp-badge.task {
        background: rgba(168, 85, 247, 0.2);
        color: #c084fc;
        border: 1px solid rgba(168, 85, 247, 0.4);
      }

      .sp-nav-tabs {
        display: flex;
        background: #0f172a;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }

      .sp-nav-tab {
        flex: 1;
        padding: 8px 10px;
        text-align: center;
        font-size: 11px;
        font-weight: 600;
        color: #94a3b8;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        cursor: pointer;
        transition: all 0.2s;
      }

      .sp-nav-tab:hover {
        color: #cbd5e1;
      }

      .sp-nav-tab.active {
        color: #a78bfa;
        border-bottom-color: #7c3aed;
        background: rgba(124, 58, 237, 0.08);
      }

      .sp-body-container {
        padding: 12px 14px;
        overflow-y: auto;
        max-height: 48vh;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .sp-script-text {
        font-size: 14.5px;
        line-height: 1.75;
        color: #f8fafc;
        background: #1e293b;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 12px;
        user-select: text;
        word-break: break-word;
      }

      .sp-pause {
        display: inline-block;
        color: #38bdf8;
        font-weight: 900;
        background: rgba(14, 165, 233, 0.18);
        border-radius: 3px;
        padding: 0 4px;
        margin: 0 2px;
        font-size: 12px;
        user-select: none;
      }

      .sp-translation-box {
        font-size: 12px;
        line-height: 1.6;
        color: #cbd5e1;
        background: rgba(30, 27, 75, 0.8);
        border: 1px solid rgba(99, 102, 241, 0.35);
        border-radius: 6px;
        padding: 10px;
        font-style: italic;
        display: none;
      }

      .sp-outline-item {
        background: #1e293b;
        border-left: 3px solid #8b5cf6;
        border-radius: 4px;
        padding: 8px 10px;
        font-size: 12px;
        line-height: 1.5;
        color: #e2e8f0;
      }

      .sp-vocab-item {
        background: #1e293b;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .sp-vocab-word {
        font-size: 12.5px;
        font-weight: 700;
        color: #38bdf8;
      }

      .sp-vocab-phonetic {
        font-size: 11px;
        color: #94a3b8;
        font-family: monospace;
      }

      .sp-vocab-meaning {
        font-size: 11.5px;
        color: #cbd5e1;
      }

      .sp-tips-box {
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.35);
        border-radius: 6px;
        padding: 8px 10px;
        font-size: 11.5px;
        color: #fde68a;
        line-height: 1.5;
      }

      .sp-footer-actions {
        display: flex;
        gap: 6px;
        padding: 10px 14px;
        background: #1e293b;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }

      .sp-btn {
        flex: 1;
        padding: 8px 10px;
        font-size: 11.5px;
        font-weight: 600;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }

      .sp-btn-copy {
        background: #10b981;
        color: #fff;
      }
      .sp-btn-copy:hover {
        background: #059669;
      }

      .sp-btn-tts {
        background: #0284c7;
        color: #fff;
      }
      .sp-btn-tts:hover {
        background: #0369a1;
      }
      .sp-btn-tts.playing {
        background: #ef4444 !important;
        animation: pulseRecording 1s infinite alternate;
      }

      .sp-btn-regen {
        background: #6366f1;
        color: #fff;
      }
      .sp-btn-regen:hover {
        background: #4f46e5;
      }
    `;
    shadow.appendChild(styleEl);

    // Mặc định luôn khởi tạo ở trạng thái ẨN HOÀN TOÀN, tuyệt đối không tự động hiện lên màn hình
    host.style.display = "none";
    isWidgetVisibleState = false;

    // Đọc trạng thái đồng bộ từ chrome.storage.local (chia sẻ qua mọi tab và trang thi)
    chrome.storage.local.get({ aw_widget_visible: false }, (data) => {
      if (data && data.aw_widget_visible === true) {
        isWidgetVisibleState = true;
        if (widgetHost) widgetHost.style.display = "block";
      } else {
        isWidgetVisibleState = false;
        if (widgetHost) widgetHost.style.display = "none";
      }
    });

    const widget = document.createElement("div");
    widget.id = "skillups-ai-widget";
    widget.innerHTML = `
      <div class="widget-header">
        <span class="widget-title" id="widget-toggle" style="cursor:pointer; flex:1; display:flex; align-items:center; gap:6px;" title="Bấm để ẩn/hiện nội dung">
          <img src="${chrome.runtime.getURL("icons/icon16.png")}" style="width:16px; height:16px; border-radius:3px;" alt="Logo">
          AncestralWhisper
        </span>
        <div style="display:flex; align-items:center; gap:8px;">
          <span id="widget-minimize" title="Thu gọn" style="cursor:pointer; font-size:12px; color:#94a3b8; user-select:none;">▼</span>
          <span id="widget-close" title="Tắt hoàn toàn widget (Chỉ dùng phím tắt Alt+S để giải, Alt+H để mở lại)" style="cursor:pointer; font-size:14px; color:#f87171; font-weight:bold; padding:0 3px; line-height:1; user-select:none;">✕</span>
        </div>
      </div>
      <div class="widget-body" id="widget-content">
        <div class="status-badge" id="ai-status">Sẵn sàng (Phím tắt: Alt + S)</div>
        <div id="source-doc-badge" style="display:none; background:#064e3b; border:1px solid #10b981; border-radius:4px; padding:4px 8px; font-size:11px; color:#a7f3d0; margin-bottom:4px;">
          📚 <b>Tài liệu gốc:</b> <span id="source-doc-name">Chưa có</span>
        </div>
        <div id="audio-context-badge" style="display:none; background:#1e1b4b; border:1px solid #6366f1; border-radius:4px; padding:4px 8px; font-size:11px; color:#c7d2fe; display:flex; justify-content:space-between; align-items:center;">
          <span>🎧 <b>Ngữ cảnh nghe:</b> <span id="audio-context-snippet">Đã lưu</span></span>
          <span id="btn-clear-audio-context" style="cursor:pointer; color:#ef4444; font-weight:bold; margin-left:6px;" title="Xóa ngữ cảnh audio để làm bài mới">✕</span>
        </div>
        <div class="explanation-box" id="ai-explanation" style="display:none;"></div>
        <div class="action-buttons">
          <button class="ai-btn btn-solve" id="btn-scan-solve" title="Chụp màn hình giải trắc nghiệm (Alt + S)">📸 Chụp & Giải</button>
          <button class="ai-btn btn-speaking" id="btn-speaking-script" title="Gợi ý kịch bản bài nói theo level (Alt + K)">🗣️ Bài Nói</button>
          <button class="ai-btn btn-audio" id="btn-audio-listen" title="Ghi âm bài nghe Listening (Alt + L)">🎙️ Thu Âm</button>
          <button class="ai-btn btn-apply" id="btn-auto-apply" disabled title="Click chọn đáp án trên trang">✅ Chọn</button>
        </div>
      </div>
    `;

    shadow.appendChild(widget);

    // Khung Teleprompter bài nói (Speaking Prompter)
    const teleprompter = document.createElement("div");
    teleprompter.id = "ancestral-speaking-teleprompter";
    teleprompter.innerHTML = `
      <div class="sp-header">
        <span class="sp-title">
          <img src="${chrome.runtime.getURL("icons/icon16.png")}" style="width:16px; height:16px; border-radius:3px;" alt="Logo">
          🗣️ Kịch Bản Bài Nói (Speaking Teleprompter)
        </span>
        <div style="display:flex; align-items:center; gap:8px;">
          <span id="sp-btn-close" title="Đóng bảng kịch bản nói" style="cursor:pointer; font-size:14px; color:#f87171; font-weight:bold; padding:0 3px; line-height:1; user-select:none;">✕</span>
        </div>
      </div>

      <div class="sp-level-ribbon">
        <div style="font-size:11px; font-weight:700; color:#a78bfa; display:flex; align-items:center; gap:4px;">
          <span>🎯 Level:</span>
        </div>
        <div class="sp-level-pills">
          <button type="button" class="sp-pill" data-level="a2" id="sp-pill-a2" title="Band 4.0 - 5.0: Câu ngắn, dễ nói, phát âm chuẩn">🌱 A2 Cơ Bản</button>
          <button type="button" class="sp-pill active" data-level="b1-b2" id="sp-pill-b1-b2" title="Band 5.5 - 6.5: Tự nhiên, liên từ mượt mà, mạch lạc">⚡ B1-B2 Trung Cấp</button>
          <button type="button" class="sp-pill" data-level="c1-c2" id="sp-pill-c1-c2" title="Band 7.5+: Học thuật, collocations, tư duy sâu">🔥 C1-C2 Nâng Cao</button>
        </div>
      </div>

      <div class="sp-meta-bar">
        <div class="sp-topic" id="sp-topic-title" title="Đề bài">📌 Đang nhận diện đề bài...</div>
        <div class="sp-badges">
          <span class="sp-badge time" id="sp-time-badge">⏱️ ~60s</span>
          <span class="sp-badge task" id="sp-task-badge">🎯 Speaking</span>
        </div>
      </div>

      <div class="sp-nav-tabs">
        <button type="button" class="sp-nav-tab active" data-tab="script" id="sp-tab-script">📜 Script Nói</button>
        <button type="button" class="sp-nav-tab" data-tab="outline" id="sp-tab-outline">🧭 Dàn Ý Nhanh</button>
        <button type="button" class="sp-nav-tab" data-tab="vocab" id="sp-tab-vocab">💎 Từ Vựng & Mẹo</button>
      </div>

      <div class="sp-body-container">
        <!-- Tab 1: Script nói -->
        <div id="sp-pane-script" style="display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#94a3b8;">
            <span>Dấu <b style="color:#38bdf8;">|</b> thể hiện vị trí ngắt hơi / lấy nhịp</span>
            <label style="cursor:pointer; display:flex; align-items:center; gap:4px; color:#cbd5e1;">
              <input type="checkbox" id="sp-toggle-translation" style="cursor:pointer;">
              <span>🇻🇳 Dịch nghĩa</span>
            </label>
          </div>
          <div class="sp-script-text" id="sp-script-content">Đang chuẩn bị kịch bản...</div>
          <div class="sp-translation-box" id="sp-translation-content"></div>
        </div>

        <!-- Tab 2: Dàn ý nhanh -->
        <div id="sp-pane-outline" style="display:none; flex-direction:column; gap:6px;">
          <div style="font-size:11px; color:#94a3b8; margin-bottom:2px;">Dàn ý ngắn gọn giúp bạn nói tự nhiên mà không cần đọc thuộc lòng từng từ:</div>
          <div id="sp-outline-list" style="display:flex; flex-direction:column; gap:6px;"></div>
        </div>

        <!-- Tab 3: Từ vựng & Mẹo -->
        <div id="sp-pane-vocab" style="display:none; flex-direction:column; gap:8px;">
          <div style="font-size:11px; font-weight:700; color:#38bdf8;">Từ vựng & Cụm từ ăn điểm (High-scoring vocabulary):</div>
          <div id="sp-vocab-list" style="display:flex; flex-direction:column; gap:6px;"></div>
          <div class="sp-tips-box" id="sp-pronunciation-tips"></div>
        </div>
      </div>

      <div class="sp-footer-actions">
        <button type="button" class="sp-btn sp-btn-copy" id="sp-btn-copy">📋 Sao Chép</button>
        <button type="button" class="sp-btn sp-btn-tts" id="sp-btn-tts">🔊 Nghe Đọc Mẫu</button>
        <button type="button" class="sp-btn sp-btn-regen" id="sp-btn-regen">🔄 Đổi Bài Khác</button>
      </div>
    `;

    shadow.appendChild(teleprompter);
    (document.body || document.documentElement).appendChild(host);

    // Toggle minimize
    getWidgetEl("widget-toggle").addEventListener("click", () => {
      const content = getWidgetEl("widget-content");
      const isHidden = content.style.display === "none";
      content.style.display = isHidden ? "flex" : "none";
      getWidgetEl("widget-minimize").textContent = isHidden ? "▼" : "▲";
    });

    getWidgetEl("widget-minimize").addEventListener("click", (e) => {
      e.stopPropagation();
      const content = getWidgetEl("widget-content");
      const isHidden = content.style.display === "none";
      content.style.display = isHidden ? "flex" : "none";
      getWidgetEl("widget-minimize").textContent = isHidden ? "▼" : "▲";
    });

    // Nút tắt hoàn toàn widget (Lưu lại trạng thái, không tự bật lại)
    const closeBtn = getWidgetEl("widget-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        setWidgetVisibility(false);
      });
    }

    // Button actions
    getWidgetEl("btn-scan-solve").addEventListener("click", captureAndSolveCurrentScreen);
    getWidgetEl("btn-speaking-script").addEventListener("click", () => generateSpeakingScript());
    getWidgetEl("btn-audio-listen").addEventListener("click", toggleAudioRecording);
    getWidgetEl("btn-auto-apply").addEventListener("click", applySolutionToDOM);

    // Teleprompter Speaking actions
    const spCloseBtn = getWidgetEl("sp-btn-close");
    if (spCloseBtn) {
      spCloseBtn.addEventListener("click", hideSpeakingTeleprompter);
    }

    const spCopyBtn = getWidgetEl("sp-btn-copy");
    if (spCopyBtn) {
      spCopyBtn.addEventListener("click", copySpeakingScript);
    }

    const spTtsBtn = getWidgetEl("sp-btn-tts");
    if (spTtsBtn) {
      spTtsBtn.addEventListener("click", toggleSpeakingTTS);
    }

    const spRegenBtn = getWidgetEl("sp-btn-regen");
    if (spRegenBtn) {
      spRegenBtn.addEventListener("click", () => generateSpeakingScript(currentSpeakingLevel));
    }

    // Level selector pills
    ["a2", "b1-b2", "c1-c2"].forEach(lvl => {
      const pill = getWidgetEl(`sp-pill-${lvl}`);
      if (pill) {
        pill.addEventListener("click", () => {
          if (currentSpeakingLevel === lvl) return;
          setActiveSpeakingLevel(lvl);
          generateSpeakingScript(lvl);
        });
      }
    });

    // View tab switching (Script / Outline / Vocab)
    ["script", "outline", "vocab"].forEach(tabName => {
      const tabBtn = getWidgetEl(`sp-tab-${tabName}`);
      if (tabBtn) {
        tabBtn.addEventListener("click", () => switchSpeakingTab(tabName));
      }
    });

    // Translation toggle
    const transToggle = getWidgetEl("sp-toggle-translation");
    if (transToggle) {
      transToggle.addEventListener("change", (e) => {
        const transBox = getWidgetEl("sp-translation-content");
        if (transBox) {
          transBox.style.display = e.target.checked ? "block" : "none";
        }
      });
    }

    // Đọc cấu hình level mặc định từ storage
    chrome.storage.local.get({ speakingLevel: "b1-b2" }, (cfg) => {
      if (cfg && cfg.speakingLevel) {
        setActiveSpeakingLevel(cfg.speakingLevel);
      }
    });

    // Nút xóa audio context

    // Nút xóa audio context
    getWidgetEl("btn-clear-audio-context").addEventListener("click", (e) => {
      e.stopPropagation();
      clearAudioContext();
    });

    // Cập nhật trạng thái hiển thị tài liệu nguồn trên widget
    const syncSourceBadge = () => {
      chrome.storage.local.get({ sourceMode: false, sourceName: "", sourceCount: 0, sourceSize: 0 }, (items) => {
        const badge = getWidgetEl("source-doc-badge");
        const nameEl = getWidgetEl("source-doc-name");
        if (badge && nameEl) {
          if (items.sourceMode && items.sourceName) {
            const label = items.sourceCount > 1 
              ? `📚 ${items.sourceCount} files (${items.sourceSize} KB)` 
              : `📚 ${items.sourceName}`;
            nameEl.textContent = label.length > 28 ? label.slice(0, 26) + "..." : label;
            badge.title = `Kho tài liệu: ${items.sourceName} (${items.sourceSize} KB)`;
            badge.style.display = "block";
          } else {
            badge.style.display = "none";
          }
        }
      });
    };

    syncSourceBadge();
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.sourceMode || changes.sourceName) {
        syncSourceBadge();
      }
    });
  }

  // 2. Parser DOM thông minh: Quét câu hỏi, options, ảnh trên trang
  function parseCurrentQuestion() {
    clearHighlights();

    // Universal Selectors cho bài thi Skillups/Quiz
    // Tìm container câu hỏi phổ biến
    const questionSelectors = [
      ".question-container",
      ".question-content",
      ".quiz-question",
      "[data-testid='question']",
      ".question",
      "article.question",
      ".quiz-item"
    ];

    let questionContainer = null;
    for (const selector of questionSelectors) {
      const found = document.querySelector(selector);
      if (found) {
        questionContainer = found;
        break;
      }
    }

    // Nếu không tìm thấy bằng class đặc thù, lấy element chứa thẻ question hoặc main container
    if (!questionContainer) {
      questionContainer = document.querySelector("main") || document.body;
    }

    // Trích xuất text câu hỏi
    const questionTextEl = questionContainer.querySelector(".question-title, .question-text, h3, h4, p") || questionContainer;
    const questionText = questionTextEl.innerText.trim();

    // Trích xuất ảnh (nếu có)
    const images = [];
    const imgElements = questionContainer.querySelectorAll("img");
    imgElements.forEach(img => {
      // Chỉ lấy ảnh có kích thước đáng kể, tránh icon
      if (img.width > 50 && img.height > 50 && img.src) {
        // Tạm thời nếu là base64 thì lấy luôn, nếu là URL thì truyền URL hoặc xử lý convert
        if (img.src.startsWith("data:image")) {
          const match = img.src.match(/^data:(image\/\w+);base64,(.+)$/);
          if (match) {
            images.push({ mimeType: match[1], data: match[2] });
          }
        }
      }
    });

    // Trích xuất danh sách đáp án
    const optionSelectors = [
      ".option-item",
      ".answer-item",
      ".choice",
      "label.radio",
      "label.checkbox",
      "li[role='radio']",
      "div[role='radio']"
    ];

    let optionElements = [];
    for (const sel of optionSelectors) {
      const list = questionContainer.querySelectorAll(sel);
      if (list && list.length > 1) {
        optionElements = Array.from(list);
        break;
      }
    }

    // Nếu vẫn không thấy, tìm tất cả label chứa input radio/checkbox
    if (optionElements.length === 0) {
      const inputs = questionContainer.querySelectorAll("input[type='radio'], input[type='checkbox']");
      if (inputs.length > 0) {
        optionElements = Array.from(inputs).map(inp => inp.closest("label") || inp.parentElement);
      }
    }

    const optionsText = optionElements.map(el => el.innerText.trim());

    // Kiểm tra ô điền từ (fill in the blank)
    const fillInput = questionContainer.querySelector("input[type='text']:not(#apiKey), textarea");

    parsedElements = {
      questionEl: questionTextEl,
      optionElements: optionElements,
      inputElement: fillInput
    };

    console.log("[Skillups AI] Scanned data:", {
      questionText,
      optionsText,
      imageCount: images.length,
      isFillIn: !!fillInput
    });

    return {
      questionText,
      options: optionsText,
      images,
      hasOptions: optionsText.length > 0
    };
  }

  // 2. Chụp màn hình và giải đề thi bằng Gemini Vision API
  async function captureAndSolveCurrentScreen() {
    const statusEl = getWidgetEl("ai-status");
    const expEl = getWidgetEl("ai-explanation");
    const applyBtn = getWidgetEl("btn-auto-apply");

    // Ẩn tạm thời widget nếu đang hiển thị để không bị dính vào ảnh chụp màn hình
    if (widgetHost && isWidgetVisibleState) {
      widgetHost.style.display = "none";
    }

    if (statusEl) statusEl.textContent = "📸 Đang chụp màn hình & phân tích đề thi...";
    if (applyBtn) applyBtn.disabled = true;
    if (expEl) expEl.style.display = "none";
    clearHighlights();

    // Chờ 120ms để render ẩn widget
    await new Promise(r => setTimeout(r, 120));

    try {
      const response = await chrome.runtime.sendMessage({
        action: "CAPTURE_AND_SOLVE",
        audioContext: cachedAudioContext || ""
      });

      // TUYỆT ĐỐI KHÔNG TỰ ĐỘNG BẬT LẠI WIDGET! Chỉ hiển thị nếu người dùng đang chủ động mở (isWidgetVisibleState === true)
      if (isWidgetVisibleState && widgetHost) {
        widgetHost.style.display = "block";
      }

      if (!response || !response.success) {
        if (statusEl) statusEl.textContent = `❌ Lỗi: ${response?.error || "Không có phản hồi từ AI"}`;
        return;
      }

      latestSolution = response.result;
      const rawLetters = (latestSolution.selected_option_letters || []).join(", ");
      const safeLetters = escapeHtml(rawLetters);
      const confidence = Math.round((latestSolution.confidence || 0.95) * 100);

      const contextIndicator = cachedAudioContext ? " 🎧 (Kèm ngữ cảnh nghe)" : "";
      if (statusEl) {
        statusEl.innerHTML = `💡 <b>Đáp án: [ ${safeLetters || "Đã chọn"} ]</b> (${confidence}%)${contextIndicator}`;
      }

      let detailHtml = "";
      if (cachedAudioContext) {
        detailHtml += `<div style="background:#312e81; padding:4px 6px; border-radius:4px; margin-bottom:6px; font-size:10px; color:#a5b4fc;">🎧 <b>Đã áp dụng ngữ cảnh nghe trước đó để giải câu này</b></div>`;
      }
      if (latestSolution.question_text) {
        detailHtml += `<b>Câu hỏi:</b> ${escapeHtml(latestSolution.question_text)}<br>`;
      }
      if (latestSolution.selected_option_texts && latestSolution.selected_option_texts.length > 0) {
        const safeOptions = latestSolution.selected_option_texts.map(t => escapeHtml(t)).join(" | ");
        detailHtml += `<b>Nội dung:</b> ${safeOptions}<br>`;
      }
      if (latestSolution.fill_in_text) {
        detailHtml += `<b>Điền từ:</b> ${escapeHtml(latestSolution.fill_in_text)}<br>`;
      }
      if (latestSolution.source_citation) {
        detailHtml += `<div style="background:#064e3b; border-left:3px solid #10b981; padding:4px 6px; border-radius:4px; margin:4px 0; font-size:11px; color:#a7f3d0;">📖 <b>Trích dẫn tài liệu gốc:</b><br><i>"${escapeHtml(latestSolution.source_citation)}"</i></div>`;
      }
      if (latestSolution.explanation) {
        detailHtml += `<b>Giải thích:</b> ${escapeHtml(latestSolution.explanation)}`;
      }

      if (expEl) {
        expEl.innerHTML = detailHtml;
        expEl.style.display = "block";
      }
      if (applyBtn) applyBtn.disabled = false;

      // Tìm và highlight đáp án trên trang dựa vào chữ hoặc ký tự A/B/C/D
      highlightAnswerOnScreen(latestSolution);

      // Nếu cấu hình là Auto thì tự động click luôn
      chrome.storage.local.get({ mode: "semi-auto" }, (cfg) => {
        if (cfg.mode === "auto") {
          applySolutionToDOM();
        }
      });
    } catch (err) {
      if (isWidgetVisibleState && widgetHost) {
        widgetHost.style.display = "block";
      }
      if (statusEl) statusEl.textContent = `❌ Lỗi: ${err.message}`;
    }
  }

  // 3. Highlight đáp án: Hỗ trợ chuyên sâu Skillups + Universal (Google Forms, Moodle, Quizizz, Canvas, v.v.)
  function highlightAnswerOnScreen(solution) {
    clearHighlights();

    const targets = solution.selected_option_texts || [];
    const letters = solution.selected_option_letters || [];

    if (targets.length === 0 && letters.length === 0) return;

    // Platform Adaptors: Các selector ứng viên của nhiều nền tảng thi phổ biến
    const quizCandidateSelectors = [
      // 1. Skillups & custom LMS
      ".option-item", ".answer-item", ".choice", ".question-option",
      // 2. Google Forms
      "[role='radio']", "[role='checkbox']", ".docssharedWizToggleLabeledContainer",
      // 3. Moodle / Canvas LMS / Blackboard
      ".form-check", ".r0", ".r1", ".answer label", ".answers div",
      // 4. Quizizz / Kahoot / Azota
      "[data-testid*='option']", ".option-container", ".answer-tile",
      // 5. Thẻ chuẩn HTML
      "label", "li"
    ];

    let candidateElements = [];
    for (const sel of quizCandidateSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) {
        candidateElements.push(...Array.from(found));
      }
    }

    // Nếu không có selector chuyên dụng, quét tất cả div/button/p/span
    if (candidateElements.length === 0) {
      candidateElements = Array.from(document.querySelectorAll("div, button, p, span"));
    }

    const uniqueCandidates = [...new Set(candidateElements)];

    uniqueCandidates.forEach(el => {
      // Bỏ qua widget của extension
      if ((widgetHost && widgetHost.contains(el)) || el.closest("#skillups-ai-widget, #ancestral-whisper-container")) return;

      const text = el.innerText?.trim();
      if (!text || text.length < 1 || text.length > 300) return;

      // Kiểm tra khớp nội dung chữ đáp án (Fuzzy matching)
      const matchedText = targets.some(targetText => {
        const cleanTarget = targetText.toLowerCase().replace(/^[a-d][\.\:\)]\s*/, "").trim();
        const cleanEl = text.toLowerCase().replace(/^[a-d][\.\:\)]\s*/, "").trim();
        return (cleanEl.includes(cleanTarget) || cleanTarget.includes(cleanEl)) && Math.abs(cleanEl.length - cleanTarget.length) < 50;
      });

      // Hoặc khớp nhãn A., B., C., D. ở đầu câu
      const matchedLetter = letters.some(letter => {
        const reg = new RegExp(`^[\(]?[${letter}][\.\:\)]`, "i");
        return reg.test(text);
      });

      if (matchedText || matchedLetter) {
        const parentChoice = el.closest("[role='radio'], [role='checkbox'], li, label, .form-check, .option-item") || el;
        if (!parentChoice.classList.contains("skillups-ai-highlighted-answer")) {
          parentChoice.classList.add("skillups-ai-highlighted-answer");
          const badge = document.createElement("span");
          badge.className = "skillups-ai-badge";
          badge.textContent = "✓";
          badge.title = `AI Gợi ý [${letters.join(", ")}]`;
          parentChoice.appendChild(badge);
        }
      }
    });
  }

  // 4. Áp dụng đáp án vào trang web (Mô phỏng chuỗi sự kiện người dùng có phạm vi an toàn)
  function applySolutionToDOM() {
    if (!latestSolution) return;

    // 1. Nếu là dạng điền từ: Chỉ điền vào ô câu hỏi tương ứng, tránh ghi đè mù toàn bộ form trên trang
    if (latestSolution.fill_in_text) {
      let targetInputs = [];
      if (parsedElements.inputElement && document.contains(parsedElements.inputElement)) {
        targetInputs = [parsedElements.inputElement];
      } else {
        const questionContainer = document.querySelector(".question-container, .question-content, .quiz-question, [data-testid='question'], .question, article.question, .quiz-item");
        if (questionContainer) {
          targetInputs = Array.from(questionContainer.querySelectorAll("input[type='text']:not(#apiKey), textarea, [contenteditable='true']"));
        }
      }

      targetInputs.forEach(inp => {
        if (widgetHost && widgetHost.contains(inp)) return;
        inp.focus();
        if (inp.isContentEditable) {
          inp.innerText = latestSolution.fill_in_text;
        } else {
          inp.value = latestSolution.fill_in_text;
        }
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }

    // 2. Click vào element đã được highlight (Universal Synthetic Click Event)
    const highlighted = document.querySelectorAll(".skillups-ai-highlighted-answer");
    if (highlighted.length > 0) {
      highlighted.forEach(el => {
        const input = el.querySelector("input[type='radio'], input[type='checkbox']") || el;
        
        // Chuỗi event kích hoạt đầy đủ để vượt qua React, Vue, Angular event handlers
        ["pointerdown", "mousedown", "focus", "pointerup", "mouseup", "click"].forEach(eventType => {
          const evt = new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            view: window,
            buttons: 1
          });
          input.dispatchEvent(evt);
        });

        // Đảm bảo checked state nếu là input radio/checkbox
        if (input.tagName === "INPUT" && (input.type === "radio" || input.type === "checkbox")) {
          input.checked = true;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    }

    const statusEl = getWidgetEl("ai-status");
    if (statusEl) {
      statusEl.innerHTML = "✅ <b>Đã chọn đáp án thành công!</b>";
    }
  }

  function clearHighlights() {
    document.querySelectorAll(".skillups-ai-highlighted-answer").forEach(el => {
      el.classList.remove("skillups-ai-highlighted-answer");
    });
    document.querySelectorAll(".skillups-ai-badge").forEach(el => el.remove());
  }

  // 5. Tính năng thu âm bài thi Listening (Mặc định TẮT, kích hoạt bằng Alt + L hoặc click nút)
  let isRecordingAudio = false;

  async function toggleAudioRecording() {
    const audioBtn = getWidgetEl("btn-audio-listen");
    const statusEl = getWidgetEl("ai-status");
    const expEl = getWidgetEl("ai-explanation");
    const applyBtn = getWidgetEl("btn-auto-apply");

    if (!isRecordingAudio) {
      // BẮT ĐẦU GHI ÂM TỪ TAB
      try {
        if (statusEl) statusEl.innerHTML = "🔴 <b>Đang thu âm thanh bài nghe...</b> (Bấm lại để dừng)";
        const res = await chrome.runtime.sendMessage({ action: "START_AUDIO_RECORDING" });
        if (res && res.success) {
          isRecordingAudio = true;
          if (audioBtn) {
            audioBtn.classList.add("recording");
            audioBtn.innerHTML = "⏹️ Dừng & Giải";
          }
        } else {
          if (statusEl) statusEl.textContent = `❌ Lỗi ghi âm: ${res?.error || "Không thể thu âm"}`;
        }
      } catch (err) {
        if (statusEl) statusEl.textContent = `❌ Lỗi: ${err.message}`;
      }
    } else {
      // DỪNG GHI ÂM VÀ GỬI GEMINI PHÂN TÍCH
      isRecordingAudio = false;
      if (audioBtn) {
        audioBtn.classList.remove("recording");
        audioBtn.innerHTML = "🎙️ Thu Âm";
      }

      if (statusEl) statusEl.textContent = "⏳ Đang phân tích đoạn nghe và ảnh chụp đề thi...";
      if (applyBtn) applyBtn.disabled = true;
      if (expEl) expEl.style.display = "none";

      if (widgetHost && isWidgetVisibleState) {
        widgetHost.style.display = "none";
      }
      await new Promise(r => setTimeout(r, 120));

      try {
        const response = await chrome.runtime.sendMessage({
          action: "STOP_AUDIO_AND_SOLVE"
        });

        // TUYỆT ĐỐI KHÔNG TỰ ĐỘNG HIỆN LẠI WIDGET SAU KHI CÓ RESPONSE!
        if (isWidgetVisibleState && widgetHost) {
          widgetHost.style.display = "block";
        }

        if (!response || !response.success) {
          if (statusEl) statusEl.textContent = `❌ Lỗi: ${response?.error || "Không có phản hồi từ AI"}`;
          return;
        }

        latestSolution = response.result;
        const rawLetters = (latestSolution.selected_option_letters || []).join(", ");
        const safeLetters = escapeHtml(rawLetters);
        const confidence = Math.round((latestSolution.confidence || 0.95) * 100);

        // Lưu lại ngữ cảnh nghe (transcript) để dùng cho các câu hỏi tiếp theo với Alt + S
        const contextToSave = latestSolution.full_audio_context || latestSolution.audio_transcript || "";
        if (contextToSave) {
          updateAudioContext(contextToSave);
        }

        if (statusEl) {
          statusEl.innerHTML = `🎧 <b>Đáp án bài nghe: [ ${safeLetters || "Đã chọn"} ]</b> (${confidence}%)`;
        }

        let detailHtml = "";
        if (contextToSave) {
          detailHtml += `<b>Ngữ cảnh nghe (Đã lưu cho Alt+S):</b> <i style="color:#fde047;">"${escapeHtml(contextToSave.slice(0, 180))}..."</i><br>`;
        }
        if (latestSolution.question_text) {
          detailHtml += `<b>Câu hỏi:</b> ${escapeHtml(latestSolution.question_text)}<br>`;
        }
        if (latestSolution.selected_option_texts && latestSolution.selected_option_texts.length > 0) {
          const safeOptions = latestSolution.selected_option_texts.map(t => escapeHtml(t)).join(" | ");
          detailHtml += `<b>Nội dung đáp án:</b> ${safeOptions}<br>`;
        }
        if (latestSolution.explanation) {
          detailHtml += `<b>Giải thích:</b> ${escapeHtml(latestSolution.explanation)}`;
        }

        if (expEl) {
          expEl.innerHTML = detailHtml;
          expEl.style.display = "block";
        }
        if (applyBtn) applyBtn.disabled = false;

        highlightAnswerOnScreen(latestSolution);

        chrome.storage.local.get({ mode: "semi-auto" }, (cfg) => {
          if (cfg.mode === "auto") {
            applySolutionToDOM();
          }
        });
      } catch (err) {
        if (isWidgetVisibleState && widgetHost) {
          widgetHost.style.display = "block";
        }
        if (statusEl) statusEl.textContent = `❌ Lỗi phân tích: ${err.message}`;
      }
    }
  }

  // 6. Tính năng gợi ý Kịch Bản Bài Nói theo Level (Speaking Teleprompter)
  let latestSpeakingData = null;
  let currentSpeakingLevel = "b1-b2";
  let isSpeakingTTSActive = false;
  let currentSpeechUtterance = null;

  function setActiveSpeakingLevel(lvl) {
    currentSpeakingLevel = lvl || "b1-b2";
    ["a2", "b1-b2", "c1-c2"].forEach(l => {
      const pill = getWidgetEl(`sp-pill-${l}`);
      if (pill) {
        if (l === currentSpeakingLevel) {
          pill.classList.add("active");
        } else {
          pill.classList.remove("active");
        }
      }
    });
    try {
      chrome.storage.local.set({ speakingLevel: currentSpeakingLevel });
    } catch (e) {}
  }

  function showSpeakingTeleprompter() {
    const teleprompter = getWidgetEl("ancestral-speaking-teleprompter");
    if (teleprompter) {
      teleprompter.style.display = "flex";
    }
    if (widgetHost) {
      widgetHost.style.display = "block";
    }
  }

  function hideSpeakingTeleprompter() {
    const teleprompter = getWidgetEl("ancestral-speaking-teleprompter");
    if (teleprompter) {
      teleprompter.style.display = "none";
    }
    stopSpeakingTTS();
  }

  function switchSpeakingTab(tabName) {
    ["script", "outline", "vocab"].forEach(t => {
      const tabBtn = getWidgetEl(`sp-tab-${t}`);
      const pane = getWidgetEl(`sp-pane-${t}`);
      if (tabBtn) {
        if (t === tabName) {
          tabBtn.classList.add("active");
        } else {
          tabBtn.classList.remove("active");
        }
      }
      if (pane) {
        pane.style.display = t === tabName ? "flex" : "none";
      }
    });
  }

  function renderSpeakingData(data) {
    if (!data) return;
    latestSpeakingData = data;

    // 1. Topic & Meta
    const topicEl = getWidgetEl("sp-topic-title");
    if (topicEl) {
      const cleanTopic = data.topic || "Đề bài Speaking";
      topicEl.textContent = `📌 ${cleanTopic}`;
      topicEl.title = cleanTopic;
    }

    const timeEl = getWidgetEl("sp-time-badge");
    if (timeEl) {
      timeEl.textContent = data.estimated_time || `⏱️ ~60s (${data.word_count || 110} từ)`;
    }

    const taskEl = getWidgetEl("sp-task-badge");
    if (taskEl) {
      taskEl.textContent = `🎯 ${data.task_type || "Speaking"}`;
    }

    // 2. Active level
    if (data.level) {
      setActiveSpeakingLevel(data.level);
    }

    // 3. Script text với các dấu ngắt nhịp |
    const scriptEl = getWidgetEl("sp-script-content");
    if (scriptEl) {
      const rawScript = data.script || "";
      const escaped = escapeHtml(rawScript);
      const highlightedScript = escaped.replace(/\|/g, `<span class="sp-pause" title="Ngắt hơi / lấy nhịp tự nhiên">|</span>`);
      scriptEl.innerHTML = highlightedScript;
    }

    // 4. Vietnamese Translation
    const transEl = getWidgetEl("sp-translation-content");
    if (transEl) {
      transEl.innerHTML = `<b>🇻🇳 Bản dịch tiếng Việt:</b><br>${escapeHtml(data.vietnamese_translation || "Chưa có bản dịch.")}`;
    }

    // 5. Outline list
    const outlineEl = getWidgetEl("sp-outline-list");
    if (outlineEl) {
      outlineEl.innerHTML = "";
      const outlineItems = data.outline || [];
      if (outlineItems.length > 0) {
        outlineItems.forEach(item => {
          const div = document.createElement("div");
          div.className = "sp-outline-item";
          div.textContent = item;
          outlineEl.appendChild(div);
        });
      } else {
        outlineEl.innerHTML = `<div style="font-size:11px; color:#94a3b8;">Không có dàn ý chi tiết.</div>`;
      }
    }

    // 6. Key Vocabulary & Pronunciation Tips
    const vocabEl = getWidgetEl("sp-vocab-list");
    if (vocabEl) {
      vocabEl.innerHTML = "";
      const vocabList = data.key_vocabulary || [];
      if (vocabList.length > 0) {
        vocabList.forEach(v => {
          const vDiv = document.createElement("div");
          vDiv.className = "sp-vocab-item";
          vDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="sp-vocab-word">${escapeHtml(v.word || "")}</span>
              <span class="sp-vocab-phonetic">${escapeHtml(v.phonetic || "")}</span>
            </div>
            <div class="sp-vocab-meaning">${escapeHtml(v.meaning || "")}</div>
          `;
          vocabEl.appendChild(vDiv);
        });
      } else {
        vocabEl.innerHTML = `<div style="font-size:11px; color:#94a3b8;">Không có từ vựng riêng.</div>`;
      }
    }

    const tipsEl = getWidgetEl("sp-pronunciation-tips");
    if (tipsEl) {
      tipsEl.innerHTML = `💡 <b>Mẹo phát âm & ngữ điệu:</b><br>${escapeHtml(data.pronunciation_tips || "Hãy phát âm tự tin, ngắt nhịp đúng vị trí và giữ ngữ điệu tự nhiên.")}`;
    }
  }

  async function generateSpeakingScript(levelOverride) {
    const targetLevel = levelOverride || currentSpeakingLevel || "b1-b2";
    setActiveSpeakingLevel(targetLevel);

    const statusEl = getWidgetEl("ai-status");
    if (statusEl) {
      statusEl.innerHTML = `🗣️ <b>Đang chụp đề & soạn kịch bản nói [${targetLevel.toUpperCase()}]...</b>`;
    }

    // Mở khung teleprompter với thông báo đang tải
    showSpeakingTeleprompter();
    switchSpeakingTab("script");

    const scriptEl = getWidgetEl("sp-script-content");
    if (scriptEl) {
      scriptEl.innerHTML = `<div style="color:#a78bfa; font-size:13px; font-weight:600; text-align:center; padding:16px;">⏳ Đang phân tích đề bài & chuẩn bị bài nói chuẩn level <b>${targetLevel.toUpperCase()}</b>...</div>`;
    }

    // Tạm ẩn widget 120ms để chụp ảnh viewport sạch
    if (widgetHost) widgetHost.style.display = "none";
    await new Promise(r => setTimeout(r, 120));

    try {
      const response = await chrome.runtime.sendMessage({
        action: "GENERATE_SPEAKING_SCRIPT",
        speakingLevel: targetLevel
      });

      if (widgetHost) widgetHost.style.display = "block";
      showSpeakingTeleprompter();

      if (!response || !response.success) {
        const errMsg = response?.error || "Không thể tạo kịch bản nói.";
        if (statusEl) statusEl.textContent = `❌ Lỗi bài nói: ${errMsg}`;
        if (scriptEl) {
          scriptEl.innerHTML = `<div style="color:#f87171; font-size:12px;">❌ <b>Lỗi:</b> ${escapeHtml(errMsg)}</div>`;
        }
        return;
      }

      renderSpeakingData(response.result);

      if (statusEl) {
        statusEl.innerHTML = `🗣️ <b>Đã tạo kịch bản nói:</b> ${response.result.level_label || targetLevel.toUpperCase()} (${response.result.estimated_time || "~60s"})`;
      }
    } catch (err) {
      if (widgetHost) widgetHost.style.display = "block";
      showSpeakingTeleprompter();
      if (statusEl) statusEl.textContent = `❌ Lỗi: ${err.message}`;
      if (scriptEl) {
        scriptEl.innerHTML = `<div style="color:#f87171; font-size:12px;">❌ <b>Lỗi gửi yêu cầu:</b> ${escapeHtml(err.message)}</div>`;
      }
    }
  }

  function copySpeakingScript() {
    if (!latestSpeakingData || !latestSpeakingData.script) return;
    const cleanScript = latestSpeakingData.script.replace(/\|/g, "").replace(/\s+/g, " ").trim();
    navigator.clipboard.writeText(cleanScript).then(() => {
      const copyBtn = getWidgetEl("sp-btn-copy");
      if (copyBtn) {
        const oldText = copyBtn.textContent;
        copyBtn.textContent = "✓ Đã Chép!";
        copyBtn.style.background = "#059669";
        setTimeout(() => {
          copyBtn.textContent = oldText;
          copyBtn.style.background = "#10b981";
        }, 2000);
      }
    }).catch(err => {
      console.warn("Clipboard write failed:", err);
    });
  }

  function stopSpeakingTTS() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isSpeakingTTSActive = false;
    currentSpeechUtterance = null;
    const ttsBtn = getWidgetEl("sp-btn-tts");
    if (ttsBtn) {
      ttsBtn.classList.remove("playing");
      ttsBtn.innerHTML = "🔊 Nghe Đọc Mẫu";
    }
  }

  function toggleSpeakingTTS() {
    if (isSpeakingTTSActive) {
      stopSpeakingTTS();
      return;
    }

    if (!latestSpeakingData || !latestSpeakingData.script) return;
    if (!('speechSynthesis' in window)) {
      alert("Trình duyệt không hỗ trợ Web Speech API.");
      return;
    }

    stopSpeakingTTS();

    const cleanScript = latestSpeakingData.script.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
    const utterance = new SpeechSynthesisUtterance(cleanScript);
    utterance.lang = "en-US";
    utterance.rate = 0.92;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Daniel"))) || voices.find(v => v.lang.startsWith("en"));
    if (enVoice) {
      utterance.voice = enVoice;
    }

    utterance.onend = () => stopSpeakingTTS();
    utterance.onerror = () => stopSpeakingTTS();

    isSpeakingTTSActive = true;
    currentSpeechUtterance = utterance;

    const ttsBtn = getWidgetEl("sp-btn-tts");
    if (ttsBtn) {
      ttsBtn.classList.add("playing");
      ttsBtn.innerHTML = "⏹️ Dừng Đọc";
    }

    window.speechSynthesis.speak(utterance);
  }

  // 7. Phím tắt (Hỗ trợ cả Windows Alt và MacBook Option ⌥): 
  // Alt + S (MacBook: Option + S): Chụp màn hình giải bài đọc/trắc nghiệm
  // Alt + L (MacBook: Option + L): Bật/Tắt thu âm giải bài Listening (Mặc định tắt)
  // Alt + K (MacBook: Option + K): Gợi ý kịch bản bài nói Speaking theo level
  // Alt + H (MacBook: Option + H): Ẩn / Hiện Widget nhanh
  window.addEventListener("keydown", (e) => {
    const isAltOrOption = e.altKey;
    if (!isAltOrOption) return;

    // Dùng e.code để tránh lỗi macOS biến ký tự thành 'ß', '¬', '˚', '˙' khi bấm Option
    if (e.code === "KeyS" || e.key === "s" || e.key === "S" || e.key === "ß") {
      e.preventDefault();
      captureAndSolveCurrentScreen();
    } else if (e.code === "KeyL" || e.key === "l" || e.key === "L" || e.key === "¬") {
      e.preventDefault();
      toggleAudioRecording();
    } else if (e.code === "KeyK" || e.key === "k" || e.key === "K" || e.key === "˚") {
      e.preventDefault();
      generateSpeakingScript();
    } else if (e.code === "KeyH" || e.key === "h" || e.key === "H" || e.key === "˙") {
      e.preventDefault();
      setWidgetVisibility(!isWidgetVisibleState);
    }
  });

  // Khởi tạo Widget
  createFloatingWidget();
})();
