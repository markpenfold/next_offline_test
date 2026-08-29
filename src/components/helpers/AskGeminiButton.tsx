"use client";

import React, { useState } from "react";
import { useUIStore } from "@/stores/useUIStore"; 
import { Brain, Sparkles, Network } from "lucide-react";
import { WindowBar } from "@/components/omenland/WindowBar";
import { LINK_TYPES } from "@/components/omenland/omenTypes";
import styles from "@/app/styles/omenland.module.css";

export function AskGeminiButton() {
  const timelineBuilderEvents = useUIStore(
    (state) => state.timelineBuilderEvents
  );

  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activePromptMode, setActivePromptMode] = useState<"basic" | "advanced">("basic");

  // Standard linear timeline prompt
  const generateBasicPrompt = () => {
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
      `3. **Thematic Threads:** Highlight hidden motifs (e.g., shifts in power, technology, resource scarcity) across time.\n` +
      `4. **The Big Reveal:** Explain how this whole sequence of events reshaped history.`
    );
  };

  // Advanced prompt incorporating graph edges, weights, notes, and descriptions
  const generateAdvancedPrompt = () => {
    if (!timelineBuilderEvents || timelineBuilderEvents.length === 0) return "";

    const eventMap = new Map(timelineBuilderEvents.map((e) => [e._id, e]));

    const formattedEvents = timelineBuilderEvents
      .map((event) => {
        const yearStr = event.year
          ? event.year > 0
            ? `${event.year} AD`
            : `${Math.abs(event.year)} BC`
          : "Undated";

        let entry = `### ${event.subject} (${yearStr})`;

        if (event.description) {
          entry += `\n- Description: ${event.description}`;
        }

        if (event.linkedTo && event.linkedTo.length > 0) {
          entry += `\n- Direct Causal Relationships:`;
          event.linkedTo.forEach((link) => {
            const targetId = typeof link === "string" ? link : link.targetId;
            const linkType = typeof link === "string" ? "contributing_factor" : link.linkType;
            const weight = typeof link === "string" ? 0 : link.weight;
            const targetEvent = eventMap.get(targetId);

            if (targetEvent) {
              const relationshipLabel = LINK_TYPES[linkType]?.label || linkType;
              entry += `\n  * [${relationshipLabel}] (Influence Weight: ${weight > 0 ? "+" : ""}${weight}%) -> "${targetEvent.subject}"`;
            }
          });
        }

        if (event.userNote) {
          entry += `\n- User Analysis Note: "${event.userNote}"`;
        }

        return entry;
      })
      .join("\n\n");

    return (
      `You are a master historical storyteller and analytical historian.\n` +
      `Construct a single, cohesive "Unified Historical Theory" weaving together these historical events along with their specific causal relationships, influence weights, and analytical notes.\n\n` +
      `EVENTS & RELATIONSHIPS MATRIX:\n\n` +
      `${formattedEvents}\n\n` +
      `INSTRUCTIONS:\n` +
      `1. **Core Thesis:** Provide a creative title for this connected historical narrative.\n` +
      `2. **The Chain Reaction:** Respect the user-defined relationships and influence weights to explain how events directly or indirectly shaped outcomes.\n` +
      `3. **User Notes Integration:** Seamlessly incorporate the provided user analysis notes into the story logic.\n` +
      `4. **The Big Reveal:** Explain how this specific network of influences reshaped history.`
    );
  };

  const isDisabled = !timelineBuilderEvents || timelineBuilderEvents.length === 0;
  const currentPromptText = activePromptMode === "advanced" ? generateAdvancedPrompt() : generateBasicPrompt();

  const handleLaunchGemini = (mode: "basic" | "advanced") => {
    const promptText = mode === "advanced" ? generateAdvancedPrompt() : generateBasicPrompt();
    if (!promptText) return;

    setActivePromptMode(mode);

    const targetUrl = `https://aistudio.google.com/prompts/new_chat?prompt=${encodeURIComponent(
      promptText
    )}`;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  const handleCopyPrompt = async () => {
    if (!currentPromptText) return;
    try {
      await navigator.clipboard.writeText(currentPromptText);
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
              Send your timeline and causal relationships to Gemini for analysis
            </p>

            <div className={styles.launchButtonGroup}>
              {/* Standard Launch Button */}
              <button
                onClick={() => handleLaunchGemini("basic")}
                disabled={isDisabled}
                className={styles.launchButton}
                title="Launch Gemini with standard timeline"
              >
                <Sparkles size={16} />
                Timeline Prompt
              </button>

              {/* Advanced Graph Launch Button */}
              <button
                onClick={() => handleLaunchGemini("advanced")}
                disabled={isDisabled}
                className={styles.launchButton}
                style={{ backgroundColor: "#8b5cf6" }}
                title="Launch Gemini with full event relationships, weights, and notes"
              >
                <Network size={16} />
                Graph & Link Prompt
              </button>

              
            </div>
          </div>
        </div>

        {!isDisabled && isExpanded && (
          <div className={styles.previewContainer}>
            <div className={styles.previewHeader}>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setActivePromptMode("basic")}
                  style={{
                    fontWeight: activePromptMode === "basic" ? "bold" : "normal",
                    opacity: activePromptMode === "basic" ? 1 : 0.6,
                  }}
                >
                  Standard Preview
                </button>
                |
                <button
                  onClick={() => setActivePromptMode("advanced")}
                  style={{
                    fontWeight: activePromptMode === "advanced" ? "bold" : "normal",
                    opacity: activePromptMode === "advanced" ? 1 : 0.6,
                  }}
                >
                  Advanced Preview
                </button>
              </div>

              <button onClick={handleCopyPrompt} className={styles.copyButton}>
                {copied ? "Copied!" : "Copy Text"}
              </button>
            </div>

            <pre className={styles.promptCodeBox}>{currentPromptText}</pre>
          </div>
        )}
      </div>
    </div>
  );
}