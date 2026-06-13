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

function drawOverlay() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (selection?.bbox) displayBox(selection.bbox, "#7be7c4", "rgba(123,231,196,.15)");
  detectedBoxes.forEach(box => displayBox(box, "#ff6b79", "rgba(255,107,121,.18)"));
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
  
  if (mode === "auto") $("bboxLabel").textContent = "ROI tìm kiếm logo";
  else if (mode === "fixed") $("bboxLabel").textContent = "Vùng mask cố định";

  detectedBoxes = [];
  drawOverlay();
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
  if (!selection?.bbox) return;
  $("process").disabled = true;
  $("progressPanel").classList.remove("hidden");
  if ($("resultPreview")) $("resultPreview").classList.add("hidden");
  if ($("resultViewer")) $("resultViewer").classList.add("hidden");
  
  const startTime = Number($("startTime").value);
  const endVal = $("endTime").value;
  const endTime = endVal ? Number(endVal) : null;
  const detectionInterval = Number($("interval") ? $("interval").value : 5);
  
  const response = await fetch("/api/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      upload_id: uploadId,
      start_time: startTime,
      end_time: endTime,
      bbox: selection.bbox,
      mode: $("mode").value,
      detection_prompt: $("prompt").value,
      detection_interval: detectionInterval,
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
  setTimeout(() => poll(jobId), 1000);
}
