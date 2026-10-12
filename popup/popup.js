document.addEventListener("DOMContentLoaded", async () => {
  const apiKeyInput = document.getElementById("apiKey");
  const toggleKeyBtn = document.getElementById("toggleKeyVisibility");
  const modelSelect = document.getElementById("modelSelect");
  const extensionEnabled = document.getElementById("extensionEnabled");
  const saveBtn = document.getElementById("saveBtn");
  const testBtn = document.getElementById("testBtn");
  const statusMsg = document.getElementById("statusMessage");

  const sourceModeEnabled = document.getElementById("sourceModeEnabled");
  const sourceFileInput = document.getElementById("sourceFileInput");
  const uploadSourceBtn = document.getElementById("uploadSourceBtn");
  const clearSourceBtn = document.getElementById("clearSourceBtn");
  const sourceFileInfo = document.getElementById("sourceFileInfo");
  const envKeyBadge = document.getElementById("envKeyBadge");

  let envConfig = {};

  // Hàm đọc cấu hình file .env
  async function readEnvConfig() {
    try {
      const res = await fetch(chrome.runtime.getURL(".env"));
      if (!res.ok) return {};
      const text = await res.text();
      const cfg = {};
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
          const k = trimmed.slice(0, eqIdx).trim();
          let v = trimmed.slice(eqIdx + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          cfg[k] = v;
        }
      }
      return cfg;
    } catch (e) {
      return {};
    }
  }

  // Load saved config & .env fallback
  envConfig = await readEnvConfig();

  chrome.storage.local.get(
    {
      geminiApiKey: "",
      geminiModel: "auto",
      mode: "semi-auto",
      enabled: true,
      sourceMode: false,
      sourceFiles: [],
      sourceName: "",
      sourceSize: 0,
      sourceContent: ""
    },
    (items) => {
      // Ưu tiên: nếu storage rỗng nhưng .env có key thì lấy từ .env
      if (!items.geminiApiKey && envConfig.GEMINI_API_KEY) {
        apiKeyInput.value = envConfig.GEMINI_API_KEY;
        if (envKeyBadge) {
          envKeyBadge.textContent = "🌿 Đọc từ .env";
          envKeyBadge.style.display = "inline";
        }
      } else {
        apiKeyInput.value = items.geminiApiKey;
        if (envConfig.GEMINI_API_KEY && items.geminiApiKey === envConfig.GEMINI_API_KEY) {
          if (envKeyBadge) {
            envKeyBadge.textContent = "🌿 Trùng khớp .env";
            envKeyBadge.style.display = "inline";
          }
        }
      }

      // Model
      if (items.geminiModel === "auto" && envConfig.GEMINI_MODEL && envConfig.GEMINI_MODEL !== "auto") {
        modelSelect.value = envConfig.GEMINI_MODEL;
      } else {
        modelSelect.value = items.geminiModel;
      }

      extensionEnabled.checked = items.enabled;
      sourceModeEnabled.checked = items.sourceMode;

      const modeRadio = document.querySelector(`input[name="mode"][value="${items.mode}"]`);
      if (modeRadio) modeRadio.checked = true;

      // Khôi phục danh sách files nếu có
      let files = items.sourceFiles || [];
      if (files.length === 0 && items.sourceName && items.sourceContent) {
        files = [{
          id: "default_1",
          name: items.sourceName,
          sizeKb: items.sourceSize || Math.round(items.sourceContent.length / 1024),
          content: items.sourceContent
        }];
      }
      renderSourceFilesList(files);
    }
  );

  // Khi người dùng gõ API key, cập nhật trạng thái badge .env
  apiKeyInput.addEventListener("input", () => {
    if (envConfig.GEMINI_API_KEY && apiKeyInput.value.trim() === envConfig.GEMINI_API_KEY) {
      if (envKeyBadge) envKeyBadge.style.display = "inline";
    } else {
      if (envKeyBadge) envKeyBadge.style.display = "none";
    }
  });

  // File Upload Handlers (Nạp và đọc nhiều file cùng lúc)
  uploadSourceBtn.addEventListener("click", () => sourceFileInput.click());

  sourceFileInput.addEventListener("change", async (e) => {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;

    showStatus(`⏳ Đang đọc đồng thời ${fileList.length} file tài liệu...`, "success");

    try {
      // Đọc đồng thời tất cả các file được chọn bằng Promise.all
      const readPromises = fileList.map((file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const content = evt.target.result;
            const sizeKb = Math.round(file.size / 1024);
            resolve({
              id: "file_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
              name: file.name,
              sizeKb: sizeKb,
              content: content,
              wordCount: Math.round(content.length / 5)
            });
          };
          reader.onerror = () => reject(new Error(`Không thể đọc file: ${file.name}`));
          reader.readAsText(file);
        });
      });

      const newFiles = await Promise.all(readPromises);

      // Lấy danh sách file hiện có để cộng dồn
      chrome.storage.local.get({ sourceFiles: [] }, async (data) => {
        let existingFiles = data.sourceFiles || [];
        // Lọc tránh trùng tên file nếu nạp lại
        const existingNames = new Set(newFiles.map(f => f.name));
        existingFiles = existingFiles.filter(f => !existingNames.has(f.name));

        const updatedFiles = [...existingFiles, ...newFiles];
        await saveSourceFiles(updatedFiles);

        // Hiển thị Popup Modal thông báo hoàn thành
        const docSuccessModal = document.getElementById("docSuccessModal");
        const modalDocText = document.getElementById("modalDocText");
        const closeDocModalBtn = document.getElementById("closeDocModalBtn");

        const totalKb = updatedFiles.reduce((acc, f) => acc + (f.sizeKb || 0), 0);
        const totalWords = updatedFiles.reduce((acc, f) => acc + (f.wordCount || Math.round(f.content.length / 5)), 0);

        if (docSuccessModal && modalDocText) {
          const fileNamesList = newFiles.map(f => `• <b>${f.name}</b> (${f.sizeKb} KB)`).join("<br>");
          modalDocText.innerHTML = `
            Đã đọc thành công <b style="color:#34d399;">${newFiles.length} file mới</b>:<br>
            <div style="max-height:80px; overflow-y:auto; margin:6px 0; font-size:11px; background:rgba(0,0,0,0.2); padding:6px; border-radius:4px; text-align:left;">
              ${fileNamesList}
            </div>
            📊 Tổng kho tài liệu: <b>${updatedFiles.length} file</b> (${totalKb} KB, ~${totalWords.toLocaleString()} từ)
          `;
          docSuccessModal.style.display = "flex";

          closeDocModalBtn.onclick = () => {
            docSuccessModal.style.display = "none";
          };
        }

        // Thông báo hệ thống Chrome Notification
        if (chrome.notifications) {
          chrome.notifications.create({
            type: "basic",
            iconUrl: chrome.runtime.getURL("icons/icon.png") || "",
            title: "🔮 AncestralWhisper - Đã Nạp Xong Tài Liệu",
            message: `Đã đọc và xử lý xong ${newFiles.length} file tài liệu cùng lúc! Tổng cộng: ${updatedFiles.length} files.`,
            priority: 2
          });
        }

        showStatus(`✅ Đã nạp thành công ${newFiles.length} file mới!`, "success");
        // Reset input để có thể chọn lại file cùng tên nếu cần
        sourceFileInput.value = "";
      });
    } catch (err) {
      console.error("Multi-file read error:", err);
      showStatus(`❌ Lỗi khi đọc file: ${err.message}`, "error");
    }
  });

  // Lưu danh sách file và cập nhật chuỗi gộp sourceContent
  async function saveSourceFiles(files) {
    try {
      if (files.length === 0) {
        await chrome.storage.local.remove(["sourceFiles", "sourceContent", "sourceName", "sourceSize", "sourceCount"]);
        await chrome.storage.local.set({ sourceMode: false });
        sourceModeEnabled.checked = false;
        renderSourceFilesList([]);
        return;
      }

      // Tạo chuỗi nội dung gộp từ tất cả các file
      let combinedContent = "";
      files.forEach((file, index) => {
        combinedContent += `=== TÀI LIỆU [${index + 1}/${files.length}]: ${file.name} (${file.sizeKb} KB) ===\n`;
        combinedContent += file.content + "\n\n";
      });

      const totalKb = files.reduce((acc, f) => acc + (f.sizeKb || 0), 0);
      const fileNames = files.map(f => f.name).join(", ");
      const summaryName = files.length === 1 ? files[0].name : `${files.length} tài liệu (${files.map(f => f.name).slice(0, 2).join(", ")}${files.length > 2 ? "..." : ""})`;

      await chrome.storage.local.set({
        sourceFiles: files,
        sourceContent: combinedContent,
        sourceName: summaryName,
        sourceSize: totalKb,
        sourceCount: files.length,
        sourceMode: true
      });

      sourceModeEnabled.checked = true;
      renderSourceFilesList(files);
    } catch (err) {
      console.error("Storage save error:", err);
      showStatus(`❌ Lỗi lưu trữ: Bộ nhớ vượt hạn mức (${err.message})`, "error");
    }
  }

  // Render danh sách file trên giao diện popup
  function renderSourceFilesList(files) {
    const listEl = document.getElementById("sourceFilesList");
    const summaryEl = document.getElementById("sourceFilesSummary");

    if (!listEl) return;
    listEl.innerHTML = "";

    if (!files || files.length === 0) {
      clearSourceBtn.style.display = "none";
      if (summaryEl) summaryEl.style.display = "none";
      uploadSourceBtn.textContent = "📁 + Thêm file tài liệu";
      return;
    }

    clearSourceBtn.style.display = "inline-block";
    uploadSourceBtn.textContent = "📁 + Thêm file khác";

    files.forEach((file) => {
      const itemEl = document.createElement("div");
      itemEl.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 5px;
        padding: 4px 8px;
        font-size: 11px;
        color: #e2e8f0;
      `;

      itemEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:210px;" title="${file.name}">
          <span>📄</span>
          <span style="font-weight:600; color:#cbd5e1; overflow:hidden; text-overflow:ellipsis;">${file.name}</span>
          <span style="font-size:10px; color:#94a3b8;">(${file.sizeKb} KB)</span>
        </div>
        <button class="delete-file-btn" data-id="${file.id}" type="button" style="background:none; border:none; color:#f87171; cursor:pointer; font-size:12px; font-weight:bold; padding:2px 4px;" title="Xóa tài liệu này">✕</button>
      `;

      // Nút xóa riêng lẻ từng file
      const delBtn = itemEl.querySelector(".delete-file-btn");
      delBtn.onclick = async () => {
        chrome.storage.local.get({ sourceFiles: [] }, async (data) => {
          const remaining = (data.sourceFiles || []).filter(f => f.id !== file.id);
          await saveSourceFiles(remaining);
          showStatus(`Đã xóa "${file.name}"`, "success");
        });
      };

      listEl.appendChild(itemEl);
    });

    if (summaryEl) {
      const totalKb = files.reduce((acc, f) => acc + (f.sizeKb || 0), 0);
      const totalWords = files.reduce((acc, f) => acc + (f.wordCount || Math.round(f.content.length / 5)), 0);
      summaryEl.textContent = `📊 Đã nạp: ${files.length} tài liệu (${totalKb} KB, ~${totalWords.toLocaleString()} từ)`;
      summaryEl.style.display = "block";
    }
  }

  // Nút xóa toàn bộ file
  clearSourceBtn.addEventListener("click", async () => {
    await saveSourceFiles([]);
    showStatus("Đã xóa toàn bộ tài liệu.", "success");
  });

  // Toggle API key visibility
  toggleKeyBtn.addEventListener("click", () => {
    if (apiKeyInput.type === "password") {
      apiKeyInput.type = "text";
      toggleKeyBtn.textContent = "🙈";
    } else {
      apiKeyInput.type = "password";
      toggleKeyBtn.textContent = "👁️";
    }
  });

  // Save settings (Không lưu API Key vào storage để bảo mật tuyệt đối)
  saveBtn.addEventListener("click", () => {
    const model = modelSelect.value;
    const mode = document.querySelector('input[name="mode"]:checked')?.value || "semi-auto";
    const enabled = extensionEnabled.checked;
    const sourceMode = sourceModeEnabled.checked;

    // Xóa bỏ geminiApiKey khỏi storage (nếu có từ phiên bản cũ) để tránh lộ key
    chrome.storage.local.remove("geminiApiKey");

    chrome.storage.local.set(
      {
        geminiModel: model,
        mode: mode,
        enabled: enabled,
        sourceMode: sourceMode
      },
      () => {
        showStatus("Đã lưu cài đặt! (API Key được bảo mật qua .env, không lưu vào bộ nhớ)", "success");
      }
    );
  });

  // Tải danh sách model khả dụng từ chính tài khoản Google
  const refreshModelsBtn = document.getElementById("refreshModelsBtn");
  if (refreshModelsBtn) {
    refreshModelsBtn.addEventListener("click", async () => {
      const key = apiKeyInput.value.trim() || envConfig.GEMINI_API_KEY || "";
      if (!key) {
        showStatus("Vui lòng nhập API Key hoặc cấu hình trong file .env!", "error");
        return;
      }
      showStatus("Đang truy vấn danh sách model từ Google...", "success");
      try {
        const response = await chrome.runtime.sendMessage({
          action: "LIST_MODELS",
          apiKey: key
        });

        if (response && response.success && response.models.length > 0) {
          modelSelect.innerHTML = `<option value="auto" selected>✨ Tự động chọn (Auto - Chống quá tải)</option>`;
          response.models.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m;
            opt.textContent = m;
            modelSelect.appendChild(opt);
          });
          showStatus(`✅ Đã tìm thấy ${response.models.length} model khả dụng trên tài khoản!`, "success");
        } else {
          showStatus(`❌ Lỗi: ${response?.error || "Không lấy được danh sách model"}`, "error");
        }
      } catch (err) {
        showStatus(`❌ Lỗi: ${err.message}`, "error");
      }
    });
  }

  // Test connection to Gemini API
  testBtn.addEventListener("click", async () => {
    const key = apiKeyInput.value.trim() || envConfig.GEMINI_API_KEY || "";
    const model = modelSelect.value;

    if (!key) {
      showStatus("Vui lòng nhập API Key hoặc cấu hình trong file .env!", "error");
      return;
    }

    showStatus("Đang kiểm tra kết nối tới Gemini...", "success");

    try {
      const response = await chrome.runtime.sendMessage({
        action: "TEST_CONNECTION",
        apiKey: key,
        model: model
      });

      if (response && response.success) {
        const activeModelName = response.activeModel || model;
        const note = response.note ? ` ${response.note}` : ` (Model: ${activeModelName})`;
        showStatus(`✅ Kết nối Gemini API thành công!${note}`, "success");

        // Hiển thị Popup Modal thông báo trực quan
        const successModal = document.getElementById("successModal");
        const modalModelText = document.getElementById("modalModelText");
        const closeModalBtn = document.getElementById("closeModalBtn");

        if (successModal && modalModelText) {
          modalModelText.innerHTML = `Model kích hoạt: <b style="color:#38bdf8;">${activeModelName}</b><br><small style="color:#94a3b8;">${response.note || "Tốc độ phản hồi tốt & sẵn sàng."}</small>`;
          successModal.style.display = "flex";

          closeModalBtn.onclick = () => {
            successModal.style.display = "none";
          };
        }
      } else {
        showStatus(`❌ Lỗi: ${response.error || "Không thể kết nối"}`, "error");
      }
    } catch (err) {
      showStatus(`❌ Lỗi gửi request: ${err.message}`, "error");
    }
  });

  function showStatus(text, type) {
    statusMsg.textContent = text;
    statusMsg.className = `status-msg ${type}`;
    statusMsg.style.display = "block";
    setTimeout(() => {
      if (type === "success") {
        statusMsg.style.display = "none";
      }
    }, 4000);
  }
});
