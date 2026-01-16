const { app, BrowserWindow, dialog, Menu, Tray } = require('electron');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');
const axios = require('axios');
const http = require('http');
const OllamaManager = require('./ollama-manager');
const ollamaManager = new OllamaManager();

// Configure logging
log.transports.file.level = 'info';
autoUpdater.logger = log;

let mainWindow;
let tray;
let backendProcess;
let isQuitting = false;

const IS_DEV = process.argv.includes('--dev');
const BACKEND_PORT = 8000;

// ============================================================================
// AUTO-UPDATER (GitHub Releases)
// ============================================================================

if (!IS_DEV && app.isPackaged) {
  // Configure GitHub releases
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'Tamer-Rafidi',
    repo: 'StudyFlow'
  });

  // Check for updates on startup
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 5000);

  // Check every 2 hours
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 2 * 60 * 60 * 1000);

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available!`,
      detail: 'Would you like to download it now?',
      buttons: ['Download', 'Later'],
      defaultId: 0
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent);
    log.info(`Download progress: ${percent}%`);
    if (mainWindow) {
      mainWindow.setProgressBar(progress.percent / 100);
    }
  });

  autoUpdater.on('update-downloaded', () => {
    log.info('Update downloaded');
    if (mainWindow) {
      mainWindow.setProgressBar(-1);
    }
    
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update has been downloaded!',
      detail: 'The app will restart to install the update.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0
    }).then((result) => {
      if (result.response === 0) {
        // Force quit before installing
        isQuitting = true;
        
        // Stop backend cleanly
        stopBackend();
        
        // Give backend time to close
        setTimeout(() => {
          // Quit and install with force close
          autoUpdater.quitAndInstall(false, true);  // (isSilent, isForceRunAfter)
        }, 1000);
      }
    });
  });
}

// ============================================================================
// APP LIFECYCLE
// ============================================================================

app.on('ready', async () => {
  createWindow();
  createTray();
  await initializeApp();
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBackend();
  ollamaManager.stopService();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

// ============================================================================
// WINDOW & TRAY
// ============================================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'AI Study Assistant',
    show: false,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'loading.html'));
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  createMenu();
}

function createTray() {
  // Tray icon (optional, nice to have)
  const iconPath = path.join(__dirname, '../build/icons/icon.png');
  
  if (require('fs').existsSync(iconPath)) {
    tray = new Tray(iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open AI Study Assistant',
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setToolTip('AI Study Assistant');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      mainWindow.show();
      mainWindow.focus();
    });
  }
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => {
            if (!IS_DEV && app.isPackaged) {
              autoUpdater.checkForUpdates();
            } else {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                message: 'Updates are only available in production builds'
              });
            }
          }
        },
        { type: 'separator' },
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About',
              message: `AI Study Assistant v${app.getVersion()}`,
              detail: 'AI-powered study tool for students\n\n'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ============================================================================
// BACKEND MANAGEMENT (Bundled Python - No Docker!)
// ============================================================================

async function initializeApp() {
  updateStatus('Initializing...');

  // Step 1: Check for Ollama (optional, user can choose OpenAI)
  const aiChoice = await ollamaManager.initialize(mainWindow);
  
  if (aiChoice === 'cancel') {
    app.quit();
    return;
  }
  
  log.info(`User selected AI provider: ${aiChoice}`);
  
  // Step 2: Start backend
  updateStatus('Starting backend...');

  const backendPath = getBackendPath();
  
  if (!backendPath) {
    showError('Backend executable not found. Please reinstall the app.');
    return;
  }

  log.info('Backend path:', backendPath);

  // Get user data directory
  const userDataDir = app.getPath('userData');
  log.info('User data directory:', userDataDir);

  // Get frontend path
  const frontendPath = getFrontendPath();
  log.info('Frontend path:', frontendPath);

  // Start backend process
  backendProcess = spawn(backendPath, [], {
    env: {
      ...process.env,
      DATA_DIR: userDataDir,
      FRONTEND_DIR: frontendPath,
      PORT: BACKEND_PORT.toString(),
      PYTHONUNBUFFERED: '1',
      AI_PROVIDER: aiChoice  // Pass the choice to backend
    },
    cwd: path.dirname(backendPath),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  backendProcess.stdout.on('data', (data) => {
    log.info(`Backend: ${data.toString().trim()}`);
  });

  backendProcess.stderr.on('data', (data) => {
    log.error(`Backend Error: ${data.toString().trim()}`);
  });

  backendProcess.on('error', (error) => {
    log.error('Failed to start backend:', error);
    showError(`Backend failed to start: ${error.message}`);
  });

  backendProcess.on('exit', (code, signal) => {
    log.info(`Backend exited with code ${code}, signal ${signal}`);
    if (code !== 0 && code !== null && !isQuitting) {
      showError('Backend crashed unexpectedly. Please restart the app.');
    }
  });

  // Wait for backend to be ready
  updateStatus('Waiting for backend...');
  
  if (await waitForBackend(90000)) {  // 90 second timeout
    log.info('Backend is ready!');
    updateStatus('Loading application...');
    
    // Load frontend (served from backend)
    mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`);
  } else {
    showError('Backend failed to start within 90 seconds. Please check logs.');
  }
}

function stopBackend() {
  if (backendProcess) {
    log.info('Stopping backend...');
    
    try {
      // Try graceful shutdown first
      backendProcess.kill('SIGTERM');
      
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (backendProcess && !backendProcess.killed) {
          log.warn('Force killing backend...');
          backendProcess.kill('SIGKILL');
        }
      }, 5000);
    } catch (error) {
      log.error('Error stopping backend:', error);
    }
    
    backendProcess = null;
  }
}

function getBackendPath() {
  let backendExe;

  if (process.platform === 'win32') {
    backendExe = 'backend.exe';
  } else {
    backendExe = 'backend';
  }

  let backendPath;

  if (app.isPackaged) {
    // Production: backend is unpacked from ASAR in app.asar.unpacked
    // Try multiple possible locations
    const possiblePaths = [
      // New location: unpacked from ASAR
      path.join(process.resourcesPath, 'app.asar.unpacked', 'backend-staging', backendExe),
      // Fallback: old location in resources
      path.join(process.resourcesPath, 'backend', backendExe),
      // Another fallback: directly in resources
      path.join(process.resourcesPath, 'backend-staging', backendExe)
    ];

    const fs = require('fs');
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        backendPath = testPath;
        log.info(`Found backend at: ${backendPath}`);
        break;
      } else {
        log.info(`Backend not found at: ${testPath}`);
      }
    }

    if (!backendPath) {
      log.error('Backend not found in any expected location!');
      log.error('Searched paths:', possiblePaths);
      return null;
    }
  } else {
    // Development: backend is in backend/dist
    backendPath = path.join(__dirname, '../backend/dist', backendExe);
  }

  // Check if file exists
  const fs = require('fs');
  if (!fs.existsSync(backendPath)) {
    log.error(`Backend not found at: ${backendPath}`);
    return null;
  }

  // Make executable on Unix systems
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(backendPath, '755');
    } catch (error) {
      log.warn('Could not set backend permissions:', error);
    }
  }

  return backendPath;
}

function getFrontendPath() {
  let frontendPath;
  
  if (app.isPackaged) {
    // Production: frontend is in resources
    frontendPath = path.join(process.resourcesPath, 'frontend');
  } else {
    // Development: frontend is in frontend/dist
    frontendPath = path.join(__dirname, '../frontend/dist');
  }
  
  // Verify it exists
  const fs = require('fs');
  const indexPath = path.join(frontendPath, 'index.html');
  
  if (!fs.existsSync(indexPath)) {
    log.error(`Frontend not found at: ${frontendPath}`);
    log.error(`  Index path: ${indexPath}`);
    log.error(`  Exists: ${fs.existsSync(frontendPath)}`);
  } else {
    log.info(`Frontend found at: ${frontendPath}`);
  }
  
  return frontendPath;
}

function checkBackendHealth() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: BACKEND_PORT,
      path: '/api/health',
      method: 'GET',
      timeout: 5000,  
      family: 4  
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        log.info(`Health check response: status=${res.statusCode}, length=${data.length} bytes`);
        
        try {
          const parsed = JSON.parse(data);
          
          if (res.statusCode === 200) {
            log.info(`Health check SUCCESS: ${parsed.status}`);
            resolve({ success: true, data: parsed });
          } else {
            log.warn(`Health check got non-200: ${res.statusCode}`);
            reject(new Error(`Status ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          log.error('Health check parse error:', e.message);
          log.error('Raw response:', data);
          reject(new Error('Invalid JSON response'));
        }
      });
    });

    req.on('error', (error) => {
      log.debug(`Health check request error: ${error.message}`);
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      log.debug('Health check timeout after 5 seconds');
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function waitForBackend(timeout = 90000) {
  const start = Date.now();
  let attempts = 0;

  updateStatus('Connecting to backend...');
  log.info('Starting backend health checks...');
  log.info(`Will timeout after ${timeout / 1000} seconds`);

  while (Date.now() - start < timeout) {
    attempts++;
    const elapsed = Math.round((Date.now() - start) / 1000);
    
    try {
      log.info(`[Attempt ${attempts}] Checking backend health... (${elapsed}s elapsed)`);
      
      // Use native HTTP module (works better with localhost on Windows)
      const result = await checkBackendHealth();
      
      if (result && result.success) {
        log.info('Backend health check PASSED!');
        log.info('Status:', result.data.status);
        log.info(`Total attempts: ${attempts}`);
        log.info(`Total time: ${elapsed}s`);
        updateStatus('Backend connected!');
        return true;
      } else {
        log.warn('Health check returned but success=false');
      }
      
    } catch (error) {
      if (attempts === 1) {
        log.info('Waiting for backend to start...');
      }
      
      log.debug(`[Attempt ${attempts}] Failed: ${error.message}`);
      
      if (attempts % 5 === 0) {
        log.info(`Still waiting... (${attempts} attempts, ${elapsed}s)`);
        updateStatus(`Connecting to backend... (${elapsed}s)`);
      }
      await sleep(3000);
    }
  }

  log.error(`Backend health check TIMEOUT after ${attempts} attempts ✗✗✗`);
  log.error(`Elapsed time: ${Math.round((Date.now() - start) / 1000)} seconds`);
  return false;
}

// ============================================================================
// HELPERS
// ============================================================================

function updateStatus(msg) {
  log.info(msg);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('status-update', msg);
  }
  if (tray) {
    tray.setToolTip(`AI Study Assistant - ${msg}`);
  }
}

function showError(msg) {
  log.error(msg);
  dialog.showErrorBox('Error', msg);
  if (!isQuitting) {
    app.quit();
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// IPC HANDLERS
// ============================================================================

const { ipcMain } = require('electron');

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});