import {app, BrowserWindow, dialog, ipcMain, shell} from 'electron';
import type http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startWebServer} from '../web/server.js';

let mainWindow: BrowserWindow | undefined;
let webServer: http.Server | undefined;
let webUrl: string | undefined;

app.setName('会话管家');

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });
}

async function createWindow() {
  if (!webUrl) {
    const started = await startWebServer({
      host: '127.0.0.1',
      port: 0,
      open: false,
      scan: true
    });
    webServer = started.server;
    webUrl = started.url;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: '会话管家',
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(path.dirname(fileURLToPath(import.meta.url)), 'preload.js')
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({url}) => {
    void shell.openExternal(url);
    return {action: 'deny'};
  });

  await mainWindow.loadURL(webUrl);
}

if (gotSingleInstanceLock) {
  app.whenReady().then(async () => {
    await createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  webServer?.close();
});

ipcMain.handle('app:select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  });
  return result.canceled ? undefined : result.filePaths[0];
});

ipcMain.handle('app:minimize', () => mainWindow?.minimize());
ipcMain.handle('app:maximize', () => {
  if (!mainWindow) {
    return false;
  }
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }
  mainWindow.maximize();
  return true;
});
ipcMain.handle('app:close', () => mainWindow?.close());
