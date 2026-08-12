// components/omenland/EventRow.tsx
"use client";

import React, { useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import styles from "@/app/styles/omenland.module.css";
import { TimelineEvent } from "@/components/omenland/omenTypes";

interface EventRowProps {
  item: TimelineEvent;
  collectionColor: string;
  isAdded?: boolean;
  onToggleAdd?: (event: TimelineEvent) => void;
  showYear?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  reversed?: boolean;
  rightButton?: React.ReactNode;
}

export function EventRow({
  item,
  collectionColor,
  isAdded,
  onToggleAdd,
  showYear = true,
  isExpanded: externalIsExpanded,
  onToggleExpand,
  reversed = false,
  rightButton,
}: EventRowProps) {
  const [internalIsExpanded, setInternalIsExpanded] = useState(false);

  const isExpanded = externalIsExpanded !== undefined ? externalIsExpanded : internalIsExpanded;
  const hasInfo = Boolean(item.description && item.description.trim().length > 0);

  const handleToggleExpand = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setInternalIsExpanded(!internalIsExpanded);
    }
  };

  const formattedYear = item.year
    ? item.year > 0
      ? `${item.year} AD`
      : `${Math.abs(item.year)} BC`
    : null;

  const isRemoveState = isAdded || reversed;

  return (
    <div className={styles.eventRowWrapper}>
      {/* Header Bar */}
      <div
        className={styles.eventRowHeader}
        style={{ flexDirection: reversed ? "row-reverse" : "row" }}
      >
        {/* Collection Color Border Indicator */}
        <div
          className={styles.eventColorIndicator}
          style={{
            backgroundColor: collectionColor || "#3b82f6",
            borderRadius: reversed ? "0 4px 4px 0" : "4px 0 0 4px",
          }}
        />

        {/* Title & Year */}
        <div
          className={`${styles.eventTitleBox} ${hasInfo ? styles.eventTitleBoxHover : ""}`}
          onClick={() => hasInfo && handleToggleExpand()}
        >
          <span className={styles.eventTitleText}>
            {showYear && formattedYear && (
              <span className={styles.eventYearSpan}>{formattedYear}</span>
            )}
            {item.subject || "Unnamed event"}
          </span>
        </div>

        {/* Actions */}
        <div className={styles.eventActionsBox}>
          {rightButton ? (
            rightButton
          ) : (
            <button
              type="button"
              className={styles.eventActionButton}
              onClick={(e) => {
                e.stopPropagation();
                onToggleAdd?.(item);
              }}
              title={isRemoveState ? "Remove from timeline" : "Add to timeline builder"}
            >
              {isRemoveState ? (
                <X size={12} color="#ef4444" />
              ) : (
                <Plus size={12} color="#22c55e" />
              )}
            </button>
          )}

          {hasInfo && (
            <button
              type="button"
              className={styles.eventChevronButton}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleExpand();
              }}
            >
              <ChevronDown
                size={12}
                color="#9ca3af"
                style={{
                  transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              />
            </button>
          )}
        </div>
      </div>

      {/* Accordion Extra Details */}
      {hasInfo && isExpanded && (
        <div className={styles.eventAccordionContent}>
          {item.description}
        </div>
      )}
    </div>
  );
}