import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room } from '@trystero-p2p/core';
import LZString from 'lz-string';
import type { StoredTabsState } from '../types';
import { normalizeTabsState } from '../tabUtils';

export type TransferStatus = 'idle' | 'waiting' | 'connecting' | 'sent' | 'received' | 'error';

export interface TransferState {
  status: TransferStatus;
  code: string;
  /** Tabs preview of a received notebook (shown before the user confirms import). */
  receivedPreview: { titles: string[] } | null;
  error: string;
}

const APP_ID = 'notecal-transfer-v1';
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // No ambiguous 0/O, 1/I/L
const CODE_LENGTH = 8;
const ACTION_NAMESPACE = 'notebook';
const CONNECT_TIMEOUT_MS = 45000;
const SENDER_TIMEOUT_MS = 5 * 60 * 1000;

// Trystero's signaling requires WebCrypto, which only exists in secure contexts
// (HTTPS or localhost). On plain-HTTP origins the library hangs silently, so we
// must fail explicitly before joining a room.
const TRANSFER_SECURE_CONTEXT_ERROR =
  'Transfer needs a secure connection (HTTPS or localhost). Open the app via its HTTPS address.';

const isSecureForTransfer = () =>
  typeof crypto !== 'undefined' && typeof crypto.subtle === 'object' && crypto.subtle !== null;

// Unambiguous char class for display in the modal (used to reject likely typos)
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

const createTransferCode = () => {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
};

const encodeTabsState = (state: StoredTabsState) =>
  LZString.compressToUTF16(JSON.stringify(state));

export function useTransfer(
  tabsState: StoredTabsState,
  setTabsState: (state: StoredTabsState) => void,
) {
  const [state, setState] = useState<TransferState>({
    status: 'idle',
    code: '',
    receivedPreview: null,
    error: '',
  });

  const roomRef = useRef<Room | null>(null);
  const receivedStateRef = useRef<StoredTabsState | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const tabsStateRef = useRef(tabsState);
  tabsStateRef.current = tabsState;

  const clearConnectTimeout = () => {
    if (connectTimeoutRef.current !== null) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  };

  const leaveRoom = useCallback(() => {
    generationRef.current++;
    clearConnectTimeout();
    const room = roomRef.current;
    if (room) {
      roomRef.current = null;
      room.leave().catch(() => {});
    }
  }, []);

  useEffect(() => leaveRoom, [leaveRoom]);

  const reset = useCallback(() => {
    leaveRoom();
    receivedStateRef.current = null;
    setState({ status: 'idle', code: '', receivedPreview: null, error: '' });
  }, [leaveRoom]);

  /**
   * Send mode: join a room under a fresh code and push the current notebook
   * to whichever peer joins. Works from any device.
   */
  const startSending = useCallback(async () => {
    if (!isSecureForTransfer()) {
      setState({ status: 'error', code: '', receivedPreview: null, error: TRANSFER_SECURE_CONTEXT_ERROR });
      return;
    }
    leaveRoom();
    receivedStateRef.current = null;
    setState({ status: 'waiting', code: '', receivedPreview: null, error: '' });
    const myGeneration = generationRef.current;
    let joinRoom: typeof import('@trystero-p2p/nostr').joinRoom;
    try {
      ({ joinRoom } = await import('@trystero-p2p/nostr'));
    } catch {
      setState({ status: 'error', code: '', receivedPreview: null, error: 'Could not start transfer. Check your connection and try again.' });
      return;
    }
    if (myGeneration !== generationRef.current) return; // Aborted while loading
    const code = createTransferCode();
    const room = joinRoom({ appId: APP_ID }, `notecal-${code.toLowerCase()}`);
    roomRef.current = room;

    const sendNotebook = room.makeAction<string>(ACTION_NAMESPACE);

    room.onPeerJoin = (peerId) => {
      sendNotebook.send(encodeTabsState(tabsStateRef.current), { target: peerId })
        .then(() => {
          clearConnectTimeout();
          setState((prev) => ({ ...prev, status: 'sent' }));
        })
        .catch(() => setState((prev) => ({ ...prev, status: 'error', error: 'Sending failed.' })));
    };

    clearConnectTimeout();
    connectTimeoutRef.current = window.setTimeout(() => {
      connectTimeoutRef.current = null;
      leaveRoom();
      setState((prev) =>
        prev.status === 'waiting'
          ? { ...prev, status: 'error', error: 'No device connected. That code expired. Generate a new code and try again.' }
          : prev,
      );
    }, SENDER_TIMEOUT_MS);

    setState({ status: 'waiting', code, receivedPreview: null, error: '' });
  }, [leaveRoom]);

  /** Receive mode: join the room matching the entered code and wait for a payload. */
  const startReceiving = useCallback(async (rawCode: string) => {
    if (!isSecureForTransfer()) {
      setState({ status: 'error', code: '', receivedPreview: null, error: TRANSFER_SECURE_CONTEXT_ERROR });
      return;
    }
    const code = rawCode.trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) {
      setState({ status: 'error', code, receivedPreview: null, error: 'That code looks invalid.' });
      return;
    }
    setState({ status: 'connecting', code, receivedPreview: null, error: '' });
    leaveRoom();
    receivedStateRef.current = null;
    const myGeneration = generationRef.current;
    let joinRoom: typeof import('@trystero-p2p/nostr').joinRoom;
    try {
      ({ joinRoom } = await import('@trystero-p2p/nostr'));
    } catch {
      setState({ status: 'error', code, receivedPreview: null, error: 'Could not connect. Check your connection and try again.' });
      return;
    }
    if (myGeneration !== generationRef.current) return; // Aborted while loading
    const room = joinRoom({ appId: APP_ID }, `notecal-${code.toLowerCase()}`);
    roomRef.current = room;

    // Codes only validate format — a valid-format wrong code would wait forever
    // without an explicit timeout.
    clearConnectTimeout();
    connectTimeoutRef.current = window.setTimeout(() => {
      connectTimeoutRef.current = null;
      leaveRoom();
      setState((prev) =>
        prev.status === 'connecting'
          ? { ...prev, status: 'error', error: 'No device found with that code. Double-check it and try again.' }
          : prev,
      );
    }, CONNECT_TIMEOUT_MS);

    room.makeAction<string>(ACTION_NAMESPACE, {
      onMessage: (data) => {
        try {
          const json = LZString.decompressFromUTF16(data);
          const normalized = normalizeTabsState(JSON.parse(json));
          if (!normalized) throw new Error('invalid payload');
          room.onPeerLeave = null;
          receivedStateRef.current = normalized;
          leaveRoom(); // Payload received; no need to stay connected.
          setState({
            status: 'received',
            code,
            receivedPreview: { titles: normalized.tabs.map((tab) => tab.title) },
            error: '',
          });
        } catch {
          setState({ status: 'error', code, receivedPreview: null, error: 'Received corrupted data.' });
        }
      },
    });

    room.onPeerLeave = () => {
      setState((prev) =>
        prev.status === 'connecting' ? { ...prev, status: 'error', error: 'The other device disconnected.' } : prev,
      );
    };
  }, [leaveRoom]);

  /** Apply a received notebook over local state (same semantics as file import). */
  const confirmReceive = useCallback(() => {
    const received = receivedStateRef.current;
    if (received) {
      setTabsState(received);
      receivedStateRef.current = null;
    }
    reset();
  }, [reset, setTabsState]);

  return { state, reset, startSending, startReceiving, confirmReceive };
}
