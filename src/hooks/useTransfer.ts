import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room } from '@trystero-p2p/core';
import LZString from 'lz-string';
import type { StoredTabsState } from '../types';
import { normalizeTabsState } from '../tabUtils';
import { INITIAL_TEXT } from '../constants';

export type TransferStatus =
  | 'idle'
  /** Sender: code is on screen, waiting for the receiving device to join. */
  | 'waiting'
  /** Joined the room; waiting for the other device to appear or to send. */
  | 'connecting'
  /** Receiver: QR is on screen, waiting for the sending device to scan it. */
  | 'pairing'
  /** Sender opened from a `?send=` link; waiting for the user to confirm. */
  | 'ready-to-send'
  | 'sent'
  | 'received'
  | 'error';

export interface TransferState {
  status: TransferStatus;
  code: string;
  /** Tabs preview of a received notebook (shown before the user confirms import). */
  receivedPreview: { titles: string[] } | null;
  /** Tabs preview of what a `?send=` link would export (shown before the user confirms). */
  sendPreview: { titles: string[]; looksEmpty: boolean } | null;
  error: string;
}

const APP_ID = 'notecal-transfer-v1';
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // No ambiguous 0/O, 1/I/L
const CODE_LENGTH = 8;
const ACTION_NAMESPACE = 'notebook';
const CONNECT_TIMEOUT_MS = 45000;
const SENDER_TIMEOUT_MS = 5 * 60 * 1000;
const PAIRING_TIMEOUT_MS = 2 * 60 * 1000;

// Trystero's signaling requires WebCrypto, which only exists in secure contexts
// (HTTPS or localhost). On plain-HTTP origins the library hangs silently, so we
// must fail explicitly before joining a room.
const TRANSFER_SECURE_CONTEXT_ERROR =
  'Transfer needs a secure connection (HTTPS or localhost). Open the app via its HTTPS address.';

const isSecureForTransfer = () =>
  typeof crypto !== 'undefined' && typeof crypto.subtle === 'object' && crypto.subtle !== null;

// Unambiguous char class for display in the modal (used to reject likely typos)
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

const BASE_STATE: TransferState = {
  status: 'idle',
  code: '',
  receivedPreview: null,
  sendPreview: null,
  error: '',
};

const createTransferCode = () => {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
};

const encodeTabsState = (state: StoredTabsState) =>
  LZString.compressToUTF16(JSON.stringify(state));

const roomName = (code: string) => `notecal-${code.toLowerCase()}`;

/** True when this browser context only holds an untouched starter notebook. */
const looksLikeDefaultNotebook = (state: StoredTabsState) =>
  state.tabs.length === 1 &&
  (state.tabs[0].text.trim() === '' || state.tabs[0].text.trim() === INITIAL_TEXT.trim());

export function useTransfer(
  tabsState: StoredTabsState,
  setTabsState: (state: StoredTabsState) => void,
) {
  const [state, setState] = useState<TransferState>(BASE_STATE);

  const roomRef = useRef<Room | null>(null);
  const receivedStateRef = useRef<StoredTabsState | null>(null);
  const pendingSendCodeRef = useRef('');
  const connectTimeoutRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const tabsStateRef = useRef(tabsState);
  tabsStateRef.current = tabsState;

  const clearConnectTimeout = useCallback(() => {
    if (connectTimeoutRef.current !== null) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }, []);

  const leaveRoom = useCallback(() => {
    generationRef.current++;
    clearConnectTimeout();
    const room = roomRef.current;
    if (room) {
      roomRef.current = null;
      room.leave().catch(() => {});
    }
  }, [clearConnectTimeout]);

  useEffect(() => leaveRoom, [leaveRoom]);

  /** Bail out with an error unless the active session is still the one we started. */
  const armTimeout = useCallback((ms: number, fromStatus: TransferStatus, message: string) => {
    clearConnectTimeout();
    connectTimeoutRef.current = window.setTimeout(() => {
      connectTimeoutRef.current = null;
      leaveRoom();
      setState((prev) =>
        prev.status === fromStatus ? { ...prev, status: 'error', error: message } : prev,
      );
    }, ms);
  }, [clearConnectTimeout, leaveRoom]);

  /** Join a room as the sender: push the notebook to the first peer that joins. */
  const joinSenderRoom = useCallback(async (code: string, myGeneration: number) => {
    let joinRoom: typeof import('@trystero-p2p/nostr').joinRoom;
    try {
      ({ joinRoom } = await import('@trystero-p2p/nostr'));
    } catch {
      return null;
    }
    if (myGeneration !== generationRef.current) return null; // Aborted while loading
    const room = joinRoom({ appId: APP_ID }, roomName(code));
    roomRef.current = room;

    const sendNotebook = room.makeAction<string>(ACTION_NAMESPACE);
    room.onPeerJoin = (peerId) => {
      sendNotebook.send(encodeTabsState(tabsStateRef.current), { target: peerId })
        .then(() => {
          if (myGeneration !== generationRef.current) return; // Session was replaced
          clearConnectTimeout();
          setState((prev) => ({ ...prev, status: 'sent' }));
        })
        .catch(() => {
          if (myGeneration !== generationRef.current) return;
          setState((prev) => ({ ...prev, status: 'error', error: 'Sending failed.' }));
        });
    };

    return room;
  }, [clearConnectTimeout]);

  /** Join a room as the receiver and hand the payload to `receivedStateRef`. */
  const joinReceiverRoom = useCallback(async (code: string, myGeneration: number) => {
    let joinRoom: typeof import('@trystero-p2p/nostr').joinRoom;
    try {
      ({ joinRoom } = await import('@trystero-p2p/nostr'));
    } catch {
      return null;
    }
    if (myGeneration !== generationRef.current) return null; // Aborted while loading
    const room = joinRoom({ appId: APP_ID }, roomName(code));
    roomRef.current = room;

    room.makeAction<string>(ACTION_NAMESPACE, {
      onMessage: (data) => {
        // A stale room can still deliver during Trystero's leave grace window;
        // ignoring it prevents tearing down the newer session.
        if (myGeneration !== generationRef.current) return;
        try {
          const json = LZString.decompressFromUTF16(data);
          const normalized = normalizeTabsState(JSON.parse(json));
          if (!normalized) throw new Error('invalid payload');
          room.onPeerLeave = null;
          receivedStateRef.current = normalized;
          leaveRoom(); // Payload received; no need to stay connected.
          setState({
            ...BASE_STATE,
            status: 'received',
            code,
            receivedPreview: { titles: normalized.tabs.map((tab) => tab.title) },
          });
        } catch {
          setState({ ...BASE_STATE, status: 'error', code, error: 'Received corrupted data.' });
        }
      },
    });

    room.onPeerLeave = () => {
      if (myGeneration !== generationRef.current) return;
      setState((prev) =>
        prev.status === 'connecting' || prev.status === 'pairing'
          ? { ...prev, status: 'error', error: 'The other device disconnected.' }
          : prev,
      );
    };

    return room;
  }, [leaveRoom]);

  const reset = useCallback(() => {
    leaveRoom();
    receivedStateRef.current = null;
    pendingSendCodeRef.current = '';
    setState(BASE_STATE);
  }, [leaveRoom]);

  /**
   * Send mode: join a room under a fresh code and push the current notebook
   * to whichever peer joins. Works from any device.
   */
  const startSending = useCallback(async () => {
    if (!isSecureForTransfer()) {
      setState({ ...BASE_STATE, status: 'error', error: TRANSFER_SECURE_CONTEXT_ERROR });
      return;
    }
    leaveRoom();
    receivedStateRef.current = null;
    pendingSendCodeRef.current = '';
    setState({ ...BASE_STATE, status: 'waiting' });
    const myGeneration = generationRef.current;
    const code = createTransferCode();
    const room = await joinSenderRoom(code, myGeneration);
    if (myGeneration !== generationRef.current) return; // Aborted while loading
    if (!room) {
      setState({ ...BASE_STATE, status: 'error', error: 'Could not start transfer. Check your connection and try again.' });
      return;
    }

    armTimeout(SENDER_TIMEOUT_MS, 'waiting', 'No device connected. That code expired. Generate a new code and try again.');
    setState({ ...BASE_STATE, status: 'waiting', code });
  }, [armTimeout, joinSenderRoom, leaveRoom]);

  /**
   * Receiver-side pairing: open a room under a fresh code and show a QR for the
   * sending device to scan. The phone scans the computer's screen, which is far
   * easier than aiming a laptop webcam at a phone.
   */
  const startReceivingWithQr = useCallback(async () => {
    if (!isSecureForTransfer()) {
      setState({ ...BASE_STATE, status: 'error', error: TRANSFER_SECURE_CONTEXT_ERROR });
      return;
    }
    leaveRoom();
    receivedStateRef.current = null;
    const code = createTransferCode();
    setState({ ...BASE_STATE, status: 'pairing', code });
    const myGeneration = generationRef.current;
    const room = await joinReceiverRoom(code, myGeneration);
    if (myGeneration !== generationRef.current) return; // Aborted while loading
    if (!room) {
      setState({ ...BASE_STATE, status: 'error', code, error: 'Could not start transfer. Check your connection and try again.' });
      return;
    }

    armTimeout(PAIRING_TIMEOUT_MS, 'pairing', 'That QR expired. Show a new one and scan it again.');
  }, [armTimeout, joinReceiverRoom, leaveRoom]);

  /** Receive mode: join the room matching the entered code and wait for a payload. */
  const startReceiving = useCallback(async (rawCode: string) => {
    if (!isSecureForTransfer()) {
      setState({ ...BASE_STATE, status: 'error', error: TRANSFER_SECURE_CONTEXT_ERROR });
      return;
    }
    const code = rawCode.trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) {
      setState({ ...BASE_STATE, status: 'error', code, error: 'That code looks invalid.' });
      return;
    }
    leaveRoom();
    receivedStateRef.current = null;
    setState({ ...BASE_STATE, status: 'connecting', code });
    const myGeneration = generationRef.current;
    const room = await joinReceiverRoom(code, myGeneration);
    if (myGeneration !== generationRef.current) return; // Aborted while loading
    if (!room) {
      setState({ ...BASE_STATE, status: 'error', code, error: 'Could not connect. Check your connection and try again.' });
      return;
    }

    // Codes only validate format — a valid-format wrong code would wait forever
    // without an explicit timeout.
    armTimeout(CONNECT_TIMEOUT_MS, 'connecting', 'No device found with that code. Double-check it and try again.');
  }, [armTimeout, joinReceiverRoom, leaveRoom]);

  /**
   * Sender side of the flipped QR: a `?send=` link was scanned. Show what would
   * be exported and wait for an explicit confirmation — a QR is attacker
   * controllable, so this must never send on its own.
   */
  const prepareSendTo = useCallback((rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) {
      setState({ ...BASE_STATE, status: 'error', error: 'That link has an invalid transfer code.' });
      return;
    }
    const current = tabsStateRef.current;
    pendingSendCodeRef.current = code;
    setState({
      ...BASE_STATE,
      status: 'ready-to-send',
      code,
      sendPreview: {
        titles: current.tabs.map((tab) => tab.title),
        looksEmpty: looksLikeDefaultNotebook(current),
      },
    });
  }, []);

  /** Confirmed `?send=` link: join the receiving device's room and push. */
  const confirmSend = useCallback(async () => {
    const code = pendingSendCodeRef.current;
    if (!code) return;
    if (!isSecureForTransfer()) {
      setState({ ...BASE_STATE, status: 'error', error: TRANSFER_SECURE_CONTEXT_ERROR });
      return;
    }
    leaveRoom();
    setState({ ...BASE_STATE, status: 'connecting', code });
    const myGeneration = generationRef.current;
    const room = await joinSenderRoom(code, myGeneration);
    if (myGeneration !== generationRef.current) return; // Aborted while loading
    if (!room) {
      setState({ ...BASE_STATE, status: 'error', code, error: 'Could not connect. Check your connection and try again.' });
      return;
    }

    armTimeout(CONNECT_TIMEOUT_MS, 'connecting', 'Could not reach that device. The QR may have expired — scan a fresh one and try again.');
  }, [armTimeout, joinSenderRoom, leaveRoom]);

  /** Apply a received notebook over local state (same semantics as file import). */
  const confirmReceive = useCallback(() => {
    const received = receivedStateRef.current;
    if (received) {
      setTabsState(received);
      receivedStateRef.current = null;
    }
    reset();
  }, [reset, setTabsState]);

  return {
    state,
    reset,
    startSending,
    startReceiving,
    startReceivingWithQr,
    prepareSendTo,
    confirmSend,
    confirmReceive,
  };
}
