"""VibeVoice-ASR Speech-to-Text microservice."""
import os
import subprocess
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from llama_cpp import Llama

app = FastAPI(title="VibeVoice STT", version="1.0.0")

MODEL_PATH = os.environ.get(
    "VIBEVOICE_MODEL_PATH",
    "D:/models/vibevoice/vibevoice-asr-q4_k.gguf",
)
GPU_LAYERS = int(os.environ.get("VIBEVOICE_GPU_LAYERS", "20"))
N_CTX = int(os.environ.get("VIBEVOICE_N_CTX", "8192"))
N_THREADS = int(os.environ.get("VIBEVOICE_N_THREADS", "4"))

gpu_available = False
model = None


class TranscribeRequest(BaseModel):
    path: str


class TranscribeResponse(BaseModel):
    text: str
    duration_ms: float = 0


@app.on_event("startup")
def load_model():
    global model, gpu_available
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

    model = Llama(
        model_path=MODEL_PATH,
        n_gpu_layers=GPU_LAYERS,
        n_ctx=N_CTX,
        n_threads=N_THREADS,
        verbose=False,
    )
    gpu_available = GPU_LAYERS > 0
    print(f"Model loaded. GPU layers: {GPU_LAYERS}, GPU available: {gpu_available}")


@app.get("/health")
def health():
    return {
        "status": "ok" if model is not None else "loading",
        "model_loaded": model is not None,
        "gpu_layers": GPU_LAYERS,
        "gpu_available": gpu_available,
    }


@app.post("/transcribe")
def transcribe(req: TranscribeRequest):
    if model is None:
        raise HTTPException(503, "Model not loaded yet")

    audio_path = Path(req.path)
    if not audio_path.exists():
        raise HTTPException(400, f"Audio file not found: {req.path}")

    pcm_data = _decode_audio(audio_path)
    duration_ms = (len(pcm_data) / 2 / 16000) * 1000

    try:
        output = model.transcribe(pcm_data, sample_rate=16000)
        text = output.get("text", "").strip()
    except Exception as e:
        raise HTTPException(500, f"Transcription failed: {str(e)}")

    return {"text": text, "duration_ms": round(duration_ms)}


def _decode_audio(file_path: Path) -> bytes:
    """Convert any audio format to 16kHz mono PCM via ffmpeg."""
    proc = subprocess.run(
        [
            "ffmpeg", "-i", str(file_path),
            "-ar", "16000", "-ac", "1", "-f", "s16le",
            "-hide_banner", "-loglevel", "error",
            "pipe:1",
        ],
        capture_output=True,
        timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg decode failed: {proc.stderr.decode()[:200]}")
    return proc.stdout


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=3002, log_level="info")