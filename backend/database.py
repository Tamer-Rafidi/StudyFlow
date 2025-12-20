from sqlalchemy import create_engine, Column, Integer, String, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

# Create base class for models
Base = declarative_base()


class Course(Base):
    """Course/Class model (e.g., BIO101, MATH202)"""
    __tablename__ = 'courses'

    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, nullable=False)  
    name = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    documents = relationship("Document", back_populates="course", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Course {self.code}: {self.name}>"


class Document(Base):
    """Document/PDF model"""
    __tablename__ = 'documents'

    id = Column(Integer, primary_key=True)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    course_id = Column(Integer, ForeignKey('courses.id'))
    page_count = Column(Integer)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime)

    # Relationships
    course = relationship("Course", back_populates="documents")
    summary = relationship("Summary", back_populates="document", uselist=False, cascade="all, delete-orphan")
    flashcards = relationship("Flashcard", back_populates="document", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Document {self.filename} ({self.course.code if self.course else 'No Course'})>"


class Summary(Base):
    """Summary model"""
    __tablename__ = 'summaries'

    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey('documents.id'), unique=True)
    file_path = Column(String) 
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    document = relationship("Document", back_populates="summary")

    def __repr__(self):
        return f"<Summary for {self.document.filename}>"


class Flashcard(Base):
    """Flashcard model"""
    __tablename__ = 'flashcards'

    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey('documents.id'))
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    difficulty = Column(String) 
    mastered = Column(Boolean, default=False)
    times_reviewed = Column(Integer, default=0)
    last_reviewed = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    document = relationship("Document", back_populates="flashcards")

    def __repr__(self):
        return f"<Flashcard {self.id}: {self.question[:30]}... ({self.difficulty})>"


# Database setup
DATABASE_PATH = "study_assistant.db"
engine = create_engine(f'sqlite:///{DATABASE_PATH}', echo=False)
SessionLocal = sessionmaker(bind=engine)


def init_db():
    """Initialize the database - create all tables"""
    Base.metadata.create_all(engine)
    print(f" Database initialized: {DATABASE_PATH}")


def get_db():
    """Get a database session"""
    db = SessionLocal()
    try:
        return db
    except Exception as e:
        db.close()
        raise e


def create_course(db, code: str, name: str = None) -> Course:
    """Create or get existing course"""
    course = db.query(Course).filter(Course.code == code).first()
    if not course:
        course = Course(code=code, name=name or code)
        db.add(course)
        db.commit()
        db.refresh(course)
        print(f" Created course: {code}")
    return course


def create_document(db, filename: str, file_path: str, course_code: str, page_count: int = None) -> Document:
    """Create a new document record"""
    course = create_course(db, course_code)

    doc = Document(
        filename=filename,
        file_path=file_path,
        course_id=course.id,
        page_count=page_count
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    print(f" Document added to database: {filename}")
    return doc


def create_summary(db, document_id: int, file_path: str) -> Summary:
    """Create a summary record"""
    summary = Summary(
        document_id=document_id,
        file_path=file_path
    )
    db.add(summary)
    db.commit()
    db.refresh(summary)
    return summary


def create_flashcard(db, document_id: int, question: str, answer: str, difficulty: str = "medium") -> Flashcard:
    """Create a flashcard record"""
    flashcard = Flashcard(
        document_id=document_id,
        question=question,
        answer=answer,
        difficulty=difficulty
    )
    db.add(flashcard)
    db.commit()
    db.refresh(flashcard)
    return flashcard


def get_all_courses(db) -> list:
    """Get all courses"""
    return db.query(Course).all()


def get_course_documents(db, course_code: str) -> list:
    """Get all documents for a course"""
    course = db.query(Course).filter(Course.code == course_code).first()
    if course:
        return course.documents
    return []

def get_database_stats(db) -> dict:
    """Get statistics about the database"""
    return {
        "total_courses": db.query(Course).count(),
        "total_documents": db.query(Document).count(),
        "total_summaries": db.query(Summary).count(),
        "total_flashcards": db.query(Flashcard).count(),
        "mastered_flashcards": db.query(Flashcard).filter(Flashcard.mastered == True).count(),
        "unmastered_flashcards": db.query(Flashcard).filter(Flashcard.mastered == False).count()
    }
