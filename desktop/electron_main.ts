/**
 * DịchPhim AI — Tiến trình chính Electron (Windows / macOS / Linux)
 * - Tự động giải quyết đường dẫn tài nguyên (process.resourcesPath / app.getAppPath)
 *   và thư mục dữ liệu người dùng có quyền ghi (app.getPath('userData'))
 * - Tự động dò tìm Python khả dụng (Python đóng gói kèm hoặc Python hệ thống)
 * - Khởi chạy Backend Python (backend/main.py) trên cổng nội bộ 8443
 * - Kiểm tra /health, mở giao diện React và tắt sạch tiến trình con khi đóng ứng dụng
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let pythonProcess: ChildProcess | null = null;
let backendReady = false;
let backendLastError = '';
const FASTAPI_PORT = Number(process.env.DICHPHIM_BACKEND_PORT || 8443);

function getResourcesRoot(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.resolve(__dirname, '..');
}

function getUserDataRoot(): string {
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    const fallback = path.join(process.cwd(), 'dichphim_userdata');
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

function resolvePythonCommand(resourcesRoot: string): { cmd: string; prefixArgs: string[]; isFrozenBinary: boolean } {
  // 1. Kiểm tra file thực thi Python backend đã đóng gói độc lập (PyInstaller)
  const frozenCandidates = [
    path.join(resourcesRoot, 'backend', 'dichphim-backend.exe'),
    path.join(resourcesRoot, 'backend', 'dichphim-backend'),
  ];
  for (const bin of frozenCandidates) {
    if (fs.existsSync(bin)) {
      return { cmd: bin, prefixArgs: [], isFrozenBinary: true };
    }
  }

  // 2. Kiểm tra Python nhúng đi kèm bộ cài (Embedded Python trong resources/python)
  const embeddedCandidates = [
    path.join(resourcesRoot, 'python', 'python.exe'),
    path.join(resourcesRoot, 'python', 'bin', 'python3'),
  ];
  for (const py of embeddedCandidates) {
    if (fs.existsSync(py)) {
      return { cmd: py, prefixArgs: [], isFrozenBinary: false };
    }
  }

  // 3. Dò tìm Python trên hệ điều hành mà không phụ thuộc đường dẫn cứng
  const systemCandidates: Array<{ cmd: string; args: string[] }> =
    process.platform === 'win32'
      ? [
          { cmd: 'python.exe', args: [] },
          { cmd: 'py.exe', args: ['-3'] },
          { cmd: 'python3.exe', args: [] },
        ]
      : [
          { cmd: 'python3', args: [] },
          { cmd: 'python', args: [] },
        ];

  for (const candidate of systemCandidates) {
    try {
      const check = spawnSync(candidate.cmd, [...candidate.args, '--version'], {
        stdio: 'ignore',
        timeout: 2000,
        windowsHide: true,
      });
      if (check.status === 0) {
        return { cmd: candidate.cmd, prefixArgs: candidate.args, isFrozenBinary: false };
      }
    } catch {
      // Thử ứng viên tiếp theo
    }
  }

  return {
    cmd: process.platform === 'win32' ? 'python.exe' : 'python3',
    prefixArgs: [],
    isFrozenBinary: false,
  };
}

function checkBackendHealth(): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${FASTAPI_PORT}/health`, { timeout: 1200 }, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk.toString();
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function startPythonBackend(): Promise<void> {
  const existing = await checkBackendHealth();
  if (existing && existing.ok) {
    backendReady = true;
    return;
  }

  const resourcesRoot = getResourcesRoot();
  const userDataRoot = getUserDataRoot();
  const backendScript = path.join(resourcesRoot, 'backend', 'main.py');
  const resolved = resolvePythonCommand(resourcesRoot);

  const args = resolved.isFrozenBinary
    ? [
        '--host',
        '127.0.0.1',
        '--port',
        String(FASTAPI_PORT),
        '--data-dir',
        userDataRoot,
        '--resources-dir',
        resourcesRoot,
      ]
    : [
        ...resolved.prefixArgs,
        backendScript,
        '--host',
        '127.0.0.1',
        '--port',
        String(FASTAPI_PORT),
        '--data-dir',
        userDataRoot,
        '--resources-dir',
        resourcesRoot,
      ];

  try {
    pythonProcess = spawn(resolved.cmd, args, {
      cwd: userDataRoot,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        DICHPHIM_DATA_DIR: userDataRoot,
        DICHPHIM_RESOURCES_DIR: resourcesRoot,
      },
      stdio: 'pipe',
      windowsHide: true,
    });

    pythonProcess.stderr?.on('data', (chunk: Buffer) => {
      backendLastError = chunk.toString().slice(-500);
    });
  } catch (err: any) {
    backendLastError = err?.message || String(err);
    return;
  }

  // Chờ tối đa 6 giây cho đến khi /health phản hồi
  for (let attempt = 0; attempt < 24; attempt++) {
    const health = await checkBackendHealth();
    if (health && health.ok) {
      backendReady = true;
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

function stopPythonBackend(): void {
  if (!pythonProcess) return;
  try {
    if (process.platform === 'win32' && pythonProcess.pid) {
      spawnSync('taskkill', ['/pid', String(pythonProcess.pid), '/f', '/t'], {
        windowsHide: true,
      });
    } else {
      pythonProcess.kill('SIGTERM');
    }
  } catch (err) {
    console.error('Lỗi khi đóng tiến trình Python:', err);
  } finally {
    pythonProcess = null;
    backendReady = false;
  }
}

async function createMainWindow(): Promise<void> {
  await startPythonBackend();

  const resourcesRoot = getResourcesRoot();
  const preloadPath = fs.existsSync(path.join(__dirname, 'preload.cjs'))
    ? path.join(__dirname, 'preload.cjs')
    : path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'DịchPhim AI — Dịch Video Trung-Việt Theo Ngữ Cảnh',
    backgroundColor: '#020617',
    webPreferences: {
      preload: fs.existsSync(preloadPath) ? preloadPath : undefined,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.ELECTRON_START_URL;
  const builtIndexHtml = path.join(resourcesRoot, 'dist', 'index.html');
  const localDistHtml = path.resolve(__dirname, '..', 'dist', 'index.html');

  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else if (fs.existsSync(builtIndexHtml)) {
    await mainWindow.loadFile(builtIndexHtml);
  } else if (fs.existsSync(localDistHtml)) {
    await mainWindow.loadFile(localDistHtml);
  } else {
    await mainWindow.loadURL('http://127.0.0.1:3000');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.argv.includes('--smoke-test')) {
    const health = await checkBackendHealth();
    console.log(
      JSON.stringify({
        smokeTest: 'PASSED',
        windowLoaded: true,
        backendReady,
        backendHealth: health,
        resourcesRoot,
        userDataRoot: getUserDataRoot(),
      })
    );
    stopPythonBackend();
    app.exit(0);
  }
}

ipcMain.handle('dialog:openVideoFolder', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn video hoặc thư mục phim Trung Quốc',
    properties: ['openFile', 'openDirectory', 'multiSelections'],
    filters: [{ name: 'Video Phim', extensions: ['mp4', 'mkv', 'avi', 'mov', 'flv', 'webm'] }],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('backend:getStatus', async () => {
  const health = await checkBackendHealth();
  return {
    ok: Boolean(health?.ok),
    backendReady,
    port: FASTAPI_PORT,
    health,
    lastError: backendLastError,
    resourcesRoot: getResourcesRoot(),
    userDataRoot: getUserDataRoot(),
  };
});

ipcMain.handle('backend:restart', async () => {
  stopPythonBackend();
  await startPythonBackend();
  const health = await checkBackendHealth();
  return { ok: Boolean(health?.ok), health };
});

app.whenReady().then(createMainWindow);

app.on('will-quit', () => {
  stopPythonBackend();
});

app.on('window-all-closed', () => {
  stopPythonBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
