import type { StoredTabsState } from './types';

const DRIVE_FILE_NAME = 'notecal-tabs';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

async function findDriveFile(token: string): Promise<string | null> {
  const url = `${DRIVE_API}/files?q=name='${DRIVE_FILE_NAME}'&spaces=appDataFolder&fields=files(id,name)`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to search Drive');
  const data = await res.json();
  const file = data.files?.[0];
  return file ? file.id : null;
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

export async function saveToDrive(
  token: string,
  data: StoredTabsState,
): Promise<void> {
  let fileId = await findDriveFile(token);
  if (!fileId) {
    fileId = await createDriveFile(token);
  }
  await uploadContent(token, fileId, JSON.stringify(data));
}

export async function loadFromDrive(
  token: string,
): Promise<StoredTabsState | null> {
  const fileId = await findDriveFile(token);
  if (!fileId) return null;

  const url = `${DRIVE_API}/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to download from Drive');

  const data: unknown = await res.json();
  return data as StoredTabsState;
}
