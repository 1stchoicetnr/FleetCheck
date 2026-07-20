"use client";

import { useSpeechRecognition } from "@/hooks/use-offline";
import { Mic, MicOff } from "lucide-react";
import { Button } from "./ui/button";

interface VoiceInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

export function VoiceInput({
  value,
  onChange,
  placeholder = "Tap mic to speak or type here...",
  rows = 3,
}: VoiceInputProps) {
  const { listening, start } = useSpeechRecognition();

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl border border-gray-300 px-4 py-3 pr-14 text-base focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none resize-none"
      />
      <Button
        type="button"
        variant={listening ? "danger" : "ghost"}
        size="sm"
        className="absolute right-2 top-2 !min-h-[36px] !px-2"
        onClick={() => start(onChange)}
        aria-label="Voice input"
      >
        {listening ? (
          <MicOff className="h-5 w-5 animate-pulse" />
        ) : (
          <Mic className="h-5 w-5" />
        )}
      </Button>
    </div>
  );
}
