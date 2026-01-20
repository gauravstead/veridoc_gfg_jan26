from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import shutil
import uuid
import asyncio
import time
from contextlib import asynccontextmanager

from pipelines import determine_pipeline, PipelineType, analyze_structural, analyze_visual, analyze_cryptographic
from reasoning import run_semantic_reasoning
from pypdf import PdfReader
from google.cloud import storage
from dotenv import load_dotenv

load_dotenv()

UPLOAD_DIR = "uploads"

async def cleanup_cron():
    """Background task to delete files older than 15 minutes."""
    while True:
        try:
            await asyncio.sleep(60)  # Check every minute
            now = time.time()
            cutoff = now - 900  # 15 minutes
            
            if os.path.exists(UPLOAD_DIR):
                for filename in os.listdir(UPLOAD_DIR):
                    file_path = os.path.join(UPLOAD_DIR, filename)
                    if os.path.isfile(file_path):
                        try:
                            file_mtime = os.path.getmtime(file_path)
                            if file_mtime < cutoff:
                                os.remove(file_path)
                                print(f"Deleted old file: {filename}")
                        except Exception as e:
                            print(f"Error checking/deleting {filename}: {e}")
        except Exception as e:
             print(f"Error in cleanup loop: {e}")
             await asyncio.sleep(60)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Run cleanup task
    task = asyncio.create_task(cleanup_cron())
    yield
    # Shutdown: Cancel task
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

app = FastAPI(title="VeriDoc API", description="Document Forgery Detection System", lifespan=lifespan)


# GCS Configuration

# GCS Configuration
GCS_BUCKET_NAME = os.getenv("GCS_BUCKET_NAME", "veridoc-uploads")

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
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "online", "system": "VeriDoc Agentic Core"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    """
    Uploads a document and returns a task ID for WebSocket analysis.
    """
    try:
        # 1. Save File
        file_ext = file.filename.split('.')[-1].lower()
        task_id = str(uuid.uuid4())
        safe_filename = f"{task_id}.{file_ext}"
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
        pipeline_type = determine_pipeline(found_file, mime_type)
        await websocket.send_json({"status": "info", "message": f"Selected Pipeline: {pipeline_type.value}", "step": "PIPELINE_SELECTED"})

        # Execution
        await websocket.send_json({"status": "info", "message": f"Running {pipeline_type.value} analysis...", "step": "ANALYSIS_RUNNING"})
        report = {}
        if pipeline_type == PipelineType.STRUCTURAL:
             report = analyze_structural(file_path)
        elif pipeline_type == PipelineType.VISUAL:
             report = analyze_visual(file_path)
        elif pipeline_type == PipelineType.CRYPTOGRAPHIC:
             report = analyze_cryptographic(file_path)
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
        await websocket.send_json({"status": "info", "message": "Iniitializing Gemini 1.5 Pro Reasoning Agent...", "step": "REASONING_START"})
        reasoning_result = run_semantic_reasoning(gcs_uri, mime_type=mime_type)
        
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
