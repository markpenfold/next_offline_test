"use client";

import React, { useState } from "react";
// Import your store Hook (adjust path to match your project structure)
import { useUIStore } from "@/stores/useUIStore"; 
import {Brain, Sparkles, ChevronUp, ChevronDown } from "lucide-react";
import { WindowBar, WindowBarIconButton} from "@/components/omenland/WindowBar";
import styles from "@/app/styles/omenland.module.css";

export function AskGeminiButton() {
  const timelineBuilderEvents = useUIStore(
    (state) => state.timelineBuilderEvents
  );

  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const generatePrompt = () => {
    if (!timelineBuilderEvents || timelineBuilderEvents.length === 0) return "";

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
  const isDisabled = !timelineBuilderEvents || timelineBuilderEvents.length === 0;

  const handleLaunchGemini = () => {
    if (!promptText) return;
    const targetUrl = `https://aistudio.google.com/prompts/new_chat?prompt=${encodeURIComponent(
      promptText
    )}`;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

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

  return (
    <div className={styles.timelineBuilderWrapper}>
      <WindowBar title="Ask Gemini" icon={<Brain size={14} />}>
        <span className={styles.statusText}>
          {isDisabled
            ? "Add events to your timeline to enable analysis."
            : `Ready to analyze ${timelineBuilderEvents.length} events.`}
        </span>
      </WindowBar>

      <div className={styles.contentBody}>
        <div className={styles.actionRow}>
          
        <div className={styles.launchGroup}>
          <p className={styles.gemini_instruct}>
              Send your selected timeline of events to Gemini for instant analysis
            </p>
          <div className={styles.launchButtonGroup}>
           

            {!isDisabled && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={styles.toggleButton}
              aria-label={isExpanded ? "Hide Prompt" : "Show Prompt"}
            >
              <span className={styles.toggleLabel}>
                {isExpanded ? "Hide Prompt" : "Show Prompt"}
              </span>
              
            </button>
          )}
           <button
              onClick={handleLaunchGemini}
              disabled={isDisabled}
              className={styles.launchButton}
            >
              <Sparkles size={16} />
              Let's make history!
            </button>

          </div>

            
            <p className={styles.gemini_instruct}>
              Just hit 'Run' when you get there!
            </p>
          </div>


          
        </div>

        {!isDisabled && isExpanded && (
          <div className={styles.previewContainer}>
            <div className={styles.previewHeader}>
              <span className={styles.previewTitle}>Generated Prompt</span>
              <button
                onClick={handleCopyPrompt}
                className={styles.copyButton}
              >
                {copied ? "Copied!" : "Copy Text"}
              </button>
            </div>

            <pre className={styles.promptCodeBox}>{promptText}</pre>
          </div>
        )}
      </div>
    </div>
  );
}