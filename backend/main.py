from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Form, Depends, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from contextlib import asynccontextmanager
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from pathlib import Path
import shutil
from datetime import datetime
import json
import asyncio
import os
import uuid
import sys
import socket

from pdf_extractor import extract_text_from_pdf
from ai_service import (
    summarize_text, generate_flashcards, 
    get_ai_service_for_request, OllamaService, OpenAIService
)
from database import (
    init_db, get_db, create_course, create_document,
    create_summary, create_flashcard, get_database_stats,
    get_all_courses, get_course_documents
)
from exam_generator import (
    generate_multiple_choice, generate_true_false, generate_short_answer,
    generate_mixed_exam, save_exam, load_exam
)

import concurrent.futures
executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)


def is_port_in_use(port):
    """Check if a port is already in use"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def kill_process_on_port(port):
    """Kill process using the specified port (Windows)"""
    import subprocess
    import sys
    
    if sys.platform == 'win32':
        try:
            # Find PID using the port
            result = subprocess.run(
                f'netstat -ano | findstr :{port}',
                shell=True,
                capture_output=True,
                text=True
            )
            
            for line in result.stdout.split('\n'):
                if 'LISTENING' in line:
                    parts = line.split()
                    pid = parts[-1]
                    # Kill the process
                    subprocess.run(f'taskkill /PID {pid} /F', shell=True)
                    print(f"Killed process {pid} on port {port}")
                    break
        except Exception as e:
            print(f"Could not kill process on port {port}: {e}")

def find_free_port(start_port=8000, max_attempts=10):
    """Find a free port starting from start_port"""
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"Could not find a free port in range {start_port}-{start_port + max_attempts}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    print("Database initialized")
    print("Backend is ready!")
    print(f"Listening on http://127.0.0.1:8000")
    yield
    # Shutdown (if needed)
    print("Shutting down...")

# Initialize FastAPI app
app = FastAPI(
    title="AI Study Assistant API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Determine paths
if getattr(sys, 'frozen', False):
    # Running as PyInstaller bundle
    
    # Get frontend dir from environment variable
    frontend_from_env = os.environ.get('FRONTEND_DIR')
    
    if frontend_from_env and os.path.exists(frontend_from_env):
        # Use the path provided by Electron
        FRONTEND_DIR = Path(frontend_from_env)
        print(f"Using frontend from environment: {FRONTEND_DIR}")
    else:
        # Fallback: try to find it relative to the executable
        exe_dir = Path(sys.executable).parent
        
        # Try multiple possible locations
        possible_paths = [
            exe_dir.parent / 'frontend',  
            exe_dir.parent.parent / 'frontend', 
            Path(sys._MEIPASS) / 'frontend',  
        ]
        
        FRONTEND_DIR = None
        for path in possible_paths:
            if path.exists():
                FRONTEND_DIR = path
                print(f"Found frontend at: {FRONTEND_DIR}")
                break
        
        if not FRONTEND_DIR:
            print("ERROR: Could not find frontend directory!")
            FRONTEND_DIR = Path(sys._MEIPASS) / 'frontend'  
    
    DATA_DIR = Path(os.environ.get('DATA_DIR', Path.home() / 'AIStudyAssistant'))
else:
    FRONTEND_DIR = Path(__file__).parent.parent / 'frontend' / 'dist'
    DATA_DIR = Path(__file__).parent.parent / 'data'

# Ensure folders exist
DATA_DIR.mkdir(exist_ok=True)
Path(DATA_DIR / "uploads").mkdir(exist_ok=True)
Path(DATA_DIR / "summaries").mkdir(exist_ok=True)
Path(DATA_DIR / "flashcards").mkdir(exist_ok=True)
Path(DATA_DIR / "exams").mkdir(exist_ok=True)

print(f"DATA_DIR: {DATA_DIR}")
print(f"FRONTEND_DIR: {FRONTEND_DIR}")
print(f"Frontend exists: {FRONTEND_DIR.exists()}")

if FRONTEND_DIR.exists():
    frontend_files = list(FRONTEND_DIR.glob('*'))
    print(f"Frontend files found: {len(frontend_files)}")
    if frontend_files:
        print(f"First 5 files: {[f.name for f in frontend_files[:5]]}")
else:
    print(f"WARNING: Frontend directory does not exist!")


# ============================================================================
# HELPER FUNCTION - Get AI Service from Header
# ============================================================================

def get_ai_service_from_header(
    x_ai_model: Optional[str] = None,
    x_openai_model: Optional[str] = None,
    x_openai_api_key: Optional[str] = None
):
    """
    Get appropriate AI service based on headers
    
    Args:
        x_ai_model: Value from X-AI-Model header ("openai" or "llama")
        x_openai_model: Value from X-OpenAI-Model header (specific OpenAI model)
        x_openai_api_key: Value from X-OpenAI-API-Key header (user's API key)
    
    Returns:
        AI service instance (OpenAIService or OllamaService)
    """
    model_preference = (x_ai_model or "openai").lower()
    openai_model = x_openai_model
    openai_api_key = x_openai_api_key or ""
    
    print(f"AI Service Request: provider={model_preference}, model={openai_model}, has_key={bool(openai_api_key)}")
    
    try:
        return get_ai_service_for_request(model_preference, openai_model, openai_api_key)
    except Exception as e:
        print(f"Error getting AI service: {e}")
        # Fallback to Ollama
        return OllamaService()

# ============================================================================
# MODELS
# ============================================================================

class ProcessPDFRequest(BaseModel):
    course_code: str = "GENERAL"
    cards_per_difficulty: int = 5

class FlashcardResponse(BaseModel):
    id: int
    question: str
    answer: str
    difficulty: str
    mastered: bool
    times_reviewed: int

class DocumentResponse(BaseModel):
    id: int
    filename: str
    course: str
    page_count: Optional[int]
    uploaded_at: str
    flashcard_count: int
    has_summary: bool

class CourseResponse(BaseModel):
    code: str
    name: str
    document_count: int
    flashcard_count: int

class ExamRequest(BaseModel):
    course: Optional[str] = None
    document_id: Optional[int] = None
    exam_type: str
    question_count: int = 20
    difficulty: Optional[str] = "mixed"
    question_types: Optional[List[str]] = None

class ExamAnswer(BaseModel):
    question_index: int
    answer: str

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    context: Optional[dict] = None

class ChatResponse(BaseModel):
    message: str
    sources: List[dict]
    suggestions: List[str]
    conversation_id: str

class TestAPIKeyRequest(BaseModel):
    api_key: str

# ============================================================================
# HEALTH CHECK
# ============================================================================

@app.post("/api/test-openai-key")
async def test_openai_key(request: TestAPIKeyRequest):
    """
    Test if an OpenAI API key is valid
    Returns {"valid": true/false, "error": "message"}
    """
    try:
        # Check if key looks valid
        if not request.api_key or len(request.api_key) < 20:
            return {
                "valid": False, 
                "error": "API key is too short or empty"
            }
        
        # Check if key has correct format
        if not (request.api_key.startswith('sk-') or request.api_key.startswith('sk-proj-')):
            return {
                "valid": False,
                "error": "API key must start with 'sk-' or 'sk-proj-'"
            }
        
        # Try to actually use the API key with OpenAI
        try:
            from openai import OpenAI
            
            client = OpenAI(api_key=request.api_key)
            
            # Make a minimal API call to verify the key works
            models = client.models.list()
            
            print(f"API key validation successful - Found {len(models.data)} models")
            
            return {
                "valid": True,
                "message": "API key is valid and working"
            }
            
        except Exception as api_error:
            error_message = str(api_error)
            print(f"API key validation failed: {error_message}")
            
            if "Incorrect API key" in error_message or "invalid" in error_message.lower():
                return {
                    "valid": False,
                    "error": "Invalid API key - please check your key on platform.openai.com"
                }
            elif "quota" in error_message.lower() or "billing" in error_message.lower():
                return {
                    "valid": False,
                    "error": "API key is valid but you have no credits. Add billing at platform.openai.com/billing"
                }
            else:
                return {
                    "valid": False,
                    "error": f"API key validation failed: {error_message}"
                }
                
    except ImportError:
        print("OpenAI library not installed")
        return {
            "valid": False,
            "error": "OpenAI library not installed on server. Run: pip install openai"
        }
    except Exception as e:
        print(f"Unexpected error during API key validation: {str(e)}")
        return {
            "valid": False,
            "error": f"Unexpected error: {str(e)}"
        }
    
@app.get("/api/health")
def health_check():
    """Detailed health check"""
    db = get_db()
    try:
        stats = get_database_stats(db)
        
        # Check both AI services
        ollama_available = OllamaService().is_available()
        
        openai_available = False
        try:
            openai_available = OpenAIService().is_available()
        except:
            pass
        
        return {
            "status": "healthy",
            "database": "connected",
            "ai_services": {
                "ollama": "available" if ollama_available else "unavailable",
                "openai": "available" if openai_available else "unavailable"
            },
            "statistics": stats,
            "frontend_exists": FRONTEND_DIR.exists()

        }
    finally:
        db.close()

# ============================================================================
# PDF PROCESSING
# ============================================================================

@app.post("/api/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    course: str = Form("GENERAL"),
    cards_per_difficulty: int = 5,
    x_ai_model: Optional[str] = Header(None),
    x_openai_model: Optional[str] = Header(None),
    x_openai_api_key: Optional[str] = Header(None)
):
    """
    Upload and process a PDF file with real-time SSE progress streaming.
    Uses run_in_executor for blocking calls and sends heartbeat updates
    while waiting for long-running operations (LLM calls).
    """
    # Normalize course
    if not course or course.strip() == "":
        course = "GENERAL"
    course = course.strip().upper()

    print(f"Received upload request: file={file.filename}, course={course}, model={x_ai_model or 'openai'}")

    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    # Decide AI service
    ai_service = get_ai_service_from_header(x_ai_model, x_openai_model, x_openai_api_key)

    try:
        file_bytes = await file.read() 
        file_path = Path(DATA_DIR / "uploads") / file.filename
        with open(file_path, "wb") as f:
            f.write(file_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {e}")

    # Async queue for SSE messages
    progress_queue: asyncio.Queue = asyncio.Queue()

    # Helper to push progress quickly from async context
    def push_progress(stage: str, progress_pct: int, message: str):
        payload = {"stage": stage, "progress": progress_pct, "message": message}
        # Use call_soon_threadsafe to be safe if called from thread 
        asyncio.get_event_loop().call_soon_threadsafe(progress_queue.put_nowait, payload)

    # Async helper to push final result or error
    def push_result(result_obj: dict):
        asyncio.get_event_loop().call_soon_threadsafe(progress_queue.put_nowait, result_obj)
        # termination sentinel
        asyncio.get_event_loop().call_soon_threadsafe(progress_queue.put_nowait, None)

    def push_error(msg: str):
        asyncio.get_event_loop().call_soon_threadsafe(progress_queue.put_nowait, {"stage": "error", "progress": 0, "message": msg})
        asyncio.get_event_loop().call_soon_threadsafe(progress_queue.put_nowait, None)

    async def process_async():
        loop = asyncio.get_running_loop()

        try:
            # Stage: uploading 
            push_progress("uploading", 10, "Uploading file...")
            push_progress("uploading", 20, "File uploaded successfully")

            # Stage: extracting 
            push_progress("extracting", 25, "Extracting text from PDF...")
            extract_future = loop.run_in_executor(None, extract_text_from_pdf, str(file_path))

            # Heartbeat while extracting
            start_ts = loop.time()
            while not extract_future.done():
                elapsed = int(loop.time() - start_ts)
                
                heartbeat_progress = 25 + min(15, elapsed * 2)  # +2% per second up to +15
                push_progress("extracting", heartbeat_progress, f"Extracting text... {elapsed}s")
                await asyncio.sleep(0.8)

            result = await extract_future  
            if not result.get("success"):
                push_error(f"PDF extraction failed: {result.get('error')}")
                return

            push_progress("extracting", 40, f"Extracted {result.get('page_count', '?')} pages")

            # Create DB record quickly in executor 
            push_progress("storing", 45, "Creating DB records...")
            def create_doc_sync():
                db = get_db()
                try:
                    course_obj = create_course(db, course)
                    doc = create_document(db, result['filename'], str(file_path), course, result.get('page_count'))
                    db.commit()
                    return doc.id
                finally:
                    db.close()

            create_doc_future = loop.run_in_executor(None, create_doc_sync)
            doc_id = await create_doc_future
            push_progress("storing", 50, f"Document saved (ID {doc_id})")

            # Prepare text for AI 
            text = result.get('full_text', '')

            # Stage: summarizing 
            push_progress("summarizing", 55, "Generating AI summary...")

            summarize_future = loop.run_in_executor(
                None,
                lambda: summarize_text(text, max_length="detailed", service=ai_service)
            )

            # Heartbeat during LLM summary: 
            start_ts = loop.time()
            while not summarize_future.done():
                elapsed = int(loop.time() - start_ts)
                heartbeat_progress = 55 + min(15, elapsed * 2)  # grow up to +15
                push_progress("summarizing", heartbeat_progress, f"Generating summary... {elapsed}s")
                await asyncio.sleep(1.0)

            try:
                summary_text = await summarize_future
            except Exception as e:
                push_error(f"Summary generation failed: {str(e)}")
                return

            push_progress("summarizing", 70, "Summary generated successfully")

            # Save summary file and DB record 
            def save_summary_sync():
                db = get_db()
                try:
                    summary_path = Path(DATA_DIR / "summaries") / f"{Path(file_path).stem}_summary.txt"
                    with open(summary_path, 'w', encoding='utf-8') as f:
                        f.write(f"Summary of: {file_path.name}\n")
                        f.write(f"Course: {course}\n")
                        f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                        f.write(f"AI Model: {ai_service.provider}\n")
                        f.write("=" * 70 + "\n\n")
                        f.write(summary_text)
                    summary_record = create_summary(db, doc_id, str(summary_path))
                    db.commit()
                    return str(summary_path)
                finally:
                    db.close()

            summary_path = await loop.run_in_executor(None, save_summary_sync)

            # Stage: generating flashcards 
            push_progress("generating_flashcards", 75, "Creating flashcards...")

            flashcards_future = loop.run_in_executor(
                None,
                lambda: generate_flashcards(text, cards_per_difficulty=cards_per_difficulty, service=ai_service)
            )

            # Heartbeat for flashcard generation 
            start_ts = loop.time()
            while not flashcards_future.done():
                elapsed = int(loop.time() - start_ts)
                heartbeat_progress = 75 + min(15, elapsed * 2)
                push_progress("generating_flashcards", heartbeat_progress, f"Generating flashcards... {elapsed}s")
                await asyncio.sleep(1.0)

            try:
                flashcards_list = await flashcards_future
            except Exception as e:
                push_error(f"Flashcard generation failed: {str(e)}")
                return

            push_progress("generating_flashcards", 90, f"Generated {len(flashcards_list)} flashcards")

            # Save flashcards to DB 
            def save_flashcards_sync():
                db = get_db()
                try:
                    for i, card in enumerate(flashcards_list):
                        create_flashcard(db, doc_id, card['question'], card['answer'], card.get('difficulty', 'medium'))
                    db.commit()
                    return len(flashcards_list)
                finally:
                    db.close()

            # Save iteratively but in executor then report granular progress from async side
            saved_count = await loop.run_in_executor(None, save_flashcards_sync)
            
            for i in range(1, saved_count + 1):
                pct = 90 + int((i / max(1, saved_count)) * 9)  # up to 99
                push_progress("generating_flashcards", pct, f"Saving flashcards ({i}/{saved_count})")
                await asyncio.sleep(0.05)

            # Finalize processed_at in DB
            def finalize_sync():
                db = get_db()
                try:
                    from database import Document
                    doc = db.query(Document).filter(Document.id == doc_id).first()
                    doc.processed_at = datetime.utcnow()
                    db.commit()
                finally:
                    db.close()

            await loop.run_in_executor(None, finalize_sync)

            # Complete
            push_progress("complete", 100, "Processing complete!")

            # Send final result object
            push_result({
                "status": "success",
                "document_id": doc_id,
                "filename": result.get('filename'),
                "course": course,
                "page_count": result.get('page_count'),
                "summary_length": len(summary_text) if 'summary_text' in locals() else 0,
                "flashcard_count": len(flashcards_list) if 'flashcards_list' in locals() else 0,
                "ai_model_used": ai_service.provider
            })

        except Exception as exc:
            import traceback
            traceback.print_exc()
            push_error(f"Processing error: {str(exc)}")
            return

    # Start the orchestrator as a background asyncio task 
    asyncio.create_task(process_async())

    # SSE generator reading from progress_queue
    async def generate():
        try:
            while True:
                item = await progress_queue.get()
                if item is None:
                    break
                # Ensure proper SSE format and immediate yield
                yield f"data: {json.dumps(item)}\n\n"
                
                await asyncio.sleep(0)
        except asyncio.CancelledError:
            
            return

    # Return streaming response
    response = StreamingResponse(generate(), media_type="text/event-stream")
    response.headers["Cache-Control"] = "no-cache"
    response.headers["X-Accel-Buffering"] = "no"
    return response


# ============================================================================
# COURSES
# ============================================================================

@app.get("/api/courses", response_model=List[CourseResponse])
def get_courses():
    """Get all courses"""
    db = get_db()
    try:
        courses = get_all_courses(db)
        
        return [
            CourseResponse(
                code=course.code,
                name=course.name or course.code,
                document_count=len(course.documents),
                flashcard_count=sum(len(doc.flashcards) for doc in course.documents)
            )
            for course in courses
        ]
    finally:
        db.close()

@app.post("/api/courses")
def create_course_endpoint(
    course_code: str = Form(...),
    course_name: Optional[str] = Form(None)
):
    """Create a new course manually"""
    db = get_db()
    try:
        # Normalize course code
        course_code = course_code.strip().upper()
        
        if not course_code:
            raise HTTPException(status_code=400, detail="Course code is required")
        
        # Check if course already exists
        from database import Course
        existing = db.query(Course).filter(Course.code == course_code).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Course {course_code} already exists")
        
        # Create course
        course = create_course(db, course_code, course_name)
        
        return {
            "status": "success",
            "course": {
                "code": course.code,
                "name": course.name or course.code,
                "document_count": 0,
                "flashcard_count": 0
            }
        }
    finally:
        db.close()

@app.delete("/api/courses/{course_code}")
def delete_course_endpoint(course_code: str):
    """Delete a course and all its documents"""
    db = get_db()
    try:
        from database import Course
        
        course = db.query(Course).filter(Course.code == course_code).first()
        
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        
        # Get document count before deletion
        doc_count = len(course.documents)
        
        # Delete all documents 
        for doc in course.documents:
            if Path(doc.file_path).exists():
                Path(doc.file_path).unlink()
        
        # Delete course
        db.delete(course)
        db.commit()
        
        return {
            "status": "success",
            "message": f"Course {course_code} deleted with {doc_count} documents"
        }
    finally:
        db.close()

@app.get("/api/courses/{course_code}/documents")
def get_course_docs(course_code: str):
    """Get all documents for a course"""
    db = get_db()
    try:
        documents = get_course_documents(db, course_code)
        
        return [
            DocumentResponse(
                id=doc.id,
                filename=doc.filename,
                course=doc.course.code,
                page_count=doc.page_count,
                uploaded_at=doc.uploaded_at.isoformat(),
                flashcard_count=len(doc.flashcards),
                has_summary=doc.summary is not None
            )
            for doc in documents
        ]
    finally:
        db.close()

# ============================================================================
# DOCUMENTS
# ============================================================================

@app.get("/api/documents", response_model=List[DocumentResponse])
def get_all_documents():
    """Get all documents"""
    db = get_db()
    try:
        from database import Document
        documents = db.query(Document).order_by(Document.uploaded_at.desc()).all()
        
        return [
            DocumentResponse(
                id=doc.id,
                filename=doc.filename,
                course=doc.course.code,
                page_count=doc.page_count,
                uploaded_at=doc.uploaded_at.isoformat(),
                flashcard_count=len(doc.flashcards),
                has_summary=doc.summary is not None
            )
            for doc in documents
        ]
    finally:
        db.close()

@app.get("/api/documents/{document_id}/summary")
def get_document_summary(document_id: int):
    """Get document summary"""
    db = get_db()
    try:
        from database import Document
        doc = db.query(Document).filter(Document.id == document_id).first()
        
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        
        if not doc.summary:
            raise HTTPException(status_code=404, detail="Summary not found")
        
        # Read summary from file
        with open(doc.summary.file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Extract key points 
        lines = content.split('\n')
        key_points = [line.strip('- •') for line in lines if line.strip().startswith(('-', '•'))][:5]
        
        # Extract topics (very basic)
        import re
        topics = list(set(re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', content)))[:10]
        
        return {
            "summary": content,
            "key_points": key_points if key_points else ["No key points extracted"],
            "topics": topics if topics else ["General"]
        }
    finally:
        db.close()

@app.delete("/api/documents/{document_id}")
def delete_document(document_id: int):
    """Delete a document and its related data"""
    db = get_db()
    try:
        from database import Document
        doc = db.query(Document).filter(Document.id == document_id).first()
        
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Delete file
        if Path(doc.file_path).exists():
            Path(doc.file_path).unlink()
        
        # Database cascade will delete related records
        db.delete(doc)
        db.commit()
        
        return {"status": "success", "message": "Document deleted"}
    finally:
        db.close()

# ============================================================================
# FLASHCARDS
# ============================================================================

@app.get("/api/flashcards")
def get_all_flashcards(
    course: Optional[str] = None,
    difficulty: Optional[str] = None,
    mastered: Optional[bool] = None
):
    """Get flashcards with optional filters"""
    db = get_db()
    try:
        from database import Flashcard, Document, Course
        
        query = db.query(Flashcard).join(Document).join(Course)
        
        if course:
            query = query.filter(Course.code == course)
        
        if difficulty:
            query = query.filter(Flashcard.difficulty == difficulty)
        
        if mastered is not None:
            query = query.filter(Flashcard.mastered == mastered)
        
        flashcards = query.all()
        
        return [
            FlashcardResponse(
                id=fc.id,
                question=fc.question,
                answer=fc.answer,
                difficulty=fc.difficulty,
                mastered=fc.mastered,
                times_reviewed=fc.times_reviewed
            )
            for fc in flashcards
        ]
    finally:
        db.close()

@app.patch("/api/flashcards/{flashcard_id}")
def update_flashcard(flashcard_id: int, updates: dict):
    """Update flashcard (mark as mastered, increment reviews, etc.)"""
    db = get_db()
    try:
        from database import Flashcard
        flashcard = db.query(Flashcard).filter(Flashcard.id == flashcard_id).first()
        
        if not flashcard:
            raise HTTPException(status_code=404, detail="Flashcard not found")
        
        # Update allowed fields
        if 'mastered' in updates:
            flashcard.mastered = updates['mastered']
        if 'times_reviewed' in updates:
            flashcard.times_reviewed = updates['times_reviewed']
        
        db.commit()
        
        return FlashcardResponse(
            id=flashcard.id,
            question=flashcard.question,
            answer=flashcard.answer,
            difficulty=flashcard.difficulty,
            mastered=flashcard.mastered,
            times_reviewed=flashcard.times_reviewed
        )
    finally:
        db.close()

# ============================================================================
# EXAMS 
# ============================================================================

class ExamQuestionType(BaseModel):
    type: str  # 'multiple_choice', 'true_false', 'short_answer'
    count: int

class ExamRequest(BaseModel):
    course: Optional[str] = None
    document_ids: Optional[List[int]] = None
    question_types: Optional[List[ExamQuestionType]] = None
    question_count: Optional[int] = 20
    difficulty: Optional[str] = "mixed"

class ExamAttempt(BaseModel):
    timestamp: str
    score: int
    total: int
    percentage: int
    time_taken: Optional[int] = None  

@app.post("/api/exams/generate")
def generate_exam_endpoint(
    exam_request: ExamRequest,
    x_ai_model: Optional[str] = Header(None),
    x_openai_model: Optional[str] = Header(None),
    x_openai_api_key: Optional[str] = Header(None)
):
    """Generate a new exam with selected AI model, documents, and question types"""
    
    print(f"DATA_DIR: {DATA_DIR}")
    print(f"Exams folder: {DATA_DIR / 'exams'}")
    
    # Get AI service based on user preference
    ai_service = get_ai_service_from_header(x_ai_model, x_openai_model, x_openai_api_key)
    print(f"Generating exam with {ai_service.provider.upper()}")
    if hasattr(ai_service, 'selected_model'):
        print(f"   Model: {ai_service.selected_model}")
        
    db = get_db()
    try:
        from database import Document, Course
        
        # Get documents - prioritize document_ids, then course
        documents = []
        
        if exam_request.document_ids:
            # Get specific documents by ID
            print(f"Fetching documents by IDs: {exam_request.document_ids}")
            documents = db.query(Document).filter(
                Document.id.in_(exam_request.document_ids)
            ).all()
            print(f"Found {len(documents)} documents")
            
        elif exam_request.course:
            # Get all documents for a course
            print(f"Fetching all documents for course: {exam_request.course}")
            course = db.query(Course).filter(Course.code == exam_request.course).first()
            if course:
                documents = course.documents
            print(f"Found {len(documents)} documents in course")
        else:
            raise HTTPException(status_code=400, detail="Must specify either document_ids or course")
        
        if not documents:
            raise HTTPException(status_code=404, detail="No documents found")
        
        # Combine text from all documents
        print(f"Extracting text from {len(documents)} documents...")
        combined_text = ""
        for doc in documents:
            result = extract_text_from_pdf(doc.file_path)
            if result['success']:
                combined_text += f"\n\n--- {doc.filename} ---\n\n"
                combined_text += result['full_text']
        
        if not combined_text:
            raise HTTPException(status_code=500, detail="Failed to extract text")
        
        # Limit text to prevent token overflow
        if len(combined_text) > 15000:
            print(f"Text too long ({len(combined_text)} chars), truncating to 15000")
            combined_text = combined_text[:15000]
        
        print(f"Extracted {len(combined_text)} characters of text")
        
        # Generate questions based on specified types
        all_questions = []
        
        if exam_request.question_types and len(exam_request.question_types) > 0:
            # Generate specific question types with counts
            print(f"Generating questions by type:")
            
            for qt in exam_request.question_types:
                if qt.count > 0:
                    print(f"{qt.type}: {qt.count} questions")
                    
                    if qt.type == 'multiple_choice':
                        questions = generate_multiple_choice(combined_text, qt.count)
                        all_questions.extend(questions)
                        
                    elif qt.type == 'true_false':
                        questions = generate_true_false(combined_text, qt.count)
                        all_questions.extend(questions)
                        
                    elif qt.type == 'short_answer':
                        questions = generate_short_answer(combined_text, qt.count)
                        all_questions.extend(questions)
                    
                    print(f"Generated {len(questions)} {qt.type} questions")
        else:
            # Fallback: generate mixed exam with default count
            print(f"Generating mixed exam with {exam_request.question_count} questions")
            all_questions = generate_mixed_exam(combined_text, exam_request.question_count)
        
        if not all_questions:
            raise HTTPException(status_code=500, detail="Failed to generate questions")
        
        print(f"Total questions generated: {len(all_questions)}")
        
        # Create exam data with UNIQUE ID using UUID
        course_code = documents[0].course.code if documents else "GENERAL"
        
        # Generate unique ID with UUID to prevent conflicts
        unique_id = str(uuid.uuid4())[:8]  
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        exam_id = f"{course_code}_exam_{timestamp}_{unique_id}"
        
        # Create title based on documents
        if len(documents) == 1:
            exam_title = f"{course_code} - {documents[0].filename}"
        else:
            exam_title = f"{course_code} Exam ({len(documents)} documents)"
        
        exam_data = {
            'id': exam_id,
            'title': exam_title,
            'course': course_code,
            'exam_type': 'practice',
            'question_count': len(all_questions),
            'created_at': datetime.now().isoformat(),
            'questions': all_questions,
            'ai_model_used': ai_service.provider,
            'document_ids': [doc.id for doc in documents],
            'document_names': [doc.filename for doc in documents]
        }
        
        # Save exam with proper error handling
        filename = f"{exam_id}.json"
        exam_folder = DATA_DIR / "exams"
        exam_folder.mkdir(exist_ok=True, parents=True)  
        filepath = save_exam(exam_data, filename)
        print(f"Exam saved to: {filepath}")
        
        return exam_data
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error generating exam: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error generating exam: {str(e)}")
    finally:
        db.close()

@app.get("/api/exams")
def list_exams():
    """List all saved exams with score tracking"""
    exams_folder = Path(DATA_DIR / "exams")
    if not exams_folder.exists():
        return []
    
    exam_files = list(exams_folder.glob("*.json"))
    
    exams = []
    for exam_file in exam_files:
        try:
            exam_data = load_exam(exam_file.name)
            
            # Get score statistics
            attempts = exam_data.get('attempts', [])
            best_score = exam_data.get('best_score', None)
            attempt_count = len(attempts)
            last_attempt = exam_data.get('last_attempt', None)
            
            # Calculate average score if attempts exist
            average_score = None
            if attempts:
                average_score = round(
                    sum(a['percentage'] for a in attempts) / len(attempts)
                )
            
            exams.append({
                "id": exam_data.get('id', exam_file.stem),
                "title": exam_data['title'],
                "course": exam_data['course'],
                "exam_type": exam_data.get('exam_type', 'practice'),
                "question_count": exam_data.get('question_count', len(exam_data.get('questions', []))),
                "created_at": exam_data['created_at'],
                "questions": exam_data.get('questions', []),
                
                "best_score": best_score,
                "attempt_count": attempt_count,
                "average_score": average_score,
                "last_attempt": last_attempt,
                "completed": attempt_count > 0  
            })
        except Exception as e:
            print(f"Error loading exam {exam_file.name}: {e}")
            continue
    
    # Sort by creation date (newest first)
    exams.sort(key=lambda x: x['created_at'], reverse=True)
    
    return exams

@app.get("/api/exams/{exam_id}/attempts")
def get_exam_attempts(exam_id: str):
    """Get all attempts for a specific exam"""
    try:
        if not exam_id.endswith('.json'):
            exam_id = f"{exam_id}.json"
        
        exam_data = load_exam(exam_id)
        attempts = exam_data.get('attempts', [])
        
        # Sort by timestamp (most recent first)
        attempts_sorted = sorted(
            attempts,
            key=lambda x: x['timestamp'],
            reverse=True
        )
        
        return {
            "exam_id": exam_data.get('id'),
            "exam_title": exam_data.get('title'),
            "attempts": attempts_sorted,
            "best_score": exam_data.get('best_score'),
            "attempt_count": len(attempts)
        }
        
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Exam not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/api/exams/{exam_id}")
def get_exam(exam_id: str):
    """Get exam details - handle both with and without .json extension"""
    try:
        # Ensure .json extension
        if not exam_id.endswith('.json'):
            exam_id = f"{exam_id}.json"
        
        exam_data = load_exam(exam_id)
        return exam_data
    except FileNotFoundError:
        print(f"Exam not found: {exam_id}")
        raise HTTPException(status_code=404, detail=f"Exam not found: {exam_id}")
    except Exception as e:
        print(f"Error loading exam {exam_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error loading exam: {str(e)}")

@app.post("/api/exams/{exam_id}/submit")
def submit_exam(exam_id: str, answers: dict):
    """Submit exam answers, get results, and track best score"""
    try:
        # Ensure .json extension
        if not exam_id.endswith('.json'):
            exam_id = f"{exam_id}.json"
        
        print(f"Submitting exam: {exam_id}")
        exam_data = load_exam(exam_id)
        questions = exam_data['questions']
        
        user_answers = answers.get('answers', {})
        
        results = []
        correct_count = 0
        
        for idx, question in enumerate(questions):
            user_answer = user_answers.get(str(idx))
            
            # Get correct answer based on question type
            if question['type'] == 'short_answer':
                correct_answer = question.get('sample_answer') 
            else:
                correct_answer = question.get('correct_answer')
            
            is_correct = False
            
            # Check answer based on question type
            if question['type'] == 'true_false':
                if isinstance(user_answer, bool):
                    is_correct = user_answer == correct_answer
                else:
                    is_correct = str(user_answer).lower() == str(correct_answer).lower()
                    
            elif question['type'] == 'multiple_choice':
                is_correct = str(user_answer).upper() == str(correct_answer).upper()
                
            elif question['type'] == 'short_answer':
                # More lenient checking for short answers
                if user_answer and correct_answer:
                    user_lower = str(user_answer).lower().strip()
                    correct_lower = str(correct_answer).lower().strip()
                    
                    # Require minimum length to prevent trivial answers
                    if len(user_lower) < 10:
                        is_correct = False
                    else:
                        # Check if key points are mentioned
                        key_points = question.get('key_points', '')
                        
                        # Split key points by common separators
                        key_point_list = []
                        if key_points:
                            # Try multiple separators: comma, semicolon, bullet points
                            for separator in [',', ';', '•', '-']:
                                if separator in key_points:
                                    key_point_list = [p.strip() for p in key_points.split(separator) if p.strip()]
                                    break
                        
                        # Filter out very short key points
                        key_point_list = [p for p in key_point_list if len(p) > 3]
                        
                        # Check for matches in sample answer or key points
                        has_key_points = False
                        if key_point_list:
                            # User must mention at least 30% of key points
                            matches = sum(1 for point in key_point_list if point.lower() in user_lower)
                            has_key_points = matches >= len(key_point_list) * 0.3
                        
                        sample_words = set(correct_lower.split())
                        user_words = set(user_lower.split())
                        overlap = len(sample_words.intersection(user_words))
                        
                        is_correct = (
                            overlap >= len(sample_words) * 0.2 or  
                            has_key_points
                        )
            
            if is_correct:
                correct_count += 1
            
            results.append({
                "question_index": idx,
                "correct": is_correct,
                "user_answer": user_answer,
                "correct_answer": correct_answer, 
                "explanation": question.get('explanation', ''),
                "key_points": question.get('key_points', '') if question['type'] == 'short_answer' else None
            })
        
        total = len(questions)
        percentage = round((correct_count / total) * 100) if total > 0 else 0
        
        print(f"Exam submitted: {correct_count}/{total} ({percentage}%)")
        
        # Create attempt record
        attempt = {
            "timestamp": datetime.now().isoformat(),
            "score": correct_count,
            "total": total,
            "percentage": percentage
        }
        
        # Update exam data with attempt history
        if 'attempts' not in exam_data:
            exam_data['attempts'] = []
        
        exam_data['attempts'].append(attempt)
        
        # Calculate best score
        best_score = max(
            [attempt['percentage'] for attempt in exam_data['attempts']]
        ) if exam_data['attempts'] else percentage
        
        exam_data['best_score'] = best_score
        exam_data['attempt_count'] = len(exam_data['attempts'])
        exam_data['last_attempt'] = attempt['timestamp']
        
        # Save updated exam data
        save_exam(exam_data, exam_id)
        
        print(f"Best score: {best_score}% (Attempt #{len(exam_data['attempts'])})")
        
        return {
            "score": correct_count,
            "total": total,
            "percentage": percentage,
            "results": results,
            "best_score": best_score,
            "attempt_number": len(exam_data['attempts']),
            "improved": percentage >= best_score if len(exam_data['attempts']) > 1 else False
        }
        
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Exam not found")
    except Exception as e:
        print(f"Error submitting exam: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    
@app.delete("/api/exams/{exam_id}/attempts")
def reset_exam_attempts(exam_id: str):
    """Reset all attempt history for an exam"""
    try:
        if not exam_id.endswith('.json'):
            exam_id = f"{exam_id}.json"
        
        exam_data = load_exam(exam_id)
        
        # Clear attempt history
        exam_data['attempts'] = []
        exam_data['best_score'] = None
        exam_data['attempt_count'] = 0
        exam_data['last_attempt'] = None
        
        # Save updated exam
        save_exam(exam_data, exam_id)
        
        return {
            "status": "success",
            "message": "Exam attempts reset successfully"
        }
        
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Exam not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/exams/{exam_id}")
def delete_exam(exam_id: str):
    """Delete a specific exam by its unique ID"""
    # Add stack trace to see WHO is calling delete
    import traceback
    print(f"DELETE called for exam: {exam_id}")
    print(f"Call stack:\n{''.join(traceback.format_stack())}")

    try:
        # Ensure .json extension
        if not exam_id.endswith('.json'):
            exam_id = f"{exam_id}.json"
        
        print(f"Attempting to delete exam: {exam_id}")
        
        exam_path = Path(DATA_DIR / "exams") / exam_id
        
        if not exam_path.exists():
            print(f"Exam file not found: {exam_path}")
            raise HTTPException(status_code=404, detail=f"Exam not found: {exam_id}")
        
        # Delete the specific file
        exam_path.unlink()
        print(f"Exam deleted: {exam_id}")
        
        return {"status": "success", "message": f"Exam {exam_id} deleted successfully"}
        
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Exam not found")
    except Exception as e:
        print(f"Error deleting exam: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error deleting exam: {str(e)}")

# ============================================================================
# CHATBOT / AI ASSISTANT
# ============================================================================

@app.post("/api/chat", response_model=ChatResponse)
async def chat_with_ai(
    chat_request: ChatRequest,
    x_ai_model: Optional[str] = Header(None),
    x_openai_model: Optional[str] = Header(None),
    x_openai_api_key: Optional[str] = Header(None)
):
    """
    Chat with AI study assistant using selected model
    """
    # Get AI service based on user preference
    
    ai_service = get_ai_service_from_header(x_ai_model, x_openai_model, x_openai_api_key)
    print(f"Chat using {ai_service.provider.upper()}")
    if hasattr(ai_service, 'selected_model'):
        print(f"Model: {ai_service.selected_model}")
    
    db = get_db()
    
    try:
        # Generate conversation ID if not provided
        conversation_id = chat_request.conversation_id or datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # Get user's study materials to provide context
        from database import Document, Flashcard, Course
        
        # Get all courses
        courses = db.query(Course).all()
        course_list = [f"{c.code} ({len(c.documents)} documents)" for c in courses]
        
        # Get recent documents
        recent_docs = db.query(Document).order_by(Document.uploaded_at.desc()).limit(5).all()
        doc_list = [f"{d.filename} ({d.course.code})" for d in recent_docs]
        
        # Get total flashcard count
        total_flashcards = db.query(Flashcard).count()
        mastered_flashcards = db.query(Flashcard).filter(Flashcard.mastered == True).count()
        
        # Build context from user's materials
        system_context = f"""You are an AI study assistant helping a student learn.

You have access to the student's study materials:

COURSES:
{', '.join(course_list) if course_list else 'No courses yet'}

RECENT DOCUMENTS:
{chr(10).join(f'{doc}' for doc in doc_list) if doc_list else 'No documents yet'}

FLASHCARDS:
Total: {total_flashcards}
Mastered: {mastered_flashcards}
To Review: {total_flashcards - mastered_flashcards}

Your role:
1. Answer questions about the study materials
2. Help explain concepts clearly
3. Quiz the student when asked
4. Provide study tips and plans
5. Be encouraging and supportive
6. Always cite sources when referencing specific materials
7. Offer to show related flashcards or create practice questions

Be conversational, helpful, and educational. Use emojis occasionally to be friendly.
"""

        # Add specific context if viewing a document
        if chat_request.context and 'document_id' in chat_request.context:
            doc_id = chat_request.context['document_id']
            doc = db.query(Document).filter(Document.id == doc_id).first()
            
            if doc:
                # Load summary if available
                summary_text = ""
                if doc.summary and doc.summary.file_path:
                    try:
                        with open(doc.summary.file_path, 'r', encoding='utf-8') as f:
                            summary_text = f.read()  
                    except:
                        pass
                
                system_context += f"""

CURRENT CONTEXT:
The student is currently viewing: {doc.filename} ({doc.course.code})
Pages: {doc.page_count}
Flashcards available: {len(doc.flashcards)}

Summary preview:
{summary_text if summary_text else 'No summary available'}
"""
        
        # User's message
        user_message = chat_request.message
        
        # Check for special commands
        if "quiz me" in user_message.lower():
            system_context += "\n\nThe student wants to be quizzed. Create a quiz question based on their materials."
        
        if "study plan" in user_message.lower():
            system_context += "\n\nThe student wants a study plan. Create a structured plan based on their materials."
        
        if "eli5" in user_message.lower() or "explain like" in user_message.lower():
            system_context += "\n\nThe student wants a simple explanation. Use analogies and simple language."
        
        # Generate AI response using selected model
        try:
            full_prompt = f"{system_context}\n\nStudent: {user_message}\n\nAI Study Assistant:"
            
            ai_response = ai_service._generate(
                ai_service.summary_model,
                full_prompt,
                ""
            )
        except Exception as e:
            ai_response = f"I apologize, but I'm having trouble connecting to the AI service. Error: {str(e)}"
        
        # Find relevant sources mentioned in the response
        sources = []
        
        # Search for document references in response
        for doc in recent_docs:
            if doc.filename.lower() in ai_response.lower() or doc.course.code.lower() in ai_response.lower():
                sources.append({
                    "type": "document",
                    "id": doc.id,
                    "name": doc.filename,
                    "course": doc.course.code
                })
        
        # Generate follow-up suggestions
        suggestions = generate_follow_up_suggestions(user_message, ai_response, chat_request.context)
        
        return ChatResponse(
            message=ai_response,
            sources=sources[:3],  
            suggestions=suggestions[:3],  
            conversation_id=conversation_id
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")
    finally:
        db.close()


def generate_follow_up_suggestions(user_message: str, ai_response: str, context: Optional[dict]) -> List[str]:
    """Generate helpful follow-up question suggestions"""
    suggestions = []
    
    # Context-based suggestions
    if context and 'document_id' in context:
        suggestions.append("Summarize this document")
        suggestions.append("Quiz me on this topic")
        suggestions.append("What are the key points?")
    
    # Based on user's question
    if "what" in user_message.lower():
        suggestions.append("Can you explain that in simpler terms?")
        suggestions.append("Show me related flashcards")
    
    if "how" in user_message.lower():
        suggestions.append("Can you give me an example?")
        suggestions.append("Create a practice question about this")
    
    # General suggestions
    if not suggestions:
        suggestions = [
            "Quiz me on this topic",
            "What should I study next?",
            "Create a study plan"
        ]
    
    return suggestions

# ============================================================================
# STATISTICS
# ============================================================================

@app.get("/api/statistics")
def get_statistics():
    """Get overall statistics"""
    db = get_db()
    try:
        stats = get_database_stats(db)
        return stats
    finally:
        db.close()

@app.get("/api/statistics/course/{course_code}")
def get_course_statistics(course_code: str):
    """Get statistics for a specific course"""
    db = get_db()
    try:
        from database import Course, Document, Flashcard
        
        course = db.query(Course).filter(Course.code == course_code).first()
        
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        
        # Get all flashcards for this course
        flashcards = db.query(Flashcard).join(Document).filter(
            Document.course_id == course.id
        ).all()
        
        total_flashcards = len(flashcards)
        mastered = sum(1 for fc in flashcards if fc.mastered)
        unmastered = total_flashcards - mastered
        
        # Count by difficulty
        by_difficulty = {
            'easy': sum(1 for fc in flashcards if fc.difficulty == 'easy'),
            'medium': sum(1 for fc in flashcards if fc.difficulty == 'medium'),
            'hard': sum(1 for fc in flashcards if fc.difficulty == 'hard')
        }
        
        return {
            "course": {
                "code": course.code,
                "name": course.name or course.code,
                "document_count": len(course.documents)
            },
            "flashcard_stats": {
                "total": total_flashcards,
                "mastered": mastered,
                "unmastered": unmastered,
                "by_difficulty": by_difficulty
            },
            "recent_activity": []  # Not implemented
        }
        
    finally:
        db.close()

@app.delete("/api/clear-all-data")
async def clear_all_data(db: Session = Depends(get_db)):
    """
    Clear ALL data from the database and uploaded files.
    This is a destructive operation that cannot be undone.
    """
    try:
        # Import all models needed
        from database import Course, Document, Flashcard, Summary
        
        print("Starting data deletion...")
        
        # Delete all data from database tables in correct order 
        
        # 1. Delete flashcards first 
        flashcard_count = db.query(Flashcard).count()
        db.query(Flashcard).delete()
        print(f"Deleted {flashcard_count} flashcards")
        
        # 2. Delete summaries 
        summary_count = db.query(Summary).count()
        summaries = db.query(Summary).all()
        for summary in summaries:
            # Delete summary files
            if summary.file_path and os.path.exists(summary.file_path):
                try:
                    os.unlink(summary.file_path)
                except Exception as e:
                    print(f"Warning: Could not delete summary file {summary.file_path}: {e}")
        db.query(Summary).delete()
        print(f"Deleted {summary_count} summaries")
        
        # 3. Delete documents 
        doc_count = db.query(Document).count()
        documents = db.query(Document).all()
        for doc in documents:
            # Delete document files
            if doc.file_path and os.path.exists(doc.file_path):
                try:
                    os.unlink(doc.file_path)
                except Exception as e:
                    print(f"Warning: Could not delete document file {doc.file_path}: {e}")
        db.query(Document).delete()
        print(f"Deleted {doc_count} documents")
        
        # 4. Delete courses
        course_count = db.query(Course).count()
        db.query(Course).delete()
        print(f"Deleted {course_count} courses")
        
        # Commit all deletions
        db.commit()
        print("Database changes committed")
        
        # 5. Clear exam files directory
        exams_dir = "exams"
        exam_count = 0
        if os.path.exists(exams_dir):
            for filename in os.listdir(exams_dir):
                file_path = os.path.join(exams_dir, filename)
                try:
                    if os.path.isfile(file_path):
                        os.unlink(file_path)
                        exam_count += 1
                except Exception as e:
                    print(f'Warning: Failed to delete {file_path}. Reason: {e}')
        print(f"Deleted {exam_count} exam files")
        
        # 6. Clear any remaining orphaned files in uploads
        uploads_dir = "uploads"
        upload_count = 0
        if os.path.exists(uploads_dir):
            for filename in os.listdir(uploads_dir):
                file_path = os.path.join(uploads_dir, filename)
                try:
                    if os.path.isfile(file_path) or os.path.islink(file_path):
                        os.unlink(file_path)
                        upload_count += 1
                    elif os.path.isdir(file_path):
                        shutil.rmtree(file_path)
                        upload_count += 1
                except Exception as e:
                    print(f'Warning: Failed to delete {file_path}. Reason: {e}')
        print(f"Deleted {upload_count} uploaded files")
        
        # 7. Clear summaries directory
        summaries_dir = "summaries"
        summary_file_count = 0
        if os.path.exists(summaries_dir):
            for filename in os.listdir(summaries_dir):
                file_path = os.path.join(summaries_dir, filename)
                try:
                    if os.path.isfile(file_path):
                        os.unlink(file_path)
                        summary_file_count += 1
                except Exception as e:
                    print(f'   Warning: Failed to delete {file_path}. Reason: {e}')
        print(f"Deleted {summary_file_count} summary files")
        
        print("All data cleared successfully!")
        
        return {
            "status": "success",
            "message": "All data has been cleared successfully",
            "deleted": {
                "courses": course_count,
                "documents": doc_count,
                "flashcards": flashcard_count,
                "summaries": summary_count,
                "exams": exam_count,
                "uploaded_files": upload_count,
                "summary_files": summary_file_count
            }
        }
        
    except Exception as e:
        db.rollback()
        print(f"Error clearing data: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear data: {str(e)}"
        )

if FRONTEND_DIR.exists() and (FRONTEND_DIR / "index.html").exists():
    print("Configuring frontend...")
    
    # Mount static assets
    assets_dir = FRONTEND_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
        print(f"Mounted /assets")
    
    # Serve index.html for all non-API routes
    @app.api_route("/{path_name:path}", methods=["GET"], include_in_schema=False)
    async def serve_frontend(path_name: str):
        
        if path_name.startswith("api/") or path_name.startswith("api"):
            return JSONResponse({"error": "Not found"}, status_code=404)
        
        
        return FileResponse(str(FRONTEND_DIR / "index.html"))
    
    print("Frontend configured")
else:
    print(f"Frontend not found at {FRONTEND_DIR}")

# ============================================================================
# Run server
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    host = "127.0.0.1" if getattr(sys, 'frozen', False) else "0.0.0.0"

    try:
        port = find_free_port(8000)
        print(f"Using port {port}")
    except RuntimeError:
        port = 8000
        print("Using default port 8000")
    
    uvicorn.run(app, host=host, port=port, log_level="info")