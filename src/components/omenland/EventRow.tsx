// components/omenland/EventRow.tsx
"use client";

import React, { useState } from "react";
import { ChevronDown, Plus, Check } from "lucide-react";
import styles from "@/app/styles/omenland.module.css";
import { TimelineEvent } from "@/components/omenland/omenTypes";

interface EventRowProps {
  item: TimelineEvent;
  collectionColor: string;
  isAdded: boolean;
  onToggleAdd: (event: TimelineEvent) => void;
  showYear?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function EventRow({
  item,
  collectionColor,
  isAdded,
  onToggleAdd,
  showYear = true,
  isExpanded: externalIsExpanded,
  onToggleExpand,
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

  const formattedYear = item.date_obj?.year
    ? item.date_obj.year > 0
      ? `${item.date_obj.year} AD`
      : `${Math.abs(item.date_obj.year)} BC`
    : null;

  return (
    <div className={styles.eventRowWrapper}>
      {/* Header Bar */}
      <div className={styles.eventRowHeader}>
        {/* Collection Color Border */}
        <div
          className={styles.eventColorIndicator}
          style={{ backgroundColor: collectionColor || "#3b82f6" }}
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
          <button
            type="button"
            className={styles.eventActionButton}
            onClick={(e) => {
              e.stopPropagation();
              onToggleAdd(item);
            }}
            title={isAdded ? "Remove from timeline builder" : "Add to timeline builder"}
          >
            {isAdded ? (
              <Check size={12} color="#22c55e" />
            ) : (
              <Plus size={12} color="#ef4444" />
            )}
          </button>

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