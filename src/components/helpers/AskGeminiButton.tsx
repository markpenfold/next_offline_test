"use client";

import React, { useState } from "react";
// Import your store Hook (adjust path to match your project structure)
import { useUIStore } from "@/stores/useUIStore"; 

export function AskGeminiButton() {
  // Grab the events list from your Zustand store
  const timelineBuilderEvents = useUIStore(
    (state) => state.timelineBuilderEvents
  );

  const [copied, setCopied] = useState(false);

  // 1. Helper function to generate the raw prompt string
  const generatePrompt = () => {
    if (!timelineBuilderEvents || timelineBuilderEvents.length === 0) {
      return "";
    }

    const formattedEvents = timelineBuilderEvents
      .map((e) => `- ${e.subject} (${e.year})`)
      .join("\n");

      return (
        `You are a master historical storyteller and analytical historian. ` +
        `I have a list of historical events, and I want you to construct a single, cohesive "Unified Historical Theory" ` +
        `or compelling overarching narrative that weaves ALL (or as many as humanly possible) of these events together.\n\n` +
        `EVENTS TO WEAVE TOGETHER:\n` +
        `${formattedEvents}\n\n` +
        `INSTRUCTIONS:\n` +
        `1. **The Core Thesis / Story Title:** Give this grand connection a creative, compelling title.\n` +
        `2. **The Chain Reaction:** Narrate how Event A directly caused, indirectly triggered, or set up the socio-economic conditions for Event B, C, and beyond.\n` +
        `3. **Thematic Threads:** Highlight hidden motifs (e.g., shifts in power, technology, resource scarcity, ideological pivots) that tie these moments across time.\n` +
        `4. **The Big Reveal:** Explain how this whole sequence of events reshaped the course of human history in a way no single event could have done on its own.\n\n` +
        `Make it engaging, insightful, and logically grounded (even when highlighting unexpected butterfly effects).`
      );
  };

  const promptText = generatePrompt();

  // 2. Open Gemini in a new tab with the pre-filled URL query
  const handleLaunchGemini = () => {
    if (!promptText) return;

    // AI Studio supports direct prompt population via URL parameter
    const targetUrl = `https://aistudio.google.com/prompts/new_chat?prompt=${encodeURIComponent(
      promptText
    )}`;
    
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  // 3. Fallback/Manual copy handler
  const handleCopyPrompt = async () => {
    if (!promptText) return;
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  const isDisabled = !timelineBuilderEvents || timelineBuilderEvents.length === 0;

  return (
    <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Action Header & Launch Button */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900">Ask Gemini AI</h3>
          <p className="text-xs text-gray-500">
            {isDisabled
              ? "Add events to your timeline to enable analysis."
              : `Ready to analyze ${timelineBuilderEvents.length} events.`}
          </p>
        </div>

        <button
          onClick={handleLaunchGemini}
          disabled={isDisabled}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <SparklesIcon className="h-4 w-4" />
          Ask Gemini
        </button>
      </div>

      {/* Visible Prompt Preview Box */}
      {!isDisabled && (
        <div className="mt-4 rounded-lg bg-gray-50 p-3 border border-gray-100">
          <div className="flex items-center justify-between pb-2 border-b border-gray-200/60 mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Generated Prompt
            </span>
            <button
              onClick={handleCopyPrompt}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              {copied ? "Copied!" : "Copy Text"}
            </button>
          </div>

          <pre className="whitespace-pre-wrap font-sans text-xs text-gray-700 max-h-36 overflow-y-auto">
            {promptText}
          </pre>
        </div>
      )}
    </div>
  );
}

// Simple SVG icon helper
function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
      <path d="M12 3c.3 0 .5.2.6.4l1.5 4.5 4.5 1.5c.3.1.4.3.4.6s-.2.5-.4.6l-4.5 1.5-1.5 4.5c-.1.3-.3.4-.6.4s-.5-.2-.6-.4l-1.5-4.5-4.5-1.5c-.3-.1-.4-.3-.4-.6s.2-.5.4-.6l4.5-1.5 1.5-4.5c.1-.2.3-.4.6-.4z font-semibold" />
    </svg>
  );
}