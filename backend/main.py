from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import shutil
import uuid
import time
from contextlib import asynccontextmanager

from services.pipeline_orchestrator import determine_pipeline, PipelineType, analyze_structural, analyze_visual, analyze_cryptographic
from services.forensic_reasoning import run_semantic_reasoning
from pypdf import PdfReader
from google.cloud import storage
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

UPLOAD_DIR = "uploads"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: No background tasks needed for now
    yield
    # Shutdown


app = FastAPI(title="VeriDoc API", description="Document Forgery Detection System", lifespan=lifespan)


# GCS Configuration
GCS_BUCKET_NAME = os.getenv("GCS_BUCKET_NAME", "veridoc-uploads")

def cleanup_stale_files(directory: Path, max_age_seconds: int = 300):
    """
    Background task to remove files older than max_age_seconds.
    Running in background prevents blocking the upload response.
    """
    try:
        current_time = time.time()
        if not directory.exists():
            return
            
        for item in directory.iterdir():
            try:
                # Delete files/dirs older than threshold
                if item.stat().st_mtime < current_time - max_age_seconds:
                    if item.is_file() or item.is_symlink():
                        item.unlink()
                        print(f"Background Cleaned: {item.name}")
                    elif item.is_dir():
                        shutil.rmtree(item)
                        print(f"Background Cleaned Dir: {item.name}")
            except Exception as e:
                # Non-blocking tolerance - logging only
                print(f"Background cleanup warning for {item.name}: {e}")
    except Exception as e:
        print(f"Background cleanup process error: {e}")

def upload_to_gcs(source_file_name, destination_blob_name):
    """Uploads a file to the bucket."""
    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(destination_blob_name)

        blob.upload_from_filename(source_file_name)

        return f"gs://{GCS_BUCKET_NAME}/{destination_blob_name}"
    except Exception as e:
        print(f"GCS Upload Failed: {e}")
        return None

os.makedirs(UPLOAD_DIR, exist_ok=True)


# CORS Setup
# Explicitly list allowed origins to support allow_credentials=True
origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "https://veridoc-frontend-808108840598.asia-south1.run.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles
app.mount("/static/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

@app.get("/")
def read_root():
    return {"status": "online", "system": "VeriDoc Agentic Core"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/api/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """
    Uploads a document and returns a task ID for WebSocket analysis.
    """
    try:
        # 1. Schedule Cleanup (Non-blocking)
        # Using pathlib for modern Python 3.12+ style handling
        upload_path = Path(UPLOAD_DIR)
        
        # We trigger cleanup of OLD files (stale from previous sessions)
        # We assume 5 minutes (300s) is enough for a session. 
        # For immediate responsiveness, we don't wipe everything synchronously.
        background_tasks.add_task(cleanup_stale_files, upload_path, 300)
        
        # 2. Save New File
        print(f"Receiving file: {file.filename}")
        file_ext = file.filename.split('.')[-1].lower()
        task_id = str(uuid.uuid4())
        safe_filename = f"{task_id}.{file_ext}"
        
        # Ensure directory exists
        upload_path.mkdir(parents=True, exist_ok=True)
        
        file_path = os.path.join(UPLOAD_DIR, safe_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return {
            "task_id": task_id,
            "filename": file.filename,
            "file_path": file_path,
            "content_type": file.content_type
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from fastapi import WebSocket, WebSocketDisconnect

@app.websocket("/ws/analyze/{task_id}")
async def analyze_document(websocket: WebSocket, task_id: str):
    await websocket.accept()
    try:
        # Locate file (reconstruct path based on task_id - simplistic approach)
        # In a real app, look up from DB. Here we search dirtily or assume standard naming if passed, 
        # but better to pass filename in initial handshake or just find the file.
        # Let's look for the file with this UUID in the uploads dir.
        found_file = None
        for f in os.listdir(UPLOAD_DIR):
            if f.startswith(task_id):
                found_file = f
                break
        
        if not found_file:
            await websocket.send_json({"status": "error", "message": "File not found"})
            await websocket.close()
            return

        file_path = os.path.join(UPLOAD_DIR, found_file)
        filename = found_file # approximate original name not preserved in FS but okay for logic
        file_ext = found_file.split('.')[-1]
        mime_type = "application/pdf" if file_ext == "pdf" else "image/jpeg" # simplified
        
        await websocket.send_json({"status": "info", "message": "Starting analysis...", "step": "INIT"})

        # Text Extraction
        text_content = ""
        if file_ext == 'pdf':
            await websocket.send_json({"status": "info", "message": "Extracting text content...", "step": "TEXT_EXTRACTION"})
            try:
                reader = PdfReader(file_path)
                for page in reader.pages:
                    text = page.extract_text()
                    if text:
                        text_content += text + "\n"
            except Exception:
                pass 

        # Pipeline Determination
        await websocket.send_json({"status": "info", "message": "Determining appropriate forensic pipeline...", "step": "PIPELINE_SELECTION"})
        # BUG FIX: Pass full file_path so the orchestrator can open the file
        pipeline_type = determine_pipeline(file_path, mime_type)
        await websocket.send_json({"status": "info", "message": f"Selected Pipeline: {pipeline_type.value}", "step": "PIPELINE_SELECTED"})

        # Execution
        await websocket.send_json({"status": "info", "message": f"Running {pipeline_type.value} analysis...", "step": "ANALYSIS_RUNNING"})
        
        async def send_progress(msg):
            await websocket.send_json({"status": "info", "message": msg, "step": "ANALYSIS_SUBSTEP"})

        report = {}
        if pipeline_type == PipelineType.STRUCTURAL:
             report = await analyze_structural(file_path, callback=send_progress)
        elif pipeline_type == PipelineType.VISUAL:
             report = await analyze_visual(file_path, callback=send_progress)
        elif pipeline_type == PipelineType.CRYPTOGRAPHIC:
             report = await analyze_cryptographic(file_path, callback=send_progress)
        else:
             report = {"error": "Unsupported pipeline requested"}
        
        await websocket.send_json({"status": "info", "message": "Pipeline analysis complete.", "step": "ANALYSIS_COMPLETE", "data": report})

        # GCS Upload
        await websocket.send_json({"status": "info", "message": "Uploading to secure cloud storage...", "step": "GCS_UPLOAD"})
        gcs_uri = upload_to_gcs(file_path, found_file)
        
        if not gcs_uri:
             await websocket.send_json({"status": "error", "message": "GCS Upload Failed"})
             return

        # Semantic Reasoning
        model_name_log = os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")
        await websocket.send_json({"status": "info", "message": f"Initializing {model_name_log} Reasoning Agent...", "step": "REASONING_START"})
        
        # Pass local report to reasoning
        reasoning_result = run_semantic_reasoning(gcs_uri, mime_type=mime_type, local_report=report)
        
        # --- HYBRID SCORING LOGIC ---
        # Formula: Final = (AI_Score * 0.4) + (SegFormer_Score * 0.4) + (Metadata_Score * 0.2)
        
        # 1. Normalize AI Score (0-100) -> (0-100)
        ai_score = reasoning_result.get("authenticity_score", 50)
        
        # 2. Normalize SegFormer Score & Local Stats (ELA)
        # Strategy: If multiple images exist, we take the MINIMUM authenticity score (Worst Case).
        # i.e. If one image is fake, the document is fake.
        
        segformer_score = 100.0
        local_stats_score = 100.0
        
        details = report.get('details', {})
        analyzed_images = details.get('analyzed_images', [])
        
        has_visual_components = False
        
        # Helper to extract scores from a visual report dict
        def extract_visual_scores(vis_details):
            # SegFormer
            sf_val = 100.0
            sem = vis_details.get("semantic_segmentation", {})
            if isinstance(sem, dict):
                fraud_conf = sem.get("confidence_score", 0.0)
                sf_val = max(0, 100 - (fraud_conf * 100))
                
            # ELA
            ela_val = vis_details.get('ela', {}).get('max_difference', 0)
            ela_auth = max(0, 100 - (ela_val * 1.5)) # Slight scalar to make ELA more sensitive
            
            return sf_val, ela_auth

        # Case A: Visual Pipeline (Single Image handled as root details)
        if pipeline_type == PipelineType.VISUAL:
            has_visual_components = True
            sf, ela = extract_visual_scores(details)
            segformer_score = sf
            local_stats_score = ela
            
        # Case B: Structural with Embedded Images
        elif analyzed_images:
            has_visual_components = True
            # Find the worst score among all images
            min_sf = 100.0
            min_ela = 100.0
            
            for img_entry in analyzed_images:
                v_rep = img_entry.get('visual_report', {}).get('details', {})
                sf, ela = extract_visual_scores(v_rep)
                if sf < min_sf: min_sf = sf
                if ela < min_ela: min_ela = ela
            
            segformer_score = min_sf
            local_stats_score = min_ela

        # 3. Normalize Metadata/Structural Score (for non-visual backup)
        risk_score = report.get('score', 0.0)
        metadata_auth = max(0, 100 - (risk_score * 100))
        
        # 4. Apply Weights & Breakdown
        final_trust_score = 0
        score_breakdown = {}
        
        if has_visual_components:
            # Full Formula: AI(40%) + SegFormer(40%) + ELA(20%)
            final_trust_score = (ai_score * 0.4) + (segformer_score * 0.4) + (local_stats_score * 0.2)
            score_breakdown = {
                "AI Analysis (40%)": round(ai_score, 1),
                "Visual Forensics (SegFormer) (40%)": round(segformer_score, 1),
                "Compression Consistency (ELA) (20%)": round(local_stats_score, 1)
            }
        else:
            # Structural/PDF Only
            final_trust_score = (ai_score * 0.6) + (metadata_auth * 0.4)
            score_breakdown = {
                "AI Analysis (60%)": round(ai_score, 1),
                "Metadata/Structure (40%)": round(metadata_auth, 1)
            }
            
        final_trust_score = round(final_trust_score)
        
        # Inject this back into reasoning_result
        reasoning_result["original_ai_score"] = ai_score
        reasoning_result["authenticity_score"] = final_trust_score
        reasoning_result["score_breakdown"] = score_breakdown
        
        # Final Result
        final_response = {
            "task_id": task_id,
            "filename": filename,
            "pipeline_used": pipeline_type.value,
            "report": report,
            "reasoning": reasoning_result
        }
        
        await websocket.send_json({"status": "complete", "message": "Analysis successfully completed.", "step": "COMPLETE", "data": final_response})
        await websocket.close()

    except WebSocketDisconnect:
        print(f"Client disconnected task {task_id}")
    except Exception as e:
        await websocket.send_json({"status": "error", "message": str(e)})
        convert_e = str(e) # avoid f-string inside await if fearful





if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
