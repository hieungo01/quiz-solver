// Background Service Worker (Manifest V3)
// Xử lý bảo mật, tự động quản lý model và fallback khi quá tải

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Cache danh sách models khả dụng trong phiên làm việc
let cachedAvailableModels = [];

// Lắng nghe messages từ Popup hoặc Content Script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TEST_CONNECTION") {
    handleTestConnection(request.apiKey, request.model)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (request.action === "LIST_MODELS") {
    fetchAvailableModels(request.apiKey)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "CAPTURE_AND_SOLVE") {
    handleCaptureAndSolve(sender.tab?.windowId, request.audioContext)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "START_AUDIO_RECORDING") {
    startAudioCapture(sender.tab?.id)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "STOP_AUDIO_AND_SOLVE") {
    stopAudioAndSolve(sender.tab?.windowId)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "SOLVE_QUESTION") {
    handleSolveQuestion(request.payload)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

/**
 * Lấy danh sách các model đang thực sự hoạt động trên tài khoản Google AI Studio
 */
async function fetchAvailableModels(apiKey) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message || `HTTP ${res.status}`);
    }

    // Lọc các model hỗ trợ sinh nội dung text/json
    const supported = (data.models || [])
      .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
      .map(m => m.name.replace("models/", ""));

    // Ưu tiên xếp các model flash lên đầu vì tốc độ nhanh & ít bị giới hạn quota
    supported.sort((a, b) => {
      const aIsFlash = a.includes("flash") ? 1 : 0;
      const bIsFlash = b.includes("flash") ? 1 : 0;
      return bIsFlash - aIsFlash;
    });

    cachedAvailableModels = supported;
    return { success: true, models: supported };
  } catch (err) {
    return { success: false, error: err.message, models: [] };
  }
}

/**
 * Kiểm tra xem một lỗi có phải do quá tải/quota/không khả dụng hay không
 */
function isOverloadedOrUnavailable(status, errMsg = "") {
  const msg = errMsg.toLowerCase();
  return (
    status === 503 ||
    status === 429 ||
    status === 404 ||
    msg.includes("demand") ||
    msg.includes("quota") ||
    msg.includes("overloaded") ||
    msg.includes("rate limit") ||
    msg.includes("longer available") ||
    msg.includes("not found")
  );
}

/**
 * Lấy danh sách model ứng viên để tự động thử nghiệm
 */
async function getCandidateModels(apiKey, preferredModel = "gemini-3.8-flash") {
  let list = [];
  if (preferredModel && preferredModel !== "auto") {
    list.push(preferredModel.replace("models/", ""));
  }

  // Nếu chưa có cache models, tự động gọi list models
  if (cachedAvailableModels.length === 0) {
    const res = await fetchAvailableModels(apiKey);
    if (res.success && res.models.length > 0) {
      list.push(...res.models);
    }
  } else {
    list.push(...cachedAvailableModels);
  }

  // Fallback danh sách mặc định phòng trường hợp mạng chậm không fetch được list
  const defaults = ["gemini-3.8-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];
  list.push(...defaults);

  // Loại bỏ trùng lặp
  return [...new Set(list)];
}

/**
 * Kiểm tra kết nối tới Gemini API (Tự động tìm model chạy tốt nhất)
 */
async function handleTestConnection(apiKey, model = "auto") {
  const candidates = await getCandidateModels(apiKey, model);
  let lastError = null;

  for (const currentModel of candidates) {
    try {
      const url = `${GEMINI_API_BASE}/${currentModel}:generateContent?key=${apiKey}`;
      const requestBody = {
        contents: [{ parts: [{ text: "Ping" }] }]
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      const data = await res.json();
      if (res.ok) {
        return {
          success: true,
          activeModel: currentModel,
          note: currentModel !== model && model !== "auto" ? `(Model ${model} đang bận, đã tự chuyển sang ${currentModel})` : `(Đang dùng: ${currentModel})`
        };
      }

      const errMsg = data.error?.message || `HTTP ${res.status}`;
      lastError = errMsg;

      if (isOverloadedOrUnavailable(res.status, errMsg)) {
        console.warn(`[Test] Model ${currentModel} quá tải hoặc bận: ${errMsg}. Thử model khác...`);
        continue;
      } else {
        // Sai API key hoặc lỗi nghiêm trọng
        throw new Error(errMsg);
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  throw new Error(lastError || "Tất cả các model đều đang quá tải. Vui lòng thử lại sau.");
}

/**
 * CHỤP MÀN HÌNH TỰ ĐỘNG & GỌI GEMINI MULTIMODAL VISION
 * Hỗ trợ kế thừa Audio Context từ bài nghe Listening trước đó
 */
async function handleCaptureAndSolve(windowId, audioContext = "") {
  const config = await chrome.storage.local.get({
    geminiApiKey: "",
    geminiModel: "auto",
    enabled: true,
    sourceMode: false,
    sourceContent: "",
    sourceName: ""
  });

  if (!config.enabled) {
    return { success: false, error: "Extension đang bị tắt trong cài đặt." };
  }

  const apiKey = config.geminiApiKey;
  if (!apiKey) {
    return { success: false, error: "Chưa cấu hình Gemini API Key trong Popup." };
  }

  // 1. Chụp ảnh màn hình viewport hiện tại bằng chrome API
  let screenshotUrl;
  try {
    let targetWindowId = windowId;
    if (!targetWindowId) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      targetWindowId = activeTab?.windowId || null;
    }

    screenshotUrl = await chrome.tabs.captureVisibleTab(targetWindowId, {
      format: "jpeg",
      quality: 85
    });
  } catch (err) {
    throw new Error(`Không thể chụp màn hình: ${err.message}.`);
  }

  if (!screenshotUrl) {
    throw new Error("Chụp ảnh màn hình trả về rỗng.");
  }

  // Tách Base64 từ Data URL (data:image/jpeg;base64,....)
  const base64Data = screenshotUrl.replace(/^data:image\/(jpeg|png);base64,/, "");

  // 2. Thiết kế System Instruction chuyên dụng (Hỗ trợ Grounded RAG / NotebookLM Mode)
  let systemInstruction = `
Bạn là một AI giám khảo chuyên giải đề thi trắc nghiệm bằng cách đọc ảnh chụp màn hình trực tiếp.
Nhiệm vụ của bạn:
1. Quan sát kỹ toàn bộ ảnh chụp màn hình đề thi/câu hỏi hiện tại.
2. Trích xuất nội dung câu hỏi và các phương án trả lời hiển thị trên màn hình.
3. Nếu có sơ đồ, mã nguồn, hình ảnh minh họa trong câu hỏi, hãy phân tích kỹ.
4. Xác định đáp án chính xác nhất.
`.trim();

  if (config.sourceMode && config.sourceContent) {
    systemInstruction += `\n\nCHẾ ĐỘ NOTEBOOKLM (SOURCE-GROUNDED MODE):
- Bạn được cung cấp một TÀI LIỆU NGUỒN GỐC (Knowledge Source: ${config.sourceName || "Tài liệu ôn tập"}).
- BẮT BUỘC bạn phải tìm kiếm và đối chiếu câu hỏi/đáp án dựa trên nội dung TÀI LIỆU NGUỒN này.
- Trong kết quả trả về, bạn PHẢI trích dẫn câu văn/đoạn trích chính xác từ tài liệu làm bằng chứng vào trường "source_citation".`;
  }

  if (audioContext) {
    systemInstruction += `\n\nLƯU Ý ĐẶC BIỆT: Đây là câu hỏi liên quan đến bài nghe Listening. Hãy sử dụng NGỮ CẢNH BÀI NGHE (AUDIO TRANSCRIPT) được cung cấp dưới đây để đối chiếu với câu hỏi trên ảnh và đưa ra đáp án chính xác nhất.`;
  }

  systemInstruction += `\n\nBẮT BUỘC TRẢ VỀ ĐÚNG ĐỊNH DẠNG JSON SCHEMA SAU (Không kèm markdown khác):
{
  "question_text": "Nội dung tóm tắt câu hỏi đọc được từ ảnh",
  "question_type": "single_choice" | "multiple_choice" | "fill_in_the_blank",
  "selected_option_letters": ["A"],
  "selected_option_texts": ["Dòng chữ chính xác của đáp án được chọn để match trên trang web"],
  "source_citation": "Trích đoạn nguyên văn chứng minh từ tài liệu nguồn (nếu có)",
  "fill_in_text": "Nội dung cần điền nếu là câu hỏi điền từ",
  "explanation": "Giải thích ngắn gọn 1-2 câu lý do chọn",
  "confidence": 0.95
}
Quy tắc:
- "selected_option_letters": Mảng chứa các ký tự như "A", "B", "C", "D" hoặc "1", "2", "3", "4" tương ứng với đáp án đúng.
- "selected_option_texts": Mảng chứa chuỗi chữ nguyên văn của phương án đúng để extension tự động tìm và click trên trang.
`;

  const parts = [
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Data
      }
    }
  ];

  let promptContextText = "";

  if (config.sourceMode && config.sourceContent) {
    promptContextText += `[TÀI LIỆU NGUỒN ÔN TẬP GỐC (${config.sourceName || "Source"})]:\n"""\n${config.sourceContent}\n"""\n\n`;
  }

  if (audioContext) {
    promptContextText += `[NGỮ CẢNH BÀI NGHE ĐÃ THU ĐƯỢC TRƯỚC ĐÓ]:\n"""\n${audioContext}\n"""\n\n`;
  }

  if (promptContextText) {
    parts.push({
      text: `${promptContextText}Hãy đọc ảnh chụp màn hình câu hỏi hiện tại, đối chiếu với tài liệu/ngữ cảnh trên để chọn đáp án đúng theo JSON schema.`
    });
  } else {
    parts.push({
      text: "Hãy đọc ảnh chụp màn hình này, xác định câu hỏi hiện tại và đưa ra đáp án chính xác theo JSON schema."
    });
  }

  const requestBody = {
    contents: [{ parts: parts }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  };

  const candidates = await getCandidateModels(apiKey, config.geminiModel);
  let lastError = null;

  for (const currentModel of candidates) {
    try {
      const targetUrl = `${GEMINI_API_BASE}/${currentModel}:generateContent?key=${apiKey}`;
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      if (!response.ok) {
        const errMsg = data.error?.message || `HTTP ${response.status}`;
        if (isOverloadedOrUnavailable(response.status, errMsg)) {
          console.warn(`[Vision Solve] Model ${currentModel} quá tải: ${errMsg}. Thử model khác...`);
          lastError = errMsg;
          continue;
        }
        throw new Error(errMsg);
      }

      const rawAnswer = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawAnswer) continue;

      try {
        const parsed = JSON.parse(rawAnswer);
        return { success: true, result: parsed, activeModel: currentModel };
      } catch (err) {
        const cleanJson = rawAnswer.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleanJson);
        return { success: true, result: parsed, activeModel: currentModel };
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  throw new Error(lastError || "Tất cả các model đều đang bận. Vui lòng thử lại sau.");
}

/**
 * Đảm bảo Offscreen Document đã được khởi tạo
 */
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Ghi âm âm thanh từ tab bài thi Listening để phân tích bằng AI'
  });
}

/**
 * Bắt đầu thu âm thanh từ Tab
 */
async function startAudioCapture(tabId) {
  let targetTabId = tabId;
  if (!targetTabId) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    targetTabId = activeTab?.id;
  }

  await ensureOffscreenDocument();

  // Lấy stream ID của tab
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: targetTabId
  });

  // Gửi lệnh cho offscreen document bắt đầu ghi âm
  const response = await chrome.runtime.sendMessage({
    type: "START_RECORDING",
    target: "offscreen",
    streamId: streamId
  });

  if (!response?.success) {
    throw new Error(response?.error || "Không thể khởi động ghi âm audio từ Tab.");
  }

  return { success: true };
}

/**
 * Dừng thu âm, chụp ảnh màn hình và gửi cả Audio + Image tới Gemini
 */
async function stopAudioAndSolve(windowId) {
  // 1. Dừng ghi âm và nhận chuỗi base64 Audio từ Offscreen
  const audioResponse = await chrome.runtime.sendMessage({
    type: "STOP_RECORDING",
    target: "offscreen"
  });

  const base64Audio = audioResponse?.base64Audio || "";

  // 2. Chụp ảnh màn hình đề thi hiện tại
  let targetWindowId = windowId;
  if (!targetWindowId) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    targetWindowId = activeTab?.windowId || null;
  }

  const screenshotUrl = await chrome.tabs.captureVisibleTab(targetWindowId, {
    format: "jpeg",
    quality: 85
  });

  const base64Image = screenshotUrl.replace(/^data:image\/(jpeg|png);base64,/, "");

  // 3. Đóng offscreen document sau khi xong
  try {
    await chrome.offscreen.closeDocument();
  } catch (e) {}

  // 4. Gửi cả Audio + Vision tới Gemini API
  return await callGeminiMultimodalAudioAndVision(base64Image, base64Audio);
}

/**
 * Gửi cả Hình Ảnh + File Âm Thanh tới Gemini API
 */
async function callGeminiMultimodalAudioAndVision(base64Image, base64Audio) {
  const config = await chrome.storage.local.get({
    geminiApiKey: "",
    geminiModel: "auto",
    enabled: true
  });

  const apiKey = config.geminiApiKey;
  if (!apiKey) {
    throw new Error("Chưa cấu hình Gemini API Key.");
  }

  const systemInstruction = `
Bạn là chuyên gia giải đề thi Tiếng Anh / Listening & Reading toàn diện.
Nhiệm vụ của bạn:
1. Bạn được cung cấp:
   - Một đoạn âm thanh bài nghe (Audio Listening) thu trực tiếp từ bài thi.
   - Một ảnh chụp màn hình hiển thị câu hỏi và các phương án trả lời.
2. Hãy nghe thật kỹ đoạn âm thanh, phiên âm lại ngữ cảnh và đối chiếu với câu hỏi trên ảnh chụp.
3. Chọn đáp án chính xác nhất.

BẮT BUỘC TRẢ VỀ ĐÚNG ĐỊNH DẠNG JSON SCHEMA:
{
  "question_text": "Nội dung câu hỏi đọc từ ảnh",
  "question_type": "single_choice" | "multiple_choice" | "fill_in_the_blank",
  "audio_transcript": "Tóm tắt 1-2 câu quan trọng liên quan đến câu hỏi này",
  "full_audio_context": "Phiên âm (transcript) hoặc tóm tắt đầy đủ toàn bộ nội dung đoạn hội thoại/bài nói để phục vụ trả lời các câu hỏi tiếp theo",
  "selected_option_letters": ["A"],
  "selected_option_texts": ["Dòng chữ chính xác của đáp án được chọn"],
  "fill_in_text": "Nội dung cần điền nếu là dạng điền từ",
  "explanation": "Giải thích tại sao audio dẫn tới đáp án này",
  "confidence": 0.95
}
`.trim();

  const parts = [];

  // Thêm ảnh đề thi
  if (base64Image) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Image
      }
    });
  }

  // Thêm file âm thanh vừa ghi âm
  if (base64Audio) {
    parts.push({
      inlineData: {
        mimeType: "audio/webm",
        data: base64Audio
      }
    });
  }

  parts.push({
    text: "Hãy nghe đoạn âm thanh bài thi và quan sát ảnh chụp màn hình đề thi để chọn đáp án đúng nhất theo JSON schema."
  });

  const requestBody = {
    contents: [{ parts: parts }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  };

  const candidates = await getCandidateModels(apiKey, config.geminiModel);
  let lastError = null;

  for (const currentModel of candidates) {
    try {
      const targetUrl = `${GEMINI_API_BASE}/${currentModel}:generateContent?key=${apiKey}`;
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      if (!response.ok) {
        const errMsg = data.error?.message || `HTTP ${response.status}`;
        if (isOverloadedOrUnavailable(response.status, errMsg)) {
          lastError = errMsg;
          continue;
        }
        throw new Error(errMsg);
      }

      const rawAnswer = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawAnswer) continue;

      try {
        const parsed = JSON.parse(rawAnswer);
        return { success: true, result: parsed, activeModel: currentModel };
      } catch (err) {
        const cleanJson = rawAnswer.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleanJson);
        return { success: true, result: parsed, activeModel: currentModel };
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  throw new Error(lastError || "Tất cả các model đều đang bận. Vui lòng thử lại sau.");
}

