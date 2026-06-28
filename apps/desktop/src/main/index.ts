import { app, BrowserWindow, dialog, ipcMain, utilityProcess, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import {
  ApproveFeatureSchema,
  GitHubIssueSchema,
  PickFolderResultSchema,
  ScanRequestSchema,
  ScanSnapshotSchema,
  SyncPayloadSchema,
  type ScanSnapshot,
} from '../shared/contracts'
import { createGitHubIssue, getGitHubInstallUrl, syncSnapshot } from './sync-client.js'

const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>()
let worker: ReturnType<typeof utilityProcess.fork> | undefined
let database: DatabaseSync | undefined
let latestSnapshot: ScanSnapshot | undefined

function isTrustedSender(event: IpcMainInvokeEvent) {
  const raw = event.senderFrame?.url
  if (!raw) return false
  const url = new URL(raw)
  if (app.isPackaged) return url.protocol === 'file:'
  return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
}

function persistSnapshot(value: unknown) {
  const snapshot = ScanSnapshotSchema.parse(value)
  latestSnapshot = snapshot
  database?.prepare(`INSERT OR REPLACE INTO scan_snapshots
    (id, project_name, analyzed_at, payload) VALUES (?, ?, ?, ?)`)
    .run(`${snapshot.projectName}:${snapshot.analyzedAt}`, snapshot.projectName, snapshot.analyzedAt, JSON.stringify(snapshot))
  return snapshot
}

function loadLatestSnapshot(): ScanSnapshot {
  if (latestSnapshot) return latestSnapshot
  const row = database?.prepare(`SELECT payload FROM scan_snapshots ORDER BY analyzed_at DESC LIMIT 1`).get() as { payload: string } | undefined
  if (!row) throw new Error('No project snapshot available. Scan a project first.')
  latestSnapshot = ScanSnapshotSchema.parse(JSON.parse(row.payload))
  return latestSnapshot
}

function scanner() {
  if (worker) return worker
  worker = utilityProcess.fork(join(__dirname, 'scanner-worker.js'), [], { serviceName: 'Veyebe local analyzer' })
  worker.on('message', (message: unknown) => {
    const data = message as { id?: string; result?: unknown; error?: string }
    if (!data.id) return
    const request = pending.get(data.id)
    if (!request) return
    clearTimeout(request.timer)
    pending.delete(data.id)
    if (data.error) request.reject(new Error(data.error))
    else request.resolve(persistSnapshot(data.result))
  })
  worker.on('exit', () => { worker = undefined })
  return worker
}

function scan(path: string) {
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Scan timed out after 60 seconds')) }, 60_000)
    pending.set(id, { resolve, reject, timer })
    scanner().postMessage({ id, path })
  })
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1500, height: 960, minWidth: 1040, minHeight: 680, backgroundColor: '#07090d',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      webSecurity: true, allowRunningInsecureContent: false,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault()
  })
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  database = new DatabaseSync(join(app.getPath('userData'), 'veyebe.sqlite'))
  database.exec(`CREATE TABLE IF NOT EXISTS scan_snapshots (
    id TEXT PRIMARY KEY, project_name TEXT NOT NULL, analyzed_at TEXT NOT NULL, payload TEXT NOT NULL
  )`)
  ipcMain.handle('veyebe:pick-folder', async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender')
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Choose a project to understand' })
    return PickFolderResultSchema.parse({ canceled: result.canceled, path: result.filePaths[0] })
  })
  ipcMain.handle('veyebe:scan-folder', (event, input: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender')
    return scan(ScanRequestSchema.parse(input).path)
  })
  ipcMain.handle('veyebe:approve-feature', (event, input: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender')
    const { featureId } = ApproveFeatureSchema.parse(input)
    const snapshot = loadLatestSnapshot()
    const updated = ScanSnapshotSchema.parse({
      ...snapshot,
      features: snapshot.features.map((feature) =>
        feature.id === featureId
          ? { ...feature, approved: true, state: feature.state === 'proposed' ? 'planned' : feature.state }
          : feature,
      ),
    })
    return persistSnapshot(updated)
  })
  ipcMain.handle('veyebe:sync-payload', async (event, input: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender')
    const { bearerToken } = SyncPayloadSchema.parse(input ?? {})
    const snapshot = loadLatestSnapshot()
    return syncSnapshot(snapshot, bearerToken)
  })
  ipcMain.handle('veyebe:create-github-issue', async (event, input: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender')
    const parsed = GitHubIssueSchema.parse(input)
    return createGitHubIssue(parsed)
  })
  ipcMain.handle('veyebe:github-install-url', async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender')
    return getGitHubInstallUrl()
  })
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { worker?.kill(); database?.close() })
