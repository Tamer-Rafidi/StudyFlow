/**
 * Ollama Manager for Electron
 * Handles detection, installation, and lifecycle of Ollama
 */

const { exec, spawn } = require('child_process');
const { dialog, shell } = require('electron');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

const OLLAMA_PORT = 11434;
const OLLAMA_URL = `http://localhost:${OLLAMA_PORT}`;

class OllamaManager {
  constructor() {
    this.ollamaProcess = null;
    this.isInstalled = false;
    this.isRunning = false;
  }

  // ============================================================================
  // DETECTION
  // ============================================================================

  /**
   * Check if Ollama is installed on the system
   */
  async checkInstalled() {
    return new Promise((resolve) => {
      exec('ollama --version', (error, stdout) => {
        if (!error && stdout) {
          log.info('Ollama is installed:', stdout.trim());
          this.isInstalled = true;
          resolve(true);
        } else {
          log.info('Ollama is not installed');
          this.isInstalled = false;
          resolve(false);
        }
      });
    });
  }

  /**
   * Check if Ollama service is running
   */
  async checkRunning() {
    try {
      const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });
      this.isRunning = response.status === 200;
      log.info('Ollama is running:', this.isRunning);
      return this.isRunning;
    } catch (error) {
      this.isRunning = false;
      return false;
    }
  }

  /**
   * Get list of downloaded models
   */
  async getModels() {
    try {
      const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });
      const models = response.data.models || [];
      return models.map(m => m.name);
    } catch (error) {
      log.error('Error getting models:', error);
      return [];
    }
  }

  // ============================================================================
  // INSTALLATION
  // ============================================================================

  /**
   * Show installation dialog and open download page
   */
  async promptInstall(mainWindow) {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Ollama Not Installed',
      message: 'Local AI (Ollama) is not installed',
      detail: 
        'Ollama provides free local AI without requiring an API key.\n\n' +
        'Would you like to:\n' +
        '• Download Ollama (free, ~500MB)\n' +
        '• Use OpenAI instead (requires API key)\n' +
        '• Cancel and exit',
      buttons: ['Download Ollama', 'Use OpenAI', 'Cancel'],
      defaultId: 0,
      cancelId: 2
    });

    if (result.response === 0) {
      // Download Ollama
      const downloadUrl = this.getDownloadUrl();
      shell.openExternal(downloadUrl);
      
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Installing Ollama',
        message: 'Please install Ollama and restart this app',
        detail: 
          'Steps:\n' +
          '1. Complete the Ollama installation\n' +
          '2. Restart AI Study Assistant\n' +
          '3. The app will automatically detect Ollama\n\n' +
          'Or you can use OpenAI in Settings.',
        buttons: ['OK']
      });
      
      return 'download';
    } else if (result.response === 1) {
      // Use OpenAI instead
      return 'openai';
    } else {
      // Cancel
      return 'cancel';
    }
  }

  /**
   * Get appropriate download URL for current platform
   */
  getDownloadUrl() {
    const platform = process.platform;
    
    if (platform === 'win32') {
      return 'https://ollama.com/download/OllamaSetup.exe';
    } else if (platform === 'darwin') {
      return 'https://ollama.com/download/Ollama-darwin.zip';
    } else {
      // Linux
      return 'https://ollama.com/download/linux';
    }
  }

  // ============================================================================
  // LIFECYCLE MANAGEMENT
  // ============================================================================

  /**
   * Start Ollama service if not running
   */
  async startService() {
    if (await this.checkRunning()) {
      log.info('Ollama is already running');
      return true;
    }

    log.info('Starting Ollama service...');

    return new Promise((resolve) => {
      // Try to start Ollama
      if (process.platform === 'win32') {
        // Windows: Ollama runs as a service, just ping it
        exec('ollama serve', (error) => {
          if (error) {
            log.error('Failed to start Ollama:', error);
            resolve(false);
          }
        });
      } else if (process.platform === 'darwin') {
        // Mac: Start Ollama app
        exec('open -a Ollama', (error) => {
          if (error) {
            log.error('Failed to start Ollama:', error);
            resolve(false);
          }
        });
      } else {
        // Linux: Start as service
        this.ollamaProcess = spawn('ollama', ['serve'], {
          detached: true,
          stdio: 'ignore'
        });
        this.ollamaProcess.unref();
      }

      // Wait for service to be ready
      setTimeout(async () => {
        const running = await this.checkRunning();
        resolve(running);
      }, 5000);
    });
  }

  /**
   * Stop Ollama service (only if we started it)
   */
  stopService() {
    if (this.ollamaProcess) {
      log.info('Stopping Ollama service');
      this.ollamaProcess.kill();
      this.ollamaProcess = null;
    }
  }

  // ============================================================================
  // MODEL MANAGEMENT
  // ============================================================================

  /**
   * Check if required model is downloaded
   */
  async hasModel(modelName) {
    const models = await this.getModels();
    return models.some(m => m.includes(modelName));
  }

  /**
   * Download a model with progress
   */
  async downloadModel(modelName, progressCallback) {
    log.info(`Downloading model: ${modelName}`);

    return new Promise((resolve, reject) => {
      const process = spawn('ollama', ['pull', modelName]);

      process.stdout.on('data', (data) => {
        const output = data.toString();
        log.info(output);
        
        // Parse progress (Ollama outputs progress as percentages)
        const match = output.match(/(\d+)%/);
        if (match && progressCallback) {
          progressCallback(parseInt(match[1]));
        }
      });

      process.stderr.on('data', (data) => {
        log.error('Model download error:', data.toString());
      });

      process.on('close', (code) => {
        if (code === 0) {
          log.info(`Model ${modelName} downloaded successfully`);
          resolve(true);
        } else {
          reject(new Error(`Failed to download model: ${modelName}`));
        }
      });
    });
  }

  /**
   * Ensure required models are available
   */
  async ensureModels(mainWindow, requiredModels = ['llama3.2:3b']) {
    const models = await this.getModels();
    const missingModels = requiredModels.filter(
      required => !models.some(m => m.includes(required))
    );

    if (missingModels.length === 0) {
      log.info('All required models are available');
      return true;
    }

    // Ask user if they want to download missing models
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Download AI Models',
      message: `Missing AI models: ${missingModels.join(', ')}`,
      detail: 
        'These models are needed for local AI features.\n' +
        `Download size: ~2GB per model\n\n` +
        'You can also use OpenAI instead (Settings).',
      buttons: ['Download Now', 'Use OpenAI', 'Cancel'],
      defaultId: 0,
      cancelId: 2
    });

    if (result.response === 0) {
      // Download models
      for (const modelName of missingModels) {
        try {
          await this.downloadModelWithDialog(mainWindow, modelName);
        } catch (error) {
          log.error(`Failed to download ${modelName}:`, error);
          return false;
        }
      }
      return true;
    } else if (result.response === 1) {
      // Use OpenAI
      return 'openai';
    } else {
      // Cancel
      return false;
    }
  }

  /**
   * Download model with progress dialog
   */
  async downloadModelWithDialog(mainWindow, modelName) {
    return new Promise((resolve, reject) => {
      // Create progress dialog
      const progressWindow = new (require('electron').BrowserWindow)({
        width: 400,
        height: 200,
        parent: mainWindow,
        modal: true,
        show: false,
        frame: false,
        transparent: true,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        }
      });

      progressWindow.loadURL(`data:text/html,
        <html>
          <head>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: rgba(0,0,0,0.8);
                color: white;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                padding: 20px;
              }
              .progress-bar {
                width: 80%;
                height: 30px;
                background: rgba(255,255,255,0.2);
                border-radius: 15px;
                overflow: hidden;
                margin-top: 20px;
              }
              .progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #667eea, #764ba2);
                width: 0%;
                transition: width 0.3s;
              }
            </style>
          </head>
          <body>
            <h2>Downloading ${modelName}</h2>
            <p id="status">Starting download...</p>
            <div class="progress-bar">
              <div class="progress-fill" id="progress"></div>
            </div>
          </body>
        </html>
      `);

      progressWindow.once('ready-to-show', () => {
        progressWindow.show();
      });

      // Download with progress updates
      this.downloadModel(modelName, (percent) => {
        progressWindow.webContents.executeJavaScript(`
          document.getElementById('progress').style.width = '${percent}%';
          document.getElementById('status').textContent = '${percent}% complete';
        `);
      }).then(() => {
        progressWindow.close();
        resolve(true);
      }).catch((error) => {
        progressWindow.close();
        reject(error);
      });
    });
  }

  // ============================================================================
  // INITIALIZATION FLOW
  // ============================================================================

  /**
   * Complete initialization flow
   * Returns: 'ollama' | 'openai' | 'cancel'
   */
  async initialize(mainWindow) {
    log.info('Initializing Ollama...');

    // Step 1: Check if installed
    const installed = await this.checkInstalled();
    
    if (!installed) {
      log.info('Ollama not installed, prompting user...');
      const choice = await this.promptInstall(mainWindow);
      
      if (choice === 'download') {
        // User chose to download but hasn't installed yet
        return 'openai'; // Fallback to OpenAI for now
      } else if (choice === 'openai') {
        return 'openai';
      } else {
        return 'cancel';
      }
    }

    // Step 2: Check if running, start if needed
    let running = await this.checkRunning();
    
    if (!running) {
      log.info('Ollama not running, attempting to start...');
      running = await this.startService();
      
      if (!running) {
        log.error('Failed to start Ollama');
        
        const result = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Ollama Not Running',
          message: 'Could not start Ollama service',
          detail: 'Would you like to use OpenAI instead?',
          buttons: ['Use OpenAI', 'Try Again', 'Cancel'],
          defaultId: 0
        });

        if (result.response === 0) return 'openai';
        if (result.response === 1) return this.initialize(mainWindow); // Retry
        return 'cancel';
      }
    }

    // Step 3: Ensure required models are downloaded
    const modelsReady = await this.ensureModels(mainWindow);
    
    if (modelsReady === 'openai') {
      return 'openai';
    } else if (!modelsReady) {
      return 'cancel';
    }

    log.info('Ollama initialized successfully');
    return 'ollama';
  }
}

module.exports = OllamaManager;