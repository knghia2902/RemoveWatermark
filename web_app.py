import re
import shutil
import subprocess
import sys
import threading
import uuid
import webbrowser
from pathlib import Path

import cv2
import numpy as np
import torch
import uvicorn
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent))
from remwm import (
    AutoProcessor,
    Florence2ForConditionalGeneration,
    detect_only,
    load_lama_model,
    process_image_with_lama,
)
from iopaint.model_manager import ModelManager


ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"
WORK_DIR = ROOT / "web_jobs"
WORK_DIR.mkdir(exist_ok=True)

app = FastAPI(title="AI Video Watermark Remover")
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")

jobs = {}
jobs_lock = threading.Lock()
model_lock = threading.Lock()
processing_lock = threading.Lock()
lama_model = None
florence_model = None
florence_processor = None
device = "cuda" if torch.cuda.is_available() else "cpu"


class ProcessRequest(BaseModel):
    upload_id: str
    start_time: float
    bbox: list[int] = None
    keyframes: dict = None
    mode: str = "fixed"
    detection_prompt: str = "small watermark logo"
    detection_interval: int = 10
    mask_padding: int = 12
    quality: str = "high"
    model_name: str = "lama"


class DetectRequest(BaseModel):
    upload_id: str
    time: float
    bbox: list[int]
    detection_prompt: str = "small watermark logo"


def update_job(job_id, **values):
    with jobs_lock:
        jobs.setdefault(job_id, {}).update(values)


current_model = None
current_model_name = None


def download_inpaint_model(model_name):
    print(f"Downloading model {model_name}... Please wait.")
    result = subprocess.run(
        [sys.executable, "-m", "iopaint", "download", "--model", model_name],
        capture_output=False,
        text=True
    )
    return result.returncode == 0


def load_inpaint_model(model_name, device):
    """Load inpaint model, downloading if necessary."""
    try:
        return ModelManager(name=model_name, device=device)
    except NotImplementedError as e:
        print(f"Model {model_name} not available, attempting to download...")
        if download_inpaint_model(model_name):
            # Re-import to refresh model registry
            import importlib
            import iopaint.model
            importlib.reload(iopaint.model)
            # Try again
            return ModelManager(name=model_name, device=device)
        else:
            raise RuntimeError(f"Failed to download model {model_name}. Please run manually: python\\python.exe -m iopaint download --model {model_name}")


def get_model(model_name):
    global current_model, current_model_name
    with model_lock:
        if current_model_name != model_name or current_model is None:
            print(f"Switching model from {current_model_name} to {model_name}...")
            # Free VRAM
            current_model = None
            import gc
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            # Load new model
            current_model = load_inpaint_model(model_name, device)
            current_model_name = model_name
    return current_model


def get_florence():
    global florence_model, florence_processor
    with model_lock:
        if florence_model is None:
            model_dtype = torch.float32 if device == "cpu" else None
            florence_model = Florence2ForConditionalGeneration.from_pretrained(
                "florence-community/Florence-2-large",
                torch_dtype=model_dtype,
            ).to(device).eval()
            florence_processor = AutoProcessor.from_pretrained(
                "florence-community/Florence-2-large"
            )
    return florence_model, florence_processor


def probe_video(path):
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise ValueError("Không thể mở video.")
    metadata = {
        "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
        "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        "fps": cap.get(cv2.CAP_PROP_FPS),
        "frames": int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
    }
    cap.release()
    metadata["duration"] = metadata["frames"] / metadata["fps"] if metadata["fps"] else 0
    return metadata


def upload_dir_for(upload_id):
    if not re.fullmatch(r"[0-9a-f]{32}", upload_id):
        raise HTTPException(400, "Upload ID không hợp lệ.")
    return WORK_DIR / upload_id


def source_for(upload_id):
    matches = list(upload_dir_for(upload_id).glob("source.*"))
    if not matches:
        raise HTTPException(404, "Không tìm thấy video.")
    return matches[0]


def validate_bbox(bbox, width, height):
    if len(bbox) != 4:
        raise ValueError("Vùng chọn phải gồm x1, y1, x2, y2.")
    x1, y1, x2, y2 = [int(value) for value in bbox]
    x1 = max(0, min(width - 2, x1))
    y1 = max(0, min(height - 2, y1))
    x2 = max(1, min(width - 1, x2))
    y2 = max(1, min(height - 1, y2))
    if not (0 <= x1 < x2 < width and 0 <= y1 < y2 < height):
        raise ValueError("Vùng chọn nằm ngoài video.")
    return [x1, y1, x2, y2]


def clamp_bbox(bbox, width, height, padding=0):
    x1, y1, x2, y2 = bbox
    return [
        max(0, int(round(x1)) - padding),
        max(0, int(round(y1)) - padding),
        min(width - 1, int(round(x2)) + padding),
        min(height - 1, int(round(y2)) + padding),
    ]


def detect_in_roi(frame, roi, prompt):
    model, processor = get_florence()
    x1, y1, x2, y2 = roi
    crop = frame[y1:y2 + 1, x1:x2 + 1]
    crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    candidates = detect_only(
        Image.fromarray(crop_rgb),
        model,
        processor,
        device,
        35.0,
        prompt,
    )
    return [
        [box[0] + x1, box[1] + y1, box[2] + x1, box[3] + y1]
        for box in [candidate["bbox"] for candidate in candidates if candidate["accepted"]]
    ]


def choose_detection(candidates, previous):
    if not candidates:
        return None
    if previous is None:
        return min(candidates, key=lambda box: (box[2] - box[0]) * (box[3] - box[1]))
    px = (previous[0] + previous[2]) / 2
    py = (previous[1] + previous[3]) / 2
    return min(
        candidates,
        key=lambda box: ((box[0] + box[2]) / 2 - px) ** 2
        + ((box[1] + box[3]) / 2 - py) ** 2,
    )


def interpolate_boxes(detections, start_frame, total_frames):
    frames = sorted(detections)
    if not frames:
        return {}
    result = {}
    segment = 0
    for frame in range(start_frame, total_frames):
        while segment + 1 < len(frames) and frames[segment + 1] < frame:
            segment += 1
        if frame <= frames[0]:
            result[frame] = detections[frames[0]]
        elif frame >= frames[-1]:
            result[frame] = detections[frames[-1]]
        else:
            left_frame = frames[segment]
            right_frame = frames[segment + 1]
            ratio = (frame - left_frame) / (right_frame - left_frame)
            result[frame] = [
                detections[left_frame][i] * (1 - ratio) + detections[right_frame][i] * ratio
                for i in range(4)
            ]
    return result


def detect_moving_boxes(job_id, cap, start_frame, total, roi, prompt, interval):
    update_job(
        job_id,
        status="loading_detector",
        progress=0,
        message=f"Đang tải Florence-2 trên {device.upper()}...",
    )
    get_florence()
    detection_frames = list(range(start_frame, total, interval))
    if detection_frames and detection_frames[-1] != total - 1:
        detection_frames.append(total - 1)
    detections = {}
    previous = None
    update_job(job_id, status="detecting", message="Đang detect logo trong ROI...")

    for index, frame_idx in enumerate(detection_frames):
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ok, frame = cap.read()
        if ok:
            chosen = choose_detection(detect_in_roi(frame, roi, prompt), previous)
            if chosen is not None:
                detections[frame_idx] = chosen
                previous = chosen
        update_job(
            job_id,
            progress=round(35 * (index + 1) / max(1, len(detection_frames)), 1),
            detections=len(detections),
            detection_samples=len(detection_frames),
        )

    if not detections:
        raise RuntimeError(
            "Không detect được logo trong ROI. Hãy khoanh ROI nhỏ hơn hoặc đổi detection prompt."
        )
    return interpolate_boxes(detections, start_frame, total)


def process_job(job_id, source, output, request):
    cap = cv2.VideoCapture(str(source))
    encoder = None
    try:
        if not cap.isOpened():
            raise RuntimeError("Không thể mở video đầu vào.")

        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        start_frame = max(0, min(total, round(request.start_time * fps)))
        start_frame = max(0, min(total, round(request.start_time * fps)))
        interval = max(1, min(60, request.detection_interval))
        padding = max(0, min(100, request.mask_padding))
        quality_presets = {
            "standard": ["-preset", "medium", "-crf", "18"],
            "high": ["-preset", "slow", "-crf", "14"],
            "maximum": ["-preset", "slower", "-crf", "10"],
            "lossless": ["-preset", "medium", "-crf", "0"],
        }
        encode_options = quality_presets.get(request.quality, quality_presets["high"])

        with processing_lock:
            if request.mode == "auto":
                selected_bbox = validate_bbox(request.bbox, width, height)
                frame_boxes = detect_moving_boxes(
                    job_id, cap, start_frame, total, selected_bbox, request.detection_prompt, interval
                )
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                base_progress = 35
            elif request.mode == "keyframe":
                if not request.keyframes:
                    raise RuntimeError("Cần ít nhất 1 keyframe.")
                kfs = {int(k): validate_bbox(v, width, height) for k, v in request.keyframes.items()}
                frame_boxes = interpolate_boxes(kfs, start_frame, total)
                base_progress = 0
            else:
                selected_bbox = validate_bbox(request.bbox, width, height)
                frame_boxes = {frame: selected_bbox for frame in range(start_frame, total)}
                base_progress = 0

            update_job(
                job_id,
                status="starting_encoder",
                progress=base_progress,
                message="Đang khởi động single-pass H.264 encoder...",
            )
            encoder = subprocess.Popen(
                [
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "rawvideo", "-pix_fmt", "bgr24",
                    "-s:v", f"{width}x{height}", "-r", f"{fps:.12f}",
                    "-i", "pipe:0", "-i", str(source),
                    "-map", "0:v:0", "-map", "1:a:0?",
                    "-c:v", "libx264", *encode_options,
                    "-pix_fmt", "yuv420p",
                    "-colorspace", "bt709", "-color_primaries", "bt709",
                    "-color_trc", "bt709",
                    "-c:a", "copy", "-shortest", "-movflags", "+faststart",
                    str(output),
                ],
                stdin=subprocess.PIPE,
            )

            update_job(
                job_id,
                status="loading_model",
                progress=base_progress,
                message=f"Đang tải model {request.model_name.upper()}...",
            )
            model = get_model(request.model_name)
            update_job(job_id, status="processing", message=f"Đang inpaint bằng {request.model_name.upper()}...")

            frame_idx = 0
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                if frame_idx >= start_frame:
                    mask = np.zeros((height, width), dtype=np.uint8)
                    x1, y1, x2, y2 = clamp_bbox(
                        frame_boxes[frame_idx], width, height, padding
                    )
                    mask[y1:y2 + 1, x1:x2 + 1] = 255
                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    result_bgr = process_image_with_lama(rgb, mask, model)
                    mask_3d = mask[:, :, np.newaxis] / 255.0
                    frame = (frame * (1 - mask_3d) + result_bgr * mask_3d).astype(np.uint8)
                encoder.stdin.write(frame.tobytes())
                frame_idx += 1
                if frame_idx % 3 == 0 or frame_idx == total:
                    progress = base_progress + frame_idx / total * (95 - base_progress)
                    update_job(job_id, progress=round(progress, 1))

        cap.release()
        encoder.stdin.close()
        encoder.stdin = None
        update_job(
            job_id,
            status="finalizing",
            progress=96,
            message="Đang hoàn thiện single-pass H.264...",
        )
        if encoder.wait() != 0:
            raise RuntimeError("FFmpeg encoder thất bại.")
        encoder = None
        update_job(
            job_id,
            status="done",
            progress=100,
            message="Hoàn tất.",
            download_url=f"/api/download/{job_id}",
        )
    except Exception as exc:
        update_job(job_id, status="error", message=str(exc))
    finally:
        cap.release()
        if encoder is not None:
            if encoder.stdin is not None:
                encoder.stdin.close()
            encoder.terminate()
            encoder.wait()


@app.get("/")
def index():
    return FileResponse(WEB_DIR / "index.html")


@app.get("/api/system")
def system():
    return {
        "device": device,
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
    }


# Mount WORK_DIR directly to enable flawless Range request seeking for videos
app.mount("/api/work", StaticFiles(directory=WORK_DIR), name="work")

@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".mp4", ".mov", ".mkv", ".avi", ".webm"}:
        raise HTTPException(400, "Định dạng video không được hỗ trợ.")
    upload_id = uuid.uuid4().hex
    upload_dir = WORK_DIR / upload_id
    upload_dir.mkdir()
    source = upload_dir / f"source{suffix}"
    with source.open("wb") as destination:
        shutil.copyfileobj(file.file, destination)
    
    # Enable faststart for web player seeking
    faststart_path = source.with_name("faststart" + suffix)
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(source), "-c", "copy", "-movflags", "+faststart", str(faststart_path)])
    if faststart_path.exists():
        source.unlink()
        faststart_path.rename(source)

    try:
        metadata = probe_video(source)
    except ValueError as exc:
        shutil.rmtree(upload_dir, ignore_errors=True)
        raise HTTPException(400, str(exc)) from exc
    return {
        "upload_id": upload_id,
        "video_url": f"/api/video/{upload_id}",
        **metadata,
    }


from fastapi import Request, Response

@app.get("/api/video/{upload_id}")
def uploaded_video(upload_id: str, request: Request):
    path = source_for(upload_id)
    file_size = path.stat().st_size
    range_header = request.headers.get("Range")
    
    if range_header:
        match = re.search(r"bytes=(\d+)-(\d*)", range_header)
        byte1 = int(match.group(1)) if match else 0
        byte2 = int(match.group(2)) if match and match.group(2) else file_size - 1
        length = byte2 - byte1 + 1
        with open(path, "rb") as f:
            f.seek(byte1)
            data = f.read(length)
        headers = {
            "Content-Range": f"bytes {byte1}-{byte2}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(length),
            "Content-Type": "video/mp4",
        }
        return Response(data, status_code=206, headers=headers)
    
    with open(path, "rb") as f:
        data = f.read()
    return Response(data, status_code=200, headers={
        "Accept-Ranges": "bytes",
        "Content-Length": str(file_size),
        "Content-Type": "video/mp4"
    })


@app.post("/api/detect-preview")
def detect_preview(request: DetectRequest):
    source = source_for(request.upload_id)
    cap = cv2.VideoCapture(str(source))
    try:
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        roi = validate_bbox(request.bbox, width, height)
        cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, round(request.time * fps)))
        ok, frame = cap.read()
        if not ok:
            raise HTTPException(400, "Không đọc được frame.")
        with processing_lock:
            boxes = detect_in_roi(frame, roi, request.detection_prompt)
        return {"boxes": boxes}
    finally:
        cap.release()


@app.post("/api/process")
def start_process(request: ProcessRequest, background_tasks: BackgroundTasks):
    source = source_for(request.upload_id)
    if request.mode not in {"fixed", "auto", "keyframe"}:
        raise HTTPException(400, "Mode không hợp lệ.")
    job_id = uuid.uuid4().hex
    output = source.parent / f"{request.mode}_result_{job_id}.mp4"
    update_job(job_id, status="queued", progress=0, message="Đang xếp hàng...", output=str(output))
    background_tasks.add_task(process_job, job_id, source, output, request)
    return {"job_id": job_id}


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(404, "Không tìm thấy job.")
        return {key: value for key, value in job.items() if key != "output"}


@app.get("/api/download/{job_id}")
def download(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(404, "File chưa sẵn sàng.")
    return FileResponse(
        job["output"],
        media_type="video/mp4",
        filename="ai-no-watermark.mp4",
    )


if __name__ == "__main__":
    threading.Timer(1.5, lambda: webbrowser.open("http://127.0.0.1:8765")).start()
    uvicorn.run(app, host="127.0.0.1", port=8765)
