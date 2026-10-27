"use client";

import { useEffect, useState } from "react";
import { flushCheckoutOutbox, retryCheckoutOutbox } from "@/lib/checkout-outbox";
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
  const [retrying, setRetrying] = useState(false);
  const online = useOnlineStatus();

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (online) await syncPendingRecords();
      const pending = online ? await flushCheckoutOutbox() : await getPendingSyncCount();
      if (!cancelled) setCount(pending);
    }
    void refresh();
    const interval = setInterval(() => void refresh(), online ? 15000 : 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [online]);

  const retry = async () => {
    setRetrying(true);
    try {
      const pending = online ? await retryCheckoutOutbox() : await getPendingSyncCount();
      setCount(pending);
    } finally {
      setRetrying(false);
    }
  };

  return { count, retry, retrying, online };
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
