import type { NoteTab, StoredTabsState } from './types';

const DRIVE_FILE_NAME = 'notecal-tabs';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

const fileIdCache = new Map<string, string>();

async function findDriveFile(token: string): Promise<string | null> {
  const url = `${DRIVE_API}/files?q=name='${DRIVE_FILE_NAME}'&spaces=appDataFolder&fields=files(id,name)`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to search Drive');
  const data = await res.json();
  const file = data.files?.[0];
  const id = file ? file.id : null;
  if (id) fileIdCache.set(token, id);
  else fileIdCache.delete(token);
  return id;
}

async function createDriveFile(token: string): Promise<string> {
  const res = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: DRIVE_FILE_NAME, parents: ['appDataFolder'] }),
  });
  if (!res.ok) throw new Error('Failed to create Drive file');
  const data = await res.json();
  return data.id;
}

async function downloadContent(token: string, fileId: string): Promise<StoredTabsState | null> {
  const url = `${DRIVE_API}/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to download from Drive');
  const data: unknown = await res.json();
  return data as StoredTabsState;
}

async function uploadContent(token: string, fileId: string, content: string) {
  const res = await fetch(
    `${DRIVE_UPLOAD}/files/${fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: content,
    },
  );
  if (!res.ok) throw new Error('Failed to upload to Drive');
}

function mergeTabs(localTabs: NoteTab[], remoteTabs: NoteTab[]): NoteTab[] {
  const tabMap = new Map<string, NoteTab>();

  for (const tab of remoteTabs) {
    tabMap.set(tab.id, tab);
  }

  for (const tab of localTabs) {
    const existing = tabMap.get(tab.id);
    if (!existing || tab.lastModified >= existing.lastModified) {
      tabMap.set(tab.id, tab);
    }
  }

  return Array.from(tabMap.values());
}

export async function saveToDrive(
  token: string,
  data: StoredTabsState,
): Promise<StoredTabsState> {
  let fileId = fileIdCache.get(token) ?? await findDriveFile(token);
  if (!fileId) {
    fileId = await createDriveFile(token);
    fileIdCache.set(token, fileId);
  }

  const remoteState = await downloadContent(token, fileId);

  let merged = data;
  if (remoteState && remoteState.updatedAt > data.updatedAt) {
    merged = {
      tabs: mergeTabs(data.tabs, remoteState.tabs),
      activeTabId: data.activeTabId,
      updatedAt: Date.now(),
    };
  } else {
    merged = { ...data, updatedAt: Date.now() };
  }

  await uploadContent(token, fileId, JSON.stringify(merged));
  return merged;
}

export async function loadFromDrive(
  token: string,
): Promise<StoredTabsState | null> {
  const fileId = fileIdCache.get(token) ?? await findDriveFile(token);
  if (!fileId) return null;

  return downloadContent(token, fileId);
}
