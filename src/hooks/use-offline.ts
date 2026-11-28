"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearCheckoutOutboxItem,
  flushCheckoutOutbox,
  listOutboxForBanner,
  retryCheckoutOutbox,
} from "@/lib/checkout-outbox";
import {
  FLUSH_OUTBOX_DONE_MESSAGE,
  OUTBOX_FLUSH_INTERVAL_MS,
  isFlushOutboxMessage,
  registerCheckoutBackgroundSync,
  shouldRegisterBackgroundSync,
} from "@/lib/checkout-flush";
import type { CheckoutOutboxItem } from "@/lib/checkout-idempotency";
import { getPendingSyncCount, syncPendingRecords } from "@/lib/storage";

export function useOnlineStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}

export function usePendingSync() {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<CheckoutOutboxItem[]>([]);
  const [retrying, setRetrying] = useState(false);
  const online = useOnlineStatus();
  const pendingRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (online) await syncPendingRecords();
      const pending = online ? await flushCheckoutOutbox() : await getPendingSyncCount();
      pendingRef.current = pending;
      if (shouldRegisterBackgroundSync(pending)) registerCheckoutBackgroundSync();
      const waiting = pending > 0 ? await listOutboxForBanner() : [];
      if (!cancelled) {
        setCount(pending);
        setItems(waiting);
      }
      return pending;
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden" && shouldRegisterBackgroundSync(pendingRef.current)) {
        registerCheckoutBackgroundSync();
      }
    };
    const onOnline = () => {
      void refresh();
    };
    const onSyncMessage = (event: MessageEvent) => {
      if (!isFlushOutboxMessage(event.data)) return;
      void refresh().then((pending) => {
        const reply = { type: FLUSH_OUTBOX_DONE_MESSAGE, pending };
        const source = event.source;
        if (source && "postMessage" in source) {
          source.postMessage(reply);
        }
      });
    };
    void refresh();
    const interval = setInterval(() => void refresh(), online ? OUTBOX_FLUSH_INTERVAL_MS : 5000);
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("online", onOnline);
    navigator.serviceWorker?.addEventListener("message", onSyncMessage);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("online", onOnline);
      navigator.serviceWorker?.removeEventListener("message", onSyncMessage);
    };
  }, [online]);

  const retry = async () => {
    setRetrying(true);
    try {
      const pending = online ? await retryCheckoutOutbox() : await getPendingSyncCount();
      setCount(pending);
      setItems(pending > 0 ? await listOutboxForBanner() : []);
    } finally {
      setRetrying(false);
    }
  };

  /** Office, Manager or Owner only; the banner checks the role and asks first. */
  const clear = async (id: string) => {
    const pending = await clearCheckoutOutboxItem(id);
    setCount(pending);
    setItems(pending > 0 ? await listOutboxForBanner() : []);
  };

  return { count, items, retry, retrying, online, clear };
}

interface SpeechRecognitionResultEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  start: () => void;
}

interface WindowWithSpeech extends Window {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
}

export function useSpeechRecognition() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");

  const start = (onResult: (text: string) => void) => {
    const win = window as WindowWithSpeech;
    const SpeechRecognitionClass =
      win.SpeechRecognition ?? win.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) return;

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onresult = (event: SpeechRecognitionResultEvent) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      onResult(text);
    };

    recognition.start();
  };

  return { listening, transcript, start };
}
