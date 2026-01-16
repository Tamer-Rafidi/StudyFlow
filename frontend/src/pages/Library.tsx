import { useState, useEffect } from 'react';
import type { FC } from 'react';
import {
  Library as LibraryIcon,
  FileText,
  Trash2,
  Eye,
  BookOpen,
  Filter,
  Search,
  Calendar,
  Sparkles,
  X,
  RefreshCw,
  FolderPlus,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { getDocuments, getCourses, deleteDocument, getDocumentSummary, createCourse, deleteCourse } from '../services/api';
import type { Document, Course } from '../types';

const Library: FC = () => {
  const { showNotification } = useStore();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseName, setNewCourseName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [docsData, coursesData] = await Promise.all([
        getDocuments(),
        getCourses(),
      ]);

      setDocuments(docsData);
      setCourses(coursesData);
    } catch (error) {
      console.error('Failed to load library:', error);
      showNotification('error', 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (docId: number, filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"? This will also delete all associated flashcards and summaries.`)) return;

    try {
      await deleteDocument(docId);
      setDocuments(docs => docs.filter(d => d.id !== docId));
      showNotification('success', 'Document deleted successfully');
      
      if (selectedDoc?.id === docId) {
        setSelectedDoc(null);
      }
      
      // Reload to update course counts
      await loadData();
    } catch (error) {
      console.error('Failed to delete document:', error);
      showNotification('error', 'Failed to delete document');
    }
  };

  const handleViewSummary = async (doc: Document) => {
    setSelectedDoc(doc);
    setLoadingSummary(true);
    setSummary(null);
    
    try {
      const summaryData = await getDocumentSummary(doc.id);
      setSummary(summaryData);
    } catch (error) {
      console.error('Failed to load summary:', error);
      showNotification('error', 'Failed to load summary');
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleCloseSummary = () => {
    setSelectedDoc(null);
    setSummary(null);
  };

  const handleCreateCourse = async () => {
    if (!newCourseCode.trim()) {
      showNotification('error', 'Course code is required');
      return;
    }

    try {
      await createCourse(newCourseCode.trim().toUpperCase(), newCourseName.trim() || undefined);
      showNotification('success', `Course ${newCourseCode.toUpperCase()} created`);
      setShowCreateCourse(false);
      setNewCourseCode('');
      setNewCourseName('');
      await loadData(); 
    } catch (error: any) {
      console.error('Failed to create course:', error);
      showNotification('error', error.message || 'Failed to create course');
    }
  };

  const handleDeleteCourse = async (courseCode: string, docCount: number) => {
    if (docCount > 0) {
      if (!confirm(`Delete course "${courseCode}" and all ${docCount} documents? This cannot be undone.`)) {
        return;
      }
    } else {
      if (!confirm(`Delete empty course "${courseCode}"?`)) {
        return;
      }
    }

    try {
      await deleteCourse(courseCode);
      showNotification('success', `Course ${courseCode} deleted`);
      
      // Reset filter if we deleted the selected course
      if (selectedCourse === courseCode) {
        setSelectedCourse('all');
      }
      
      await loadData();
    } catch (error) {
      console.error('Failed to delete course:', error);
      showNotification('error', 'Failed to delete course');
    }
  };

  // Filter documents
  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = 
      doc.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.course.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCourse = selectedCourse === 'all' || doc.course === selectedCourse;
    
    return matchesSearch && matchesCourse;
  });

  // Get valid course codes from the courses list
  const validCourseCodes = new Set(courses.map(c => c.code));
  
  // Separate courses into those with documents and those without
  const coursesWithDocs = courses.filter(c => c.document_count > 0);
  const emptyCourses = courses.filter(c => c.document_count === 0);
  
  // Group documents by course - only valid courses
  const groupedDocs = filteredDocuments.reduce((acc, doc) => {
    if (validCourseCodes.has(doc.course)) {
      if (!acc[doc.course]) acc[doc.course] = [];
      acc[doc.course].push(doc);
    }
    return acc;
  }, {} as Record<string, Document[]>);

  // Get orphaned documents
  const orphanedDocs = filteredDocuments.filter(doc => !validCourseCodes.has(doc.course));

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-400">Loading library...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Library</h1>
          <p className="text-gray-400">
            {filteredDocuments.length} {filteredDocuments.length === 1 ? 'document' : 'documents'}
            {selectedCourse !== 'all' && ` in ${selectedCourse}`}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowCreateCourse(true)}
            className="btn-ghost flex items-center gap-2"
            title="Create Course"
          >
            <FolderPlus className="w-4 h-4" />
            New Course
          </button>
          <button
            onClick={loadData}
            className="btn-ghost flex items-center gap-2"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => window.location.href = '/upload'}
            className="btn-primary flex items-center gap-2"
          >
            <BookOpen className="w-4 h-4" />
            Upload Document
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="glass rounded-xl p-6 border border-dark-800 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2 flex items-center gap-2">
              <Search className="w-4 h-4" />
              Search Documents
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by filename or course..."
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2 flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filter by Course
            </label>
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="input w-full"
            >
              <option value="all">All Courses ({documents.length})</option>
              {coursesWithDocs.map((course) => {
                const docCount = documents.filter(d => d.course === course.code).length;
                return (
                  <option key={course.code} value={course.code}>
                    {course.code} - {course.name} ({docCount})
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      {/* Empty Courses Section - Show ONLY when no search/filter active */}
      {emptyCourses.length > 0 && selectedCourse === 'all' && !searchQuery && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-semibold">Empty Courses</h2>
            <span className="text-sm text-gray-500">({emptyCourses.length})</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {emptyCourses.map((course) => (
              <div
                key={course.code}
                className="card border-amber-500/30 hover:border-amber-500/50 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-amber-400" />
                  </div>
                  <button
                    onClick={() => handleDeleteCourse(course.code, 0)}
                    className="p-2 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete Empty Course"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
                
                <h3 className="font-semibold mb-1">{course.code}</h3>
                <p className="text-sm text-gray-400 mb-3 truncate">{course.name}</p>
                
                <div className="pt-3 border-t border-dark-700">
                  <p className="text-xs text-amber-400 mb-2">📭 No documents yet</p>
                  <button
                    onClick={() => window.location.href = '/upload'}
                    className="btn-ghost text-xs w-full"
                  >
                    Upload Document
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents Grid */}
      {filteredDocuments.length === 0 && emptyCourses.length === 0 ? (
        <div className="card text-center py-20">
          <LibraryIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">
            {documents.length === 0 ? 'No Documents Yet' : 'No Matching Documents'}
          </h3>
          <p className="text-gray-400 mb-6">
            {documents.length === 0 
              ? 'Upload your first document to get started'
              : 'Try adjusting your search or filters'}
          </p>
          {documents.length === 0 && (
            <button
              onClick={() => window.location.href = '/upload'}
              className="btn-primary"
            >
              Upload Document
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedDocs).map(([course, docs]) => (
            <div key={course}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-5 h-5 text-primary-400" />
                  <h2 className="text-xl font-semibold">{course}</h2>
                  <span className="text-sm text-gray-500">({docs.length})</span>
                </div>
                <button
                  onClick={() => handleDeleteCourse(course, docs.length)}
                  className="p-2 hover:bg-red-500/10 rounded-lg transition-colors group"
                  title="Delete Course"
                >
                  <Trash2 className="w-4 h-4 text-gray-500 group-hover:text-red-400 transition-colors" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="card group hover:border-primary-600/50 transition-all"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 bg-primary-600/20 rounded-lg flex items-center justify-center">
                        <FileText className="w-6 h-6 text-primary-400" />
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleViewSummary(doc)}
                          className="p-2 hover:bg-dark-800 rounded-lg transition-colors"
                          title="View Summary"
                        >
                          <Eye className="w-4 h-4 text-gray-400 hover:text-white" />
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id, doc.filename)}
                          className="p-2 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </div>

                    <h3 className="font-semibold mb-2 truncate" title={doc.filename}>
                      {doc.filename}
                    </h3>

                    <div className="space-y-2 text-sm text-gray-400">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDate(doc.uploaded_at)}</span>
                      </div>
                      {doc.page_count && (
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          <span>{doc.page_count} pages</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        <span>{doc.flashcard_count} flashcards</span>
                      </div>
                    </div>

                    {doc.has_summary && (
                      <div className="mt-4 pt-4 border-t border-dark-700">
                        <button
                          onClick={() => handleViewSummary(doc)}
                          className="text-xs text-green-400 flex items-center gap-1 hover:text-green-300 transition-colors"
                        >
                          <Sparkles className="w-3 h-3" />
                          View AI Summary
                        </button>
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t border-dark-700 flex gap-2">
                      <button
                        onClick={() => window.location.href = `/practice?document=${doc.id}`}
                        className="btn-ghost text-xs flex-1"
                      >
                        Practice
                      </button>
                      <button
                        onClick={() => handleViewSummary(doc)}
                        className="btn-ghost text-xs flex-1"
                      >
                        View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {orphanedDocs.length > 0 && (
            <div className="border-2 border-amber-500/30 rounded-xl p-6 bg-amber-500/5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-amber-400 text-xl">⚠️</span>
                </div>
                <div>
                  <h3 className="font-semibold text-amber-400 mb-1">Orphaned Documents</h3>
                  <p className="text-sm text-gray-400">
                    These {orphanedDocs.length} document{orphanedDocs.length > 1 ? 's' : ''} belong to courses that no longer exist.
                    Delete them or they will be removed when you reload the page.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orphanedDocs.map((doc) => (
                  <div key={doc.id} className="card border-amber-500/20">
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-xs text-amber-400 font-medium">{doc.course} (deleted)</span>
                      <button
                        onClick={() => handleDelete(doc.id, doc.filename)}
                        className="p-1 hover:bg-red-500/10 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                    <h4 className="text-sm font-medium truncate">{doc.filename}</h4>
                    <p className="text-xs text-gray-500 mt-1">{doc.flashcard_count} flashcards</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary Modal - Same as before */}
      {selectedDoc && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={handleCloseSummary}
        >
          <div
            className="glass rounded-2xl border border-dark-700 max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-dark-700 flex items-center justify-between sticky top-0 glass z-10">
              <div className="flex-1 min-w-0 mr-4">
                <h2 className="text-2xl font-bold truncate">{selectedDoc.filename}</h2>
                <div className="flex items-center gap-3 mt-2 text-sm text-gray-400">
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-4 h-4" />
                    {selectedDoc.course}
                  </span>
                  {selectedDoc.page_count && (
                    <span className="flex items-center gap-1">
                      <FileText className="w-4 h-4" />
                      {selectedDoc.page_count} pages
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-4 h-4" />
                    {selectedDoc.flashcard_count} cards
                  </span>
                </div>
              </div>
              <button
                onClick={handleCloseSummary}
                className="p-2 hover:bg-dark-800 rounded-lg transition-colors flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
              {loadingSummary ? (
                <div className="text-center py-12">
                  <div className="animate-spin w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-gray-400">Loading summary...</p>
                </div>
              ) : summary ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary-400" />
                      AI-Generated Summary
                    </h3>
                    <div className="prose prose-invert max-w-none">
                      <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {summary.summary}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4 border-t border-dark-700">
                    <button
                      onClick={() => window.location.href = `/practice?document=${selectedDoc.id}`}
                      className="btn-primary flex-1"
                    >
                      Practice Flashcards
                    </button>
                    <button
                      onClick={() => window.location.href = `/exams?document=${selectedDoc.id}`}
                      className="btn-secondary flex-1"
                    >
                      Generate Exam
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-400 mb-4">No summary available for this document</p>
                  <p className="text-sm text-gray-500">
                    The summary may not have been generated during upload
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Course Modal */}
      {showCreateCourse && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowCreateCourse(false)}
        >
          <div
            className="glass rounded-2xl border border-dark-700 max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Create New Course</h2>
              <button
                onClick={() => setShowCreateCourse(false)}
                className="p-2 hover:bg-dark-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Course Code *
                </label>
                <input
                  type="text"
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value.toUpperCase())}
                  placeholder="e.g., BIO101, CS202"
                  className="input w-full"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  Will be converted to uppercase
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Course Name (Optional)
                </label>
                <input
                  type="text"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  placeholder="e.g., Introduction to Biology"
                  className="input w-full"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreateCourse}
                disabled={!newCourseCode.trim()}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Course
              </button>
              <button
                onClick={() => setShowCreateCourse(false)}
                className="btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Library;