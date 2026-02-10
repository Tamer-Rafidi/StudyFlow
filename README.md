# StudyFlow — Intelligent Study and Learning Platform

StudyFlow is an AI-powered desktop study assistant that helps students turn lecture notes and textbooks into actionable learning materials. It extracts content from PDFs, generates summaries, flashcards, and practice exams, and provides a conversational AI tutor — all packaged in a cross-platform Electron desktop app.

Built with a modern TypeScript + React frontend and a Python FastAPI backend, StudyFlow demonstrates full-stack application design, AI integration, and desktop app packaging.

## Features

-  **PDF Ingestion & Processing**  
  Upload lecture notes or textbooks and automatically extract structured text from PDFs.

-  **AI-Generated Summaries**  
  Generate concise or detailed summaries to accelerate review and comprehension.

-  **Flashcard Generation**
  Automatically create flashcards with spaced difficulty levels to reinforce learning.

-  **Practice Exam Builder**
  Generate practice exams with multiple-choice, true/false, and short-answer questions, including attempt tracking and scoring.

-  **Conversational Study Assistant**
  Chat with an AI tutor that understands your uploaded documents and answers questions contextually.

-  **Flexible AI Backend**
  Supports OpenAI models or local LLMs via Ollama, selectable through request headers.

-  **Electron Desktop Application**
  Bundles frontend and backend into a single cross-platform desktop app for Windows, macOS, and Linux.

-  **Developer-Friendly Tooling**
  CLI-based development workflow with hot reload, Electron builder configuration, and Python packaging support.

##  Performance & Design Notes

-  **Document Processing:** Optimized for lecture-sized PDFs; performance depends on document length and LLM selection

-  **AI Latency:** Local Ollama reduces API costs but may increase response time depending on hardware

-  **Architecture:** Frontend and backend communicate over HTTP, bundled into a single Electron app

-  **Storage:** Local SQLite database for low-latency access and offline-first usage

##  Current Limitations

- Large PDFs may increase processing time and memory usage

- AI response quality depends on the selected model and prompt configuration

- Local LLM performance is hardware-dependent

- Multi-document semantic linking is limited in the current version

##  Future Improvements

-  Add advanced study tools (concept maps, adaptive quizzes, progress analytics)

-  Improve document chunking and semantic retrieval accuracy

-  Personalize study plans based on performance trends

-  Optimize AI inference with streaming responses and caching

-  Optional cloud sync for multi-device usage

-  Expand exam generation with timed tests and difficulty scaling

##  How to Use (End Users)

StudyFlow is distributed as a prebuilt desktop application, so no development setup is required.

###  Download & Install

1. Navigate to the Releases page on GitHub.

2. Download the installer for your platform:
  - Windows: .exe
- Intel Macs: .dmg
- Apple Silicon Macs (M1, M2, M3): arm64.dmg

3. Run the installer and follow the setup prompts.

Important (Windows):
Ensure the installation destination is set to:
```text
C:\Users\{username}\AppData\Local\Programs\StudyFlow
```
###  First Launch

- Launch StudyFlow from your applications menu.

- On first run, the app initializes both the frontend UI and the embedded backend automatically.

- No manual server startup is required.

###  AI Model Setup (Optional but Recommended)

Upon first launch, you will be prompted to choose how StudyFlow handles AI processing:

####  Option 1: Local AI (Free)

- You will be prompted to download and install Ollama

- Ollama allows StudyFlow to run local LLMs on your machine

- No API key required

- Ideal for offline usage or avoiding usage costs
```text
⚠️ Local model performance depends on your system hardware (CPU/RAM).
```
####  Option 2: OpenAI API

- Skip Ollama installation

- Provide your OpenAI API key in the app settings

- Enables faster responses and access to higher-capability models

You can switch between local (Ollama) and OpenAI-backed models at any time via configuration headers or app settings.
