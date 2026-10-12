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

  function updateAudioContext(contextText) {
    cachedAudioContext = contextText || "";
    const badge = document.getElementById("audio-context-badge");
    const snippet = document.getElementById("audio-context-snippet");
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
    const statusEl = document.getElementById("ai-status");
    if (statusEl) {
      statusEl.textContent = "🗑️ Đã xóa ngữ cảnh bài nghe.";
    }
  }

  // 1. Tạo floating widget điều khiển trực tiếp trên trang
  function createFloatingWidget() {
    if (document.getElementById("skillups-ai-widget")) return;

    const widget = document.createElement("div");
    widget.id = "skillups-ai-widget";
    widget.innerHTML = `
      <div class="widget-header" id="widget-toggle">
        <span class="widget-title">🔮 AncestralWhisper</span>
        <span id="widget-minimize">▼</span>
      </div>
      <div class="widget-body" id="widget-content">
        <div class="status-badge" id="ai-status">Sẵn sàng (Phím tắt: Alt + S)</div>
        <div id="audio-context-badge" style="display:none; background:#1e1b4b; border:1px solid #6366f1; border-radius:4px; padding:4px 8px; font-size:11px; color:#c7d2fe; display:flex; justify-content:space-between; align-items:center;">
          <span>🎧 <b>Ngữ cảnh nghe:</b> <span id="audio-context-snippet">Đã lưu</span></span>
          <span id="btn-clear-audio-context" style="cursor:pointer; color:#ef4444; font-weight:bold; margin-left:6px;" title="Xóa ngữ cảnh audio để làm bài mới">✕</span>
        </div>
        <div class="explanation-box" id="ai-explanation" style="display:none;"></div>
        <div class="action-buttons">
          <button class="ai-btn btn-solve" id="btn-scan-solve" title="Chụp màn hình giải bài (Tự động kèm ngữ cảnh nghe nếu có)">📸 Chụp & Giải</button>
          <button class="ai-btn btn-audio" id="btn-audio-listen" title="Ghi âm bài nghe Listening">🎙️ Thu Âm</button>
          <button class="ai-btn btn-apply" id="btn-auto-apply" disabled>✅ Chọn</button>
        </div>
      </div>
    `;

    document.body.appendChild(widget);

    // Toggle minimize
    document.getElementById("widget-toggle").addEventListener("click", () => {
      const content = document.getElementById("widget-content");
      const isHidden = content.style.display === "none";
      content.style.display = isHidden ? "flex" : "none";
      document.getElementById("widget-minimize").textContent = isHidden ? "▼" : "▲";
    });

    // Button actions
    document.getElementById("btn-scan-solve").addEventListener("click", captureAndSolveCurrentScreen);
    document.getElementById("btn-audio-listen").addEventListener("click", toggleAudioRecording);
    document.getElementById("btn-auto-apply").addEventListener("click", applySolutionToDOM);

    // Nút xóa audio context
    document.getElementById("btn-clear-audio-context").addEventListener("click", (e) => {
      e.stopPropagation();
      clearAudioContext();
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
    const statusEl = document.getElementById("ai-status");
    const expEl = document.getElementById("ai-explanation");
    const applyBtn = document.getElementById("btn-auto-apply");
    const widget = document.getElementById("skillups-ai-widget");

    // Ẩn tạm thời widget trong 100ms để không bị dính vào ảnh chụp màn hình
    if (widget) widget.style.opacity = "0";

    statusEl.textContent = "📸 Đang chụp màn hình & phân tích đề thi...";
    applyBtn.disabled = true;
    expEl.style.display = "none";
    clearHighlights();

    // Chờ 100ms để render ẩn widget
    await new Promise(r => setTimeout(r, 120));

    try {
      const response = await chrome.runtime.sendMessage({
        action: "CAPTURE_AND_SOLVE",
        audioContext: cachedAudioContext || ""
      });

      // Hiện lại widget sau khi đã chụp
      if (widget) widget.style.opacity = "1";

      if (!response || !response.success) {
        statusEl.textContent = `❌ Lỗi: ${response?.error || "Không có phản hồi từ AI"}`;
        return;
      }

      latestSolution = response.result;
      const letters = (latestSolution.selected_option_letters || []).join(", ");
      const confidence = Math.round((latestSolution.confidence || 0.95) * 100);

      const contextIndicator = cachedAudioContext ? " 🎧 (Kèm ngữ cảnh nghe)" : "";
      statusEl.innerHTML = `💡 <b>Đáp án: [ ${letters || "Đã chọn"} ]</b> (${confidence}%)${contextIndicator}`;

      let detailHtml = "";
      if (cachedAudioContext) {
        detailHtml += `<div style="background:#312e81; padding:4px 6px; border-radius:4px; margin-bottom:6px; font-size:10px; color:#a5b4fc;">🎧 <b>Đã áp dụng ngữ cảnh nghe trước đó để giải câu này</b></div>`;
      }
      if (latestSolution.question_text) {
        detailHtml += `<b>Câu hỏi:</b> ${latestSolution.question_text}<br>`;
      }
      if (latestSolution.selected_option_texts && latestSolution.selected_option_texts.length > 0) {
        detailHtml += `<b>Nội dung:</b> ${latestSolution.selected_option_texts.join(" | ")}<br>`;
      }
      if (latestSolution.fill_in_text) {
        detailHtml += `<b>Điền từ:</b> ${latestSolution.fill_in_text}<br>`;
      }
      if (latestSolution.source_citation) {
        detailHtml += `<div style="background:#064e3b; border-left:3px solid #10b981; padding:4px 6px; border-radius:4px; margin:4px 0; font-size:11px; color:#a7f3d0;">📖 <b>Trích dẫn tài liệu gốc:</b><br><i>"${latestSolution.source_citation}"</i></div>`;
      }
      if (latestSolution.explanation) {
        detailHtml += `<b>Giải thích:</b> ${latestSolution.explanation}`;
      }

      expEl.innerHTML = detailHtml;
      expEl.style.display = "block";
      applyBtn.disabled = false;

      // Tìm và highlight đáp án trên trang dựa vào chữ hoặc ký tự A/B/C/D
      highlightAnswerOnScreen(latestSolution);

      // Nếu cấu hình là Auto thì tự động click luôn
      chrome.storage.local.get({ mode: "semi-auto" }, (cfg) => {
        if (cfg.mode === "auto") {
          applySolutionToDOM();
        }
      });
    } catch (err) {
      if (widget) widget.style.opacity = "1";
      statusEl.textContent = `❌ Lỗi: ${err.message}`;
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
      if (el.closest("#skillups-ai-widget")) return;

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

  // 4. Áp dụng đáp án vào trang web (Mô phỏng chuỗi sự kiện người dùng toàn diện)
  function applySolutionToDOM() {
    if (!latestSolution) return;

    // 1. Nếu là dạng điền từ
    if (latestSolution.fill_in_text) {
      const inputs = document.querySelectorAll("input[type='text']:not(#apiKey), input:not([type]), textarea, [contenteditable='true']");
      inputs.forEach(inp => {
        if (!inp.closest("#skillups-ai-widget")) {
          inp.focus();
          if (inp.isContentEditable) {
            inp.innerText = latestSolution.fill_in_text;
          } else {
            inp.value = latestSolution.fill_in_text;
          }
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
        }
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

    const statusEl = document.getElementById("ai-status");
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
    const audioBtn = document.getElementById("btn-audio-listen");
    const statusEl = document.getElementById("ai-status");
    const expEl = document.getElementById("ai-explanation");
    const applyBtn = document.getElementById("btn-auto-apply");
    const widget = document.getElementById("skillups-ai-widget");

    if (!isRecordingAudio) {
      // BẮT ĐẦU GHI ÂM TỪ TAB
      try {
        statusEl.innerHTML = "🔴 <b>Đang thu âm thanh bài nghe...</b> (Bấm lại để dừng)";
        const res = await chrome.runtime.sendMessage({ action: "START_AUDIO_RECORDING" });
        if (res && res.success) {
          isRecordingAudio = true;
          audioBtn.classList.add("recording");
          audioBtn.innerHTML = "⏹️ Dừng & Giải";
        } else {
          statusEl.textContent = `❌ Lỗi ghi âm: ${res?.error || "Không thể thu âm"}`;
        }
      } catch (err) {
        statusEl.textContent = `❌ Lỗi: ${err.message}`;
      }
    } else {
      // DỪNG GHI ÂM VÀ GỬI GEMINI PHÂN TÍCH
      isRecordingAudio = false;
      audioBtn.classList.remove("recording");
      audioBtn.innerHTML = "🎙️ Thu Âm";

      statusEl.textContent = "⏳ Đang phân tích đoạn nghe và ảnh chụp đề thi...";
      applyBtn.disabled = true;
      expEl.style.display = "none";

      if (widget) widget.style.opacity = "0";
      await new Promise(r => setTimeout(r, 120));

      try {
        const response = await chrome.runtime.sendMessage({
          action: "STOP_AUDIO_AND_SOLVE"
        });

        if (widget) widget.style.opacity = "1";

        if (!response || !response.success) {
          statusEl.textContent = `❌ Lỗi: ${response?.error || "Không có phản hồi từ AI"}`;
          return;
        }

        latestSolution = response.result;
        const letters = (latestSolution.selected_option_letters || []).join(", ");
        const confidence = Math.round((latestSolution.confidence || 0.95) * 100);

        // Lưu lại ngữ cảnh nghe (transcript) để dùng cho các câu hỏi tiếp theo với Alt + S
        const contextToSave = latestSolution.full_audio_context || latestSolution.audio_transcript || "";
        if (contextToSave) {
          updateAudioContext(contextToSave);
        }

        statusEl.innerHTML = `🎧 <b>Đáp án bài nghe: [ ${letters || "Đã chọn"} ]</b> (${confidence}%)`;

        let detailHtml = "";
        if (contextToSave) {
          detailHtml += `<b>Ngữ cảnh nghe (Đã lưu cho Alt+S):</b> <i style="color:#fde047;">"${contextToSave.slice(0, 180)}..."</i><br>`;
        }
        if (latestSolution.question_text) {
          detailHtml += `<b>Câu hỏi:</b> ${latestSolution.question_text}<br>`;
        }
        if (latestSolution.selected_option_texts && latestSolution.selected_option_texts.length > 0) {
          detailHtml += `<b>Nội dung đáp án:</b> ${latestSolution.selected_option_texts.join(" | ")}<br>`;
        }
        if (latestSolution.explanation) {
          detailHtml += `<b>Giải thích:</b> ${latestSolution.explanation}`;
        }

        expEl.innerHTML = detailHtml;
        expEl.style.display = "block";
        applyBtn.disabled = false;

        highlightAnswerOnScreen(latestSolution);

        chrome.storage.local.get({ mode: "semi-auto" }, (cfg) => {
          if (cfg.mode === "auto") {
            applySolutionToDOM();
          }
        });
      } catch (err) {
        if (widget) widget.style.opacity = "1";
        statusEl.textContent = `❌ Lỗi phân tích: ${err.message}`;
      }
    }
  }

  // 6. Phím tắt: 
  // Alt + S: Chụp màn hình giải bài đọc/trắc nghiệm
  // Alt + L: Bật/Tắt thu âm giải bài Listening (Mặc định tắt)
  // Alt + H: Ẩn / Hiện Widget nhanh (dành cho khi lướt web thông thường)
  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      captureAndSolveCurrentScreen();
    }
    if (e.altKey && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      toggleAudioRecording();
    }
    if (e.altKey && (e.key === "h" || e.key === "H")) {
      e.preventDefault();
      const widget = document.getElementById("skillups-ai-widget");
      if (widget) {
        widget.style.display = widget.style.display === "none" ? "flex" : "none";
      }
    }
  });

  // Khởi tạo Widget
  createFloatingWidget();
})();
