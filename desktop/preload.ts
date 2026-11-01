/**
 * DịchPhim AI — Electron Preload Script (Context Bridge)
 * Cung cấp giao tiếp IPC an toàn giữa Giao diện React và Tiến trình chính Electron.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('dichphimDesktop', {
  isElectron: true,
  platform: process.platform,
  openVideoFolder: (): Promise<string[]> => ipcRenderer.invoke('dialog:openVideoFolder'),
  getBackendStatus: (): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('backend:getStatus'),
  restartBackend: (): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('backend:restart'),
});
