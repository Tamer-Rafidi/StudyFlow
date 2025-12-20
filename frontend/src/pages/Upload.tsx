import { useState, useCallback, useEffect } from 'react';
import type { FC } from 'react';
import {
  Upload as UploadIcon,
  FileText,
  CheckCircle,
  Loader,
  X,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { uploadDocument, getCourses } from '../services/api';
import type { UploadProgress, Course } from '../types';

const Upload: FC = () => {
  const { showNotification } = useStore();
  const [file, setFile] = useState<File | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [useCustomCourse, setUseCustomCourse] = useState(false);
  const [customCourse, setCustomCourse] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      const coursesData = await getCourses();
      setCourses(coursesData);
      
      // Filter to show ALL courses (including empty ones)
      const coursesForUpload = coursesData;
      
      // Set first course as default if available
      if (coursesForUpload.length > 0 && !selectedCourse) {
        setSelectedCourse(coursesForUpload[0].code);
      } else if (coursesForUpload.length === 0) {
        // No courses at all, use custom mode by default
        setUseCustomCourse(true);
      }
    } catch (error) {
      console.error('Failed to load courses:', error);
      setUseCustomCourse(true); // Fallback to custom input
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  }, []);

  const handleFileSelect = (selectedFile: File) => {
    const validTypes = [
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];

    if (!validTypes.includes(selectedFile.type)) {
      showNotification('error', 'Please upload a PDF or PowerPoint file');
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      showNotification('error', 'File size must be less than 50MB');
      return;
    }

    setFile(selectedFile);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  };

  const handleUpload = async () => {
    const finalCourse = useCustomCourse ? customCourse : selectedCourse;
    
    if (!file || !finalCourse.trim()) {
      showNotification('error', 'Please select a file and choose/enter a course');
      return;
    }

    setUploading(true);
    setProgress({
      stage: 'uploading',
      progress: 0,
      message: 'Uploading file...',
    });

    try {
      await uploadDocument(file, finalCourse.trim(), (progressUpdate) => {
        setProgress(progressUpdate);
      });

      showNotification('success', 'Document uploaded and processed successfully!');
      
      setFile(null);
      if (useCustomCourse) {
        setCustomCourse('');
      }
      setProgress(null);
      
      // Refresh courses list
      await loadCourses();
      
      setTimeout(() => {
        window.location.href = '/library';
      }, 2000);
    } catch (error) {
      console.error('Upload failed:', error);
      showNotification('error', error instanceof Error ? error.message : 'Upload failed');
      setProgress(null);
    } finally {
      setUploading(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setProgress(null);
  };

  const getProgressPercentage = () => {
    if (!progress) return 0;
    return progress.progress;
  };

  const getStageIcon = () => {
    if (!progress) return null;

    switch (progress.stage) {
      case 'uploading':
        return <UploadIcon className="w-5 h-5 text-blue-400 animate-pulse" />;
      case 'extracting':
        return <FileText className="w-5 h-5 text-purple-400 animate-pulse" />;
      case 'summarizing':
        return <Loader className="w-5 h-5 text-amber-400 animate-spin" />;
      case 'generating_flashcards':
        return <Loader className="w-5 h-5 text-green-400 animate-spin" />;
      case 'complete':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      default:
        return null;
    }
  };

  // Show ALL courses in upload (including empty ones - users can add docs to them)
  const coursesForUpload = courses;

  return (
    <div className="p-8 max-w-4xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Upload Document</h1>
        <p className="text-gray-400">
          Upload PDFs or PowerPoint slides to generate study materials
        </p>
      </div>

      <div className="glass rounded-2xl border border-dark-800 p-8 mb-6">
        {/* Course Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Select Course
          </label>
          
          {coursesForUpload.length > 0 && !useCustomCourse ? (
            <div className="space-y-3">
              <select
                value={selectedCourse}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setUseCustomCourse(true);
                    setSelectedCourse('');
                  } else {
                    setSelectedCourse(e.target.value);
                  }
                }}
                className="input w-full"
                disabled={uploading}
              >
                <option value="">Select a course</option>
                {coursesForUpload.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} {c.name !== c.code ? `- ${c.name}` : ''} ({c.document_count} docs)
                  </option>
                ))}
                <option value="custom">➕ Create New Course...</option>
              </select>
              <p className="text-xs text-gray-500">
                Select an existing course or create a new one
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                value={customCourse}
                onChange={(e) => setCustomCourse(e.target.value.toUpperCase())}
                placeholder="Enter course code (e.g., BIO101)"
                className="input w-full"
                disabled={uploading}
                autoFocus
              />
              {coursesForUpload.length > 0 && (
                <button
                  onClick={() => {
                    setUseCustomCourse(false);
                    setCustomCourse('');
                    if (coursesForUpload.length > 0) {
                      setSelectedCourse(coursesForUpload[0].code);
                    }
                  }}
                  className="text-sm text-primary-400 hover:text-primary-300"
                  disabled={uploading}
                >
                  ← Back to existing courses
                </button>
              )}
              <p className="text-xs text-gray-500">
                {coursesForUpload.length === 0 
                  ? 'No courses yet. Enter a course code to create your first one.'
                  : 'A new course will be created automatically'
                }
              </p>
            </div>
          )}
        </div>

        {/* File Drop Zone */}
        <div
          className={`
            relative border-2 border-dashed rounded-xl p-12 text-center
            transition-all duration-200
            ${dragActive ? 'border-primary-500 bg-primary-500/10' : 'border-dark-700'}
            ${uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:border-primary-600'}
          `}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !uploading && document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            className="hidden"
            accept=".pdf,.ppt,.pptx"
            onChange={handleFileInputChange}
            disabled={uploading}
          />

          {!file ? (
            <>
              <div className="w-16 h-16 bg-primary-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <UploadIcon className="w-8 h-8 text-primary-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {dragActive ? 'Drop your file here' : 'Upload Document'}
              </h3>
              <p className="text-gray-400 mb-4">
                Drag and drop or click to browse
              </p>
              <p className="text-xs text-gray-500">
                Supports PDF and PowerPoint files up to 50MB
              </p>
            </>
          ) : (
            <div className="flex items-center justify-center gap-4">
              <div className="w-12 h-12 bg-primary-600/20 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary-400" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-gray-400">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              {!uploading && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile();
                  }}
                  className="p-2 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-red-400" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Progress */}
        {progress && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStageIcon()}
                <div>
                  <p className="font-medium">{progress.message}</p>
                  <p className="text-sm text-gray-400 capitalize">{progress.stage.replace('_', ' ')}</p>
                </div>
              </div>
              <span className="text-sm font-medium text-primary-400">
                {getProgressPercentage()}%
              </span>
            </div>

            <div className="w-full bg-dark-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-primary-600 to-purple-600 h-full transition-all duration-300"
                style={{ width: `${getProgressPercentage()}%` }}
              />
            </div>

            {/* Stage Indicators */}
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className={`text-center p-2 rounded ${
                ['uploading', 'extracting', 'summarizing', 'generating_flashcards', 'complete'].includes(progress.stage)
                  ? 'bg-green-500/20 text-green-400' 
                  : 'bg-dark-800 text-gray-500'
              }`}>
                Uploading
              </div>
              <div className={`text-center p-2 rounded ${
                ['extracting', 'summarizing', 'generating_flashcards', 'complete'].includes(progress.stage)
                  ? 'bg-green-500/20 text-green-400' 
                  : 'bg-dark-800 text-gray-500'
              }`}>
                Extracting
              </div>
              <div className={`text-center p-2 rounded ${
                ['summarizing', 'generating_flashcards', 'complete'].includes(progress.stage)
                  ? 'bg-green-500/20 text-green-400' 
                  : 'bg-dark-800 text-gray-500'
              }`}>
                Summarizing
              </div>
              <div className={`text-center p-2 rounded ${
                ['generating_flashcards', 'complete'].includes(progress.stage)
                  ? 'bg-green-500/20 text-green-400' 
                  : 'bg-dark-800 text-gray-500'
              }`}>
                Flashcards
              </div>
            </div>
          </div>
        )}

        {/* Upload Button */}
        <div className="mt-6 flex gap-4">
          <button
            onClick={handleUpload}
            disabled={!file || (useCustomCourse ? !customCourse.trim() : !selectedCourse) || uploading}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <UploadIcon className="w-4 h-4" />
                Upload & Process
              </>
            )}
          </button>
          {file && !uploading && (
            <button onClick={removeFile} className="btn-ghost">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass rounded-xl p-6 border border-dark-800">
          <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center mb-3">
            <FileText className="w-5 h-5 text-blue-400" />
          </div>
          <h3 className="font-semibold mb-2">Auto Detection</h3>
          <p className="text-sm text-gray-400">
            Automatically detects course content and organizes materials
          </p>
        </div>

        <div className="glass rounded-xl p-6 border border-dark-800">
          <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center mb-3">
            <Loader className="w-5 h-5 text-purple-400" />
          </div>
          <h3 className="font-semibold mb-2">AI Summarization</h3>
          <p className="text-sm text-gray-400">
            Generates concise summaries and key points from your content
          </p>
        </div>

        <div className="glass rounded-xl p-6 border border-dark-800">
          <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center mb-3">
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
          <h3 className="font-semibold mb-2">Smart Flashcards</h3>
          <p className="text-sm text-gray-400">
            Creates Q&A flashcards automatically for effective studying
          </p>
        </div>
      </div>
    </div>
  );
};

export default Upload;