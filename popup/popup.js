document.addEventListener("DOMContentLoaded", async () => {
  const apiKeyInput = document.getElementById("apiKey");
  const toggleKeyBtn = document.getElementById("toggleKeyVisibility");
  const modelSelect = document.getElementById("modelSelect");
  const extensionEnabled = document.getElementById("extensionEnabled");
  const saveBtn = document.getElementById("saveBtn");
  const testBtn = document.getElementById("testBtn");
  const statusMsg = document.getElementById("statusMessage");

  // Load saved config
  chrome.storage.local.get(
    {
      geminiApiKey: "",
      geminiModel: "auto",
      mode: "semi-auto",
      enabled: true
    },
    (items) => {
      apiKeyInput.value = items.geminiApiKey;
      modelSelect.value = items.geminiModel;
      extensionEnabled.checked = items.enabled;

      const modeRadio = document.querySelector(`input[name="mode"][value="${items.mode}"]`);
      if (modeRadio) modeRadio.checked = true;
    }
  );

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

  // Save settings
  saveBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    const model = modelSelect.value;
    const mode = document.querySelector('input[name="mode"]:checked')?.value || "semi-auto";
    const enabled = extensionEnabled.checked;

    chrome.storage.local.set(
      {
        geminiApiKey: key,
        geminiModel: model,
        mode: mode,
        enabled: enabled
      },
      () => {
        showStatus("Đã lưu cài đặt thành công!", "success");
      }
    );
  });

  // Tải danh sách model khả dụng từ chính tài khoản Google
  const refreshModelsBtn = document.getElementById("refreshModelsBtn");
  if (refreshModelsBtn) {
    refreshModelsBtn.addEventListener("click", async () => {
      const key = apiKeyInput.value.trim();
      if (!key) {
        showStatus("Vui lòng nhập API Key trước khi tải danh sách!", "error");
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
    const key = apiKeyInput.value.trim();
    const model = modelSelect.value;

    if (!key) {
      showStatus("Vui lòng nhập Gemini API Key trước!", "error");
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
