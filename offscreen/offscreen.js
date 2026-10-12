// Offscreen script xử lý ghi âm Audio từ Tab
// Giữ âm thanh vẫn phát ra loa của người dùng và đồng thời thu lại thành WebM Base64

let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen") return;

  if (message.type === "START_RECORDING") {
    startRecording(message.streamId)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "STOP_RECORDING") {
    stopRecording()
      .then(base64Audio => sendResponse({ success: true, base64Audio }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function startRecording(streamId) {
  audioChunks = [];

  // Lấy stream âm thanh từ tab theo streamId do chrome.tabCapture cung cấp
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  // Chuyển tiếp âm thanh ra loa để người dùng vẫn nghe được bình thường trong khi thi
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(mediaStream);
  source.connect(audioContext.destination);

  // Ghi âm âm thanh thành định dạng WebM (Gemini hỗ trợ native audio/webm)
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") 
    ? "audio/webm;codecs=opus" 
    : "audio/webm";

  mediaRecorder = new MediaRecorder(mediaStream, { mimeType });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
    }
  };

  mediaRecorder.start(500); // 500ms time slice
}

async function stopRecording() {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      resolve("");
      return;
    }

    mediaRecorder.onstop = async () => {
      try {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Data = reader.result.replace(/^data:audio\/\w+;base64,/, "");
          if (audioContext) {
            audioContext.close();
            audioContext = null;
          }
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      } catch (err) {
        reject(err);
      }
    };

    mediaRecorder.stop();
    // Stop all audio tracks
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  });
}
