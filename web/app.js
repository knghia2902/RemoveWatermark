const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("overlay");
const ctx = canvas.getContext("2d");
let uploadId = null;
let selection = null;
let detectedBoxes = [];
let dragging = false;
let start = null;

fetch("/api/system").then(r => r.json()).then(data => {
  if ($("device")) $("device").textContent = data.device === "cuda" ? `GPU: ${data.gpu}` : "CPU mode";
});

async function handleFileUpload(fileObj) {
  if (!fileObj) return;
  const form = new FormData();
  form.append("file", fileObj);
  const response = await fetch("/api/upload", { method: "POST", body: form });
  const data = await response.json();
  if (!response.ok) return alert(data.detail || "Upload lỗi");
  loadWorkspace(data.upload_id, data.video_url, data.fps || 30);
}

function loadWorkspace(id, video_url, fps) {
  uploadId = id;
  window.videoFps = fps;
  selection = null;
  detectedBoxes = [];
  window.manualKeyframes = {};
  video.src = video_url;
  
  if ($("viewerUploadOverlay")) $("viewerUploadOverlay").classList.add("hidden");
  if ($("originalFullscreenBtn")) $("originalFullscreenBtn").classList.remove("hidden");
  if ($("resultViewer")) $("resultViewer").classList.add("hidden");
  if ($("progressPanel")) $("progressPanel").classList.add("hidden");
  if ($("process")) $("process").disabled = false;
  if ($("playIcon")) $("playIcon").style.display = "block";
  if ($("pauseIcon")) $("pauseIcon").style.display = "none";
  if ($("status")) $("status").textContent = "Đang xử lý...";
  if ($("percent")) $("percent").textContent = "0%";
  if ($("progress")) $("progress").value = 0;
}

if ($("viewerUpload")) {
    $("viewerUpload").addEventListener("change", (e) => {
        const overlayText = $("viewerUploadOverlay").querySelector(".title");
        if (overlayText) {
            overlayText.textContent = "LOADING MEDIA...";
        }
        handleFileUpload(e.target.files[0]);
    });
}

function resizeCanvas() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const rect = video.getBoundingClientRect();
  const scale = Math.min(rect.width / vw, rect.height / vh);
  const width = vw * scale;
  const height = vh * scale;
  
  canvas.width = Math.round(width * devicePixelRatio);
  canvas.height = Math.round(height * devicePixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  
  canvas.style.left = `${(rect.width - width) / 2}px`;
  canvas.style.top = `${(rect.height - height) / 2}px`;
  
  drawOverlay();
}

video.addEventListener("loadedmetadata", () => {
  resizeCanvas();
  if (isFinite(video.duration)) {
      $("seek").max = video.duration;
  }
  renderKeyframeMarkers();
});
video.addEventListener("durationchange", () => {
  if (isFinite(video.duration)) {
      $("seek").max = video.duration;
  }
});

let isSeeking = false;
$("seek").addEventListener("mousedown", () => isSeeking = true);
$("seek").addEventListener("touchstart", () => isSeeking = true);
$("seek").addEventListener("mouseup", () => isSeeking = false);
$("seek").addEventListener("touchend", () => isSeeking = false);

$("seek").addEventListener("input", () => {
  const targetTime = Number($("seek").value);
  video.currentTime = targetTime;
  if ($("finalVideo") && !$("resultViewer").classList.contains("hidden")) {
      $("finalVideo").currentTime = targetTime;
  }
  detectedBoxes = [];
  updateKfButton();
  drawOverlay();
});

$("seek").addEventListener("change", () => {
  isSeeking = false;
  const targetTime = Number($("seek").value);
  video.currentTime = targetTime;
  if ($("finalVideo") && !$("resultViewer").classList.contains("hidden")) {
      $("finalVideo").currentTime = targetTime;
  }
});

video.addEventListener("timeupdate", () => {
  if (!isSeeking) {
    $("seek").value = video.currentTime;
  }
  $("currentTime").textContent = `${video.currentTime.toFixed(2)}s`;
  if ($("mode").value === "keyframe") {
      updateKfButton();
      drawOverlay();
  }
  if ($("finalVideo") && !$("resultViewer").classList.contains("hidden")) {
      if (!isSeeking && $("finalVideo").readyState >= 2 && Math.abs($("finalVideo").currentTime - video.currentTime) > 0.4) {
          $("finalVideo").currentTime = video.currentTime;
      }
  }
});
$("playPause").addEventListener("click", () => {
  if (video.paused) video.play();
  else video.pause();
});

video.addEventListener("play", () => { 
  if ($("playIcon")) $("playIcon").style.display = "none";
  if ($("pauseIcon")) $("pauseIcon").style.display = "block";
  if ($("finalVideo") && !$("resultViewer").classList.contains("hidden")) {
      $("finalVideo").currentTime = video.currentTime;
      $("finalVideo").play();
  }
});
video.addEventListener("pause", () => { 
  if ($("playIcon")) $("playIcon").style.display = "block";
  if ($("pauseIcon")) $("pauseIcon").style.display = "none";
  if ($("finalVideo") && !$("resultViewer").classList.contains("hidden")) {
      $("finalVideo").pause();
  }
});
window.addEventListener("resize", resizeCanvas);

function toggleFullscreen(elementId) {
    const el = $(elementId);
    if (!el) return;
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        el.requestFullscreen();
    }
}

if ($("finalVideo")) {
    $("finalVideo").addEventListener("loadeddata", () => {
        $("finalVideo").currentTime = video.currentTime;
        if (!video.paused) {
            $("finalVideo").play();
        }
    });
}

if ($("originalViewer")) {
  $("originalViewer").addEventListener("dblclick", () => {
    toggleFullscreen("originalViewer");
  });
}
if ($("resultViewer")) {
  $("resultViewer").addEventListener("dblclick", () => {
    toggleFullscreen("resultViewer");
  });
}

function point(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
    y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
  };
}

function displayBox(box, color, fill) {
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width / video.videoWidth;
  const sy = rect.height / video.videoHeight;
  const scale = devicePixelRatio;
  const x = box[0] * sx * scale;
  const y = box[1] * sy * scale;
  const w = (box[2] - box[0]) * sx * scale;
  const h = (box[3] - box[1]) * sy * scale;
  ctx.fillStyle = fill;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * scale;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
}

function getInterpolatedKeyframe(frame) {
  const frames = Object.keys(window.manualKeyframes).map(Number).sort((a,b)=>a-b);
  if (frames.length === 0) return null;
  if (frames.includes(frame)) return window.manualKeyframes[frame];
  
  let segment = 0;
  while (segment + 1 < frames.length && frames[segment + 1] < frame) segment++;
  if (frame <= frames[0]) return window.manualKeyframes[frames[0]];
  if (frame >= frames[frames.length - 1]) return window.manualKeyframes[frames[frames.length - 1]];
  
  const left = frames[segment];
  const right = frames[segment + 1];
  const ratio = (frame - left) / (right - left);
  const boxL = window.manualKeyframes[left];
  const boxR = window.manualKeyframes[right];
  return [
      boxL[0] * (1 - ratio) + boxR[0] * ratio,
      boxL[1] * (1 - ratio) + boxR[1] * ratio,
      boxL[2] * (1 - ratio) + boxR[2] * ratio,
      boxL[3] * (1 - ratio) + boxR[3] * ratio,
  ];
}

function drawOverlay() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if ($("mode").value === "keyframe") {
    const frame = Math.round(video.currentTime * window.videoFps);
    const box = getInterpolatedKeyframe(frame);
    if (selection?.bbox && dragging) {
        displayBox(selection.bbox, "#7be7c4", "rgba(123,231,196,.15)");
    } else if (box) {
        const isExact = window.manualKeyframes[frame] !== undefined;
        const color = isExact ? "#ff6b79" : "#ffc107";
        const fill = isExact ? "rgba(255,107,121,.18)" : "rgba(255,193,7,.18)";
        displayBox(box, color, fill);
    } else if (selection?.bbox) {
        displayBox(selection.bbox, "#7be7c4", "rgba(123,231,196,.15)");
    }
  } else {
    if (selection?.bbox) displayBox(selection.bbox, "#7be7c4", "rgba(123,231,196,.15)");
    detectedBoxes.forEach(box => displayBox(box, "#ff6b79", "rgba(255,107,121,.18)"));
  }
}

function renderKeyframeMarkers() {
  const container = $("kfMarkers");
  container.innerHTML = "";
  if ($("mode").value !== "keyframe" || !video.duration) return;
  const frames = Object.keys(window.manualKeyframes).map(Number);
  frames.forEach(f => {
      const time = f / window.videoFps;
      const percent = (time / video.duration) * 100;
      const dot = document.createElement("div");
      dot.style.position = "absolute";
      dot.style.left = `calc(${percent}% - 4px)`;
      dot.style.top = "50%";
      dot.style.transform = "translateY(-50%) rotate(45deg)";
      dot.style.width = "8px";
      dot.style.height = "8px";
      dot.style.backgroundColor = "#ff6b79";
      dot.style.border = "1px solid #fff";
      container.appendChild(dot);
  });
}

function updateKfButton() {
  if ($("mode").value !== "keyframe") return;
  const frame = Math.round(video.currentTime * window.videoFps);
  const hasKf = window.manualKeyframes[frame] !== undefined;
  const btn = $("toggleKf");
  if (hasKf) {
      btn.textContent = "♢ Xóa Keyframe này";
      btn.style.color = "#ff6b79";
  } else {
      btn.textContent = "♦ Thêm Keyframe";
      btn.style.color = "";
  }
}

canvas.addEventListener("pointerdown", (event) => {
  dragging = true;
  start = point(event);
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const now = point(event);
  const rect = canvas.getBoundingClientRect();
  const sx = video.videoWidth / rect.width;
  const sy = video.videoHeight / rect.height;
  selection = {
    bbox: [
      Math.round(Math.min(start.x, now.x) * sx),
      Math.round(Math.min(start.y, now.y) * sy),
      Math.round(Math.max(start.x, now.x) * sx),
      Math.round(Math.max(start.y, now.y) * sy),
    ],
  };
  detectedBoxes = [];
  drawOverlay();
});
canvas.addEventListener("pointerup", () => {
  dragging = false;
  if (!selection?.bbox) return;
  const [x1, y1, x2, y2] = selection.bbox;
  if (x2 - x1 < 4 || y2 - y1 < 4) return;
  $("bbox").textContent = selection.bbox.join(", ");
  $("process").disabled = false;
  $("previewDetect").disabled = false;
});

$("mode").addEventListener("change", () => {
  const mode = $("mode").value;
  $("autoSettings").classList.toggle("hidden", mode !== "auto");
  $("keyframeSettings").classList.toggle("hidden", mode !== "keyframe");
  
  if (mode === "auto") $("bboxLabel").textContent = "ROI tìm kiếm logo";
  else if (mode === "fixed") $("bboxLabel").textContent = "Vùng mask cố định";
  else $("bboxLabel").textContent = "Kéo mask và lưu Keyframe";

  detectedBoxes = [];
  updateKfButton();
  renderKeyframeMarkers();
  drawOverlay();
});

$("toggleKf").addEventListener("click", () => {
  const frame = Math.round(video.currentTime * window.videoFps);
  if (window.manualKeyframes[frame]) {
      delete window.manualKeyframes[frame];
  } else {
      if (!selection?.bbox) {
          const interp = getInterpolatedKeyframe(frame);
          if (interp) window.manualKeyframes[frame] = interp;
          else return alert("Vui lòng khoanh vùng mặt nạ trước khi lưu Keyframe!");
      } else {
          window.manualKeyframes[frame] = selection.bbox;
      }
  }
  updateKfButton();
  renderKeyframeMarkers();
  drawOverlay();
  $("process").disabled = false;
});

$("clearKf").addEventListener("click", () => {
  window.manualKeyframes = {};
  updateKfButton();
  renderKeyframeMarkers();
  drawOverlay();
});

$("useCurrent").addEventListener("click", () => {
  $("startTime").value = video.currentTime.toFixed(2);
});

$("previewDetect").addEventListener("click", async () => {
  if (!selection?.bbox || !uploadId) return;
  $("previewDetect").disabled = true;
  $("previewDetect").textContent = "Đang detect...";
  const response = await fetch("/api/detect-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      upload_id: uploadId,
      time: video.currentTime,
      bbox: selection.bbox,
      detection_prompt: $("prompt").value,
    }),
  });
  const data = await response.json();
  $("previewDetect").disabled = false;
  $("previewDetect").textContent = "Detect thử frame hiện tại";
  if (!response.ok) return alert(data.detail || "Detect lỗi");
  detectedBoxes = data.boxes;
  drawOverlay();
  if (!detectedBoxes.length) alert("Không detect được logo trong ROI tại frame này.");
});

$("process").addEventListener("click", async () => {
  if (!uploadId) return;
  if ($("mode").value === "keyframe") {
    if (Object.keys(window.manualKeyframes).length === 0) return alert("Vui lòng thêm ít nhất 1 Keyframe!");
  } else {
    if (!selection?.bbox) return;
  }
  $("process").disabled = true;
  $("progressPanel").classList.remove("hidden");
  if ($("resultPreview")) $("resultPreview").classList.add("hidden");
  if ($("resultViewer")) $("resultViewer").classList.add("hidden");
  const response = await fetch("/api/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      upload_id: uploadId,
      start_time: Number($("startTime").value || 0),
      bbox: selection?.bbox || [0,0,10,10],
      keyframes: $("mode").value === "keyframe" ? window.manualKeyframes : {},
      mode: $("mode").value,
      detection_prompt: $("prompt").value,
      detection_interval: Number($("interval").value || 10),
      mask_padding: Number($("padding").value || 0),
      quality: $("quality").value,
      model_name: $("inpaintModel").value,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    $("process").disabled = false;
    return alert(data.detail || "Không thể bắt đầu");
  }
  poll(data.job_id);
});

async function poll(jobId) {
  const response = await fetch(`/api/jobs/${jobId}`);
  const job = await response.json();
  $("status").textContent = job.message || job.status;
  $("percent").textContent = `${job.progress || 0}%`;
  $("progress").value = job.progress || 0;
  $("detectionStats").textContent = job.detection_samples
    ? `Detect thành công tại ${job.detections}/${job.detection_samples} mốc; các frame còn lại được nội suy.`
    : "";
    if (job.status === "done") {
      $("status").textContent = "Hoàn tất!";
      $("progress").value = 100;
      $("percent").textContent = "100%";
      $("download").href = job.download_url;
      if ($("resultPreview")) $("resultPreview").classList.remove("hidden");
      if ($("resultViewer")) $("resultViewer").classList.remove("hidden");
      if ($("finalVideo")) {
          $("finalVideo").src = `/api/work/${jobId}/result.mp4?t=` + Date.now();
          $("finalVideo").load();
      }
      $("process").disabled = false;
      return;
    }
  if (job.status === "error") {
    $("process").disabled = false;
    return;
  }
  setTimeout(() => poll(jobId), 700);
}

async function showHistory() {
    const res = await fetch("/api/history");
    const data = await res.json();
    const list = $("historyListColumn");
    if (!list) return;
    list.innerHTML = "";
    if (data.history.length === 0) {
        list.innerHTML = "<p style='color: #888;'>Chưa có video nào trong lịch sử.</p>";
    }
    data.history.forEach(item => {
        const div = document.createElement("div");
        div.style.cssText = "display: flex; justify-content: space-between; background: #222; padding: 12px; border-radius: 8px; align-items: center;";
        const date = new Date(item.created * 1000).toLocaleString("vi-VN");
        div.innerHTML = `
            <div>
                <strong style="color: #7be7c4; font-size: 14px;">Video ${item.id.slice(0,6)}</strong>
                <div style="font-size: 12px; color: #888; margin-top: 4px;">${date}</div>
            </div>
            <div style="display: flex; gap: 6px;">
                <button class="btn-open" style="padding: 6px 10px; font-size: 13px; background: #333; color: #fff; border: 1px solid #555; border-radius: 6px; cursor: pointer;">Mở</button>
                <button class="btn-del" style="padding: 6px 10px; font-size: 13px; background: #5a2a2a; color: #fff; border: 1px solid #773333; border-radius: 6px; cursor: pointer;">Xóa</button>
            </div>
        `;
        div.querySelector(".btn-open").addEventListener("click", () => {
            if ($("historyModal")) $("historyModal").classList.add("hidden");
            loadWorkspace(item.id, item.source_url, 30);
            if (item.result_url) {
                if ($("resultViewer")) $("resultViewer").classList.remove("hidden");
                if ($("finalVideo")) {
                    $("finalVideo").src = item.result_url + "?t=" + Date.now();
                    $("finalVideo").load();
                }
                if ($("download")) $("download").href = item.result_url;
                if ($("progressPanel")) $("progressPanel").classList.remove("hidden");
                if ($("status")) $("status").textContent = "Hoàn tất (Từ Lịch sử)!";
                if ($("progress")) $("progress").value = 100;
                if ($("percent")) $("percent").textContent = "100%";
            }
        });
        div.querySelector(".btn-del").addEventListener("click", async () => {
            if (!confirm("Bạn có chắc chắn muốn xóa vĩnh viễn video này khỏi ổ cứng?")) return;
            const res = await fetch(`/api/history/${item.id}`, { method: "DELETE" });
            if (res.ok) showHistory();
        });
        list.appendChild(div);
    });
}

// Gọi API Lịch sử ngay khi tải trang
showHistory();
