"use client";

import { useEffect, useState } from "react";
import { getPendingSyncCount } from "@/lib/storage";

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
  const online = useOnlineStatus();

  useEffect(() => {
    async function check() {
      const c = await getPendingSyncCount();
      setCount(c);
    }
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [online]);

  return count;
}

export function useSpeechRecognition() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");

  const start = (onResult: (text: string) => void) => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      onResult(text);
    };

    recognition.start();
  };

  return { listening, transcript, start };
}
