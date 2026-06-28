import { contextBridge, ipcRenderer } from "electron";
import type { z } from "zod";
import {
  GitHubIssueSchema,
  PickFolderResultSchema,
  ScanSnapshotSchema,
  type VeyebeDesktopApi,
} from "../shared/contracts";

const api: VeyebeDesktopApi = Object.freeze({
  version: 1,
  pickFolder: async () =>
    PickFolderResultSchema.parse(
      await ipcRenderer.invoke("veyebe:pick-folder"),
    ),
  scanFolder: async (path: string) =>
    ScanSnapshotSchema.parse(
      await ipcRenderer.invoke("veyebe:scan-folder", { path }),
    ),
  approveFeature: async (featureId: string) =>
    ScanSnapshotSchema.parse(
      await ipcRenderer.invoke("veyebe:approve-feature", { featureId }),
    ),
  syncApprovedPayload: async (bearerToken?: string) =>
    ipcRenderer.invoke("veyebe:sync-payload", { bearerToken }) as Promise<{ accepted: true; snapshotId: string }>,
  createGitHubIssue: async (input: z.infer<typeof GitHubIssueSchema>) =>
    ipcRenderer.invoke("veyebe:create-github-issue", GitHubIssueSchema.parse(input)) as Promise<{ url?: string; installUrl?: string }>,
  getGitHubInstallUrl: async () =>
    ipcRenderer.invoke("veyebe:github-install-url") as Promise<{ url: string } | { error: string }>,
});
contextBridge.exposeInMainWorld("veyebeDesktop", api);
