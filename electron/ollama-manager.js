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
const OLLAMA_URL = `http://127.0.0.1:${OLLAMA_PORT}`;

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
    const nativeResult = await this.checkRunningNative();
  
    if (nativeResult) {
      this.isRunning = true;
      log.info('Ollama is running (native check)');
      return true;
    }

    try {
      log.debug(`Checking Ollama at ${OLLAMA_URL}/api/tags`);
      
      const response = await axios.get(`${OLLAMA_URL}/api/tags`, { 
        timeout: 5000,
        validateStatus: () => true  // Accept any status code
      });
      
      log.info(`Ollama check response: status=${response.status}`);
      
      this.isRunning = response.status === 200;
      
      if (this.isRunning) {
        log.info('✓ Ollama is running');
      } else {
        log.warn(`Ollama responded but with status ${response.status}`);
      }
      
      return this.isRunning;
    } catch (error) {
      log.error('Ollama check failed:', {
        code: error.code,
        message: error.message,
        url: OLLAMA_URL
      });
      
      this.isRunning = false;
      return false;
    }
  }
  
  checkRunningNative() {
  return new Promise((resolve) => {
    const http = require('http');
    
    const options = {
      hostname: '127.0.0.1',  
      port: OLLAMA_PORT,
      path: '/api/tags',
      method: 'GET',
      timeout: 3000,
      family: 4  // Force IPv4
    };

    const req = http.request(options, (res) => {
      log.info(`Native Ollama check: status=${res.statusCode}`);
      resolve(res.statusCode === 200);
    });

    req.on('error', (error) => {
      log.debug('Native Ollama check error:', error.code);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      log.debug('Native Ollama check timeout');
      resolve(false);
    });

    req.end();
  });
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
        '• Download Ollama (free, ~5GB)\n' +
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

    if (process.platform === 'win32') {
      // Windows: Try multiple methods to start Ollama
      
      // Method 1: Start Ollama GUI app
      try {
        exec('start ollama app', (error) => {
          if (error) log.debug('Method 1 (start ollama app) failed:', error.message);
        });
      } catch (e) {
        log.debug('Method 1 exception:', e.message);
      }
      
      // Method 2: Try ollama serve in background
      try {
        spawn('ollama', ['serve'], {
          detached: true,
          stdio: 'ignore',
          shell: true
        }).unref();
      } catch (e) {
        log.debug('Method 2 (ollama serve) exception:', e.message);
      }
      
      // Method 3: Try to start from installation path
      const possiblePaths = [
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Ollama', 'ollama.exe'),
      ];
      
      for (const ollamaPath of possiblePaths) {
        if (fs.existsSync(ollamaPath)) {
          log.info(`Found Ollama at: ${ollamaPath}`);
          try {
            spawn(ollamaPath, ['serve'], {
              detached: true,
              stdio: 'ignore'
            }).unref();
            break;
          } catch (e) {
            log.debug('Failed to start from path:', e.message);
          }
        }
      }
      
      // Wait longer for Windows service to start
      log.info('Waiting for Ollama service to start...');
      
      for (let i = 0; i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (await this.checkRunning()) {
          log.info(`Ollama service started successfully after ${(i + 1) * 2} seconds`);
          return true;
        }
        
        log.debug(`Still waiting for Ollama... (${(i + 1) * 2}s elapsed)`);
      }
      
      log.warn('Ollama service did not start after 30 seconds');
      return false;
      
    } else if (process.platform === 'darwin') {
      // macOS: Try multiple methods
      
      // Method 1: Open Ollama.app
      try {
        exec('open -a Ollama', (error) => {
          if (error) log.debug('Method 1 (open -a Ollama) failed:', error.message);
        });
      } catch (e) {
        log.debug('Method 1 exception:', e.message);
      }
      
      // Method 2: Try ollama serve
      try {
        spawn('ollama', ['serve'], {
          detached: true,
          stdio: 'ignore'
        }).unref();
      } catch (e) {
        log.debug('Method 2 (ollama serve) exception:', e.message);
      }
      
      // Method 3: Try from Applications folder
      const appPath = '/Applications/Ollama.app';
      if (fs.existsSync(appPath)) {
        try {
          exec(`open "${appPath}"`, (error) => {
            if (error) log.debug('Method 3 (open from Applications) failed:', error.message);
          });
        } catch (e) {
          log.debug('Method 3 exception:', e.message);
        }
      }
      
      log.info('Waiting for Ollama service to start...');
      
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (await this.checkRunning()) {
          log.info(`Ollama service started successfully after ${(i + 1) * 2} seconds`);
          return true;
        }
        
        log.debug(`Still waiting for Ollama... (${(i + 1) * 2}s elapsed)`);
      }
      
      log.warn('Ollama service did not start after 20 seconds');
      return false;
    }
    
    return false;
  }

  /**
   * Stop Ollama service (only if we started it)
   */
  stopService() {
    if (this.ollamaProcess) {
      log.info('Stopping Ollama service');
      try {
        this.ollamaProcess.kill();
      } catch (e) {
        log.debug('Error killing Ollama process:', e.message);
      }
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