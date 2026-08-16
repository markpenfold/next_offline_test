'use client';
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { TimelineEvent, LINK_TYPES } from '@/components/omenland/omenTypes';
import { X, ChevronDown, Plus, Notebook, Link2Off, CircleDot } from 'lucide-react';
import { useUIStore } from '@/stores/useUIStore';
import { useDATAStore } from '@/stores/useDataStore';
import classes from './graph.module.css';
import { LinkTypeSelect } from './LinkTypeSelect';
import { calculateEventProbability, getIncomingLinks } from '@/lib/utils/probability';

// Helper hook replacing the missing external useAccordion hook
function useAccordion(initialState = false) {
  const [isExpanded, setIsExpanded] = useState(initialState);
  const toggle = useCallback(() => setIsExpanded((prev) => !prev), []);
  return { isExpanded, toggle, setIsExpanded };
}

function weightToFillPercent(weight: number): number {
  return ((weight + 100) / 200) * 100;
}

function fillPercentToWeight(percent: number): number {
  return Math.round((percent / 100) * 200 - 100);
}

interface GraphEventCardProps {
  item: TimelineEvent;
  onRemove: (id: string) => void;
  bg: string;
}

export function GraphEventCard({ item, onRemove, bg }: GraphEventCardProps) {
  const getCollectionColor = useDATAStore((state) => state.getSlotColor);
  const collectionColor = getCollectionColor(item.fileName) || '#6b7280';
  const timelineBuilderEvents = useUIStore((state) => state.timelineBuilderEvents);
  const hoveredNode = useUIStore((state) => state.hoveredNode);
  const selectedNode = useUIStore((state) => state.selectedNode);
  const selectedLink = useUIStore((state) => state.selectedLink);
  const setSelectedNode = useUIStore((state) => state.setSelectedNode);
  const isHovered = hoveredNode === item._id;

  const { isExpanded, toggle: baseToggle, setIsExpanded } = useAccordion();

  const toggle = useCallback(() => {
    const willExpand = !isExpanded;
    baseToggle();
    setSelectedNode(willExpand ? item._id : null);
  }, [isExpanded, baseToggle, setSelectedNode, item._id]);

  const removeEventLink = useUIStore((state) => state.removeEventLink);
  const addEventLink = useUIStore((state) => state.addEventLink);
  const updateEventLinkWeight = useUIStore((state) => state.updateEventLinkWeight);
  const updateEventNote = useUIStore((state) => state.updateEventNote);
  const setIsUiDragging = useUIStore((state) => state.setIsUiDragging);

  const { isExpanded: isLinkEditorOpen, toggle: toggleLinkEditor } = useAccordion();

  const [linkTypeByEvent, setLinkTypeByEvent] = useState<Record<string, string>>({});
  const [draggingLink, setDraggingLink] = useState<string | null>(null);
  const [tooltipInfo, setTooltipInfo] = useState<{ weight: number; x: number; y: number } | null>(null);
  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const prevExpandedRef = useRef(false);
  const firstSliderRef = useRef<HTMLDivElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const prevSelectedNodeRef = useRef<string | null>(null);
  const prevSelectedLinkTargetRef = useRef<string | null>(null);

  const probability = useMemo(() => {
    return calculateEventProbability(item._id, timelineBuilderEvents);
  }, [item._id, timelineBuilderEvents]);

  const incomingLinks = useMemo(() => {
    return getIncomingLinks(item._id, timelineBuilderEvents);
  }, [item._id, timelineBuilderEvents]);

  const openNoteEditor = (targetId: string) => {
    const targetEvent = timelineBuilderEvents.find((e) => e._id === targetId);
    setNoteText(targetEvent?.userNote || '');
    setEditingNoteFor(targetId);
    setTimeout(() => noteInputRef.current?.focus(), 50);
  };

  const saveNote = () => {
    if (editingNoteFor) {
      updateEventNote(editingNoteFor, noteText);
      setEditingNoteFor(null);
      setNoteText('');
    }
  };

  useEffect(() => {
    if (isExpanded && !prevExpandedRef.current && incomingLinks.length > 0) {
      const showTimer = setTimeout(() => {
        if (firstSliderRef.current) {
          const rect = firstSliderRef.current.getBoundingClientRect();
          const firstLink = incomingLinks[0].link;
          const weight = firstLink.weight ?? 0;
          const weightPercent = weightToFillPercent(weight);
          const x = rect.left + (rect.width * weightPercent) / 100;
          setTooltipInfo({ weight, x, y: rect.top - 24 });
        }
      }, 50);

      const hideTimer = setTimeout(() => setTooltipInfo(null), 2000);

      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }
    prevExpandedRef.current = isExpanded;
  }, [isExpanded, incomingLinks]);

  useEffect(() => {
    const wasThisNode = prevSelectedNodeRef.current === item._id;
    const isThisNode = selectedNode === item._id;

    if (isThisNode && !wasThisNode) {
      setIsExpanded(true);
    } else if (!isThisNode && wasThisNode) {
      setIsExpanded(false);
    }

    prevSelectedNodeRef.current = selectedNode;
  }, [selectedNode, item._id, setIsExpanded]);

  useEffect(() => {
    const targetId = selectedLink?.targetId ?? null;
    const wasThisNode = prevSelectedLinkTargetRef.current === item._id;
    const isThisNode = targetId === item._id;

    if (isThisNode && !wasThisNode) {
      setIsExpanded(true);
    } else if (!isThisNode && wasThisNode) {
      setIsExpanded(false);
    }

    prevSelectedLinkTargetRef.current = targetId;
  }, [selectedLink, item._id, setIsExpanded]);

  const handleWeightDrag = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, sourceId: string, linkType: string) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const weight = fillPercentToWeight(percent);
      updateEventLinkWeight(sourceId, item._id, linkType, weight);
      setTooltipInfo({ weight, x: e.clientX, y: rect.top - 24 });
    },
    [item._id, updateEventLinkWeight]
  );

  const handleMouseDown = (sourceId: string, linkType: string, e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setDraggingLink(`${sourceId}-${linkType}`);
    setIsUiDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const weight = fillPercentToWeight(percent);
    setTooltipInfo({ weight, x: e.clientX, y: rect.top - 24 });
  };

  const handleMouseUp = () => {
    setDraggingLink(null);
    setTooltipInfo(null);
    setIsUiDragging(false);
  };

  return (
    <div className={`${classes.nodeWrapper} ${isExpanded ? 'event-node-expanded' : ''}`}>
      <div className={`${classes.graphEventHolder} ${isHovered ? classes.hoveredBg : ''}`}>
        <div
          className={`${classes.eventrow} ${classes.pointerCursor} ${isExpanded ? classes.expanded : ''}`}
          onClick={toggle}
        >
          {incomingLinks.length > 0 ? (
            <span
              className={`${classes.probabilityBadge} ${
                probability >= 50 ? classes.probGreen : classes.probRed
              }`}
              title={`Probability based on ${incomingLinks.length} incoming link${
                incomingLinks.length > 1 ? 's' : ''
              }`}
            >
              {probability}%
            </span>
          ) : (
            <CircleDot size={10} fill={collectionColor} strokeWidth={0} />
          )}
          <span>{item.subject}</span>

          <div className={classes.buttonz}>
            <ChevronDown
              size={14}
              color="#efefef"
              strokeWidth={1.5}
              className={isExpanded ? classes.rotate180 : classes.rotate0}
            />

            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item._id);
              }}
              className="flex items-center hover:scale-110 transition-transform"
              aria-label="Remove from timeline"
            >
              <X size={12} color="#ef4444" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className={classes.listHolder}>
          {incomingLinks.length > 0 && (
            <ul className={classes.linkListActive}>
              {incomingLinks.map(({ sourceEvent, link }, index) => {
                const sourceId = sourceEvent._id;
                const linkType = link.linkType;
                const weight = link.weight ?? 0;

                const linkTypeInfo = LINK_TYPES[linkType];
                const weightPercent = weightToFillPercent(weight);
                const linkKey = `${sourceId}-${linkType}`;
                const isDragging = draggingLink === linkKey;
                const linkColor = linkTypeInfo?.color || '#6b7280';

                return (
                  <React.Fragment key={`${sourceId}-${linkType}-${index}`}>
                    <li
                      className={`${classes.linkListItem} ${
                        index % 2 === 0 ? classes.linkListItemEven : classes.linkListItemOdd
                      }`}
                    >
                      <LinkTypeSelect
                        value={linkType}
                        onChange={(newType) => {
                          if (newType !== linkType) {
                            removeEventLink(sourceId, item._id, linkType);
                            addEventLink(sourceId, item._id, newType, weight);
                          }
                        }}
                        color={linkTypeInfo?.color}
                      />

                      <div
                        ref={index === 0 ? firstSliderRef : undefined}
                        className={classes.sliderContainer}
                        style={{
                          background: `linear-gradient(to right, ${linkColor} 0%, ${linkColor} ${weightPercent}%, transparent ${weightPercent}%)`,
                        }}
                        onMouseDown={(e) => handleMouseDown(sourceId, linkType, e)}
                        onMouseMove={(e) => isDragging && handleWeightDrag(e, sourceId, linkType)}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                      >
                        <span className={`${classes.linkText} ${classes.linkTextDark}`}>
                          {sourceEvent.subject}
                        </span>
                      </div>

                      <div className={classes.buttonz}>
                        <button
                          onClick={() => openNoteEditor(sourceId)}
                          className={`flex items-center hover:scale-140 transition-transform ${classes.noteIconButton}`}
                          aria-label="Add note"
                        >
                          <Notebook
                            size={11}
                            color={sourceEvent.userNote ? '#22c55e' : '#1b1b1b'}
                            fill={sourceEvent.userNote ? '#22c55e' : 'none'}
                            strokeWidth={2.0}
                          />
                        </button>
                        <button
                          onClick={() => removeEventLink(sourceId, item._id, linkType)}
                          className={`flex items-center hover:scale-140 transition-transform ${classes.noteIconButton}`}
                          aria-label="Remove link"
                        >
                          <Link2Off size={11} color="#ef4444" strokeWidth={2.0} />
                        </button>
                      </div>
                    </li>

                    {editingNoteFor === sourceId && (
                      <li className={classes.noteEditorContainer}>
                        <textarea
                          ref={noteInputRef}
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Add a note about this connection..."
                          className={classes.noteTextarea}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.metaKey) {
                              saveNote();
                            }
                            if (e.key === 'Escape') {
                              setEditingNoteFor(null);
                              setNoteText('');
                            }
                          }}
                        />
                        <div className={classes.noteActions}>
                          <button
                            onClick={() => {
                              setEditingNoteFor(null);
                              setNoteText('');
                            }}
                            className={classes.cancelBtn}
                          >
                            Cancel
                          </button>
                          <button onClick={saveNote} className={classes.saveBtn}>
                            Save
                          </button>
                        </div>
                      </li>
                    )}
                  </React.Fragment>
                );
              })}
            </ul>
          )}

          <div className={classes.headerRow}>
            <div className={classes.linkAddTab} onClick={toggleLinkEditor}>
              <Plus
                size={14}
                color="#efefef"
                strokeWidth={1.5}
                className={`${isLinkEditorOpen ? classes.rotate180 : classes.rotate0} ${classes.transitionTransform}`}
              />
              <span>Incoming Influences</span>
            </div>
          </div>

          {isLinkEditorOpen && timelineBuilderEvents.length > 1 && (
            <ul className={classes.linkListAdd}>
              {timelineBuilderEvents
                .filter((e) => e._id !== item._id)
                .map((event: TimelineEvent, index: number) => {
                  const linkType = linkTypeByEvent[event._id] || 'contributing_factor';
                  return (
                    <li
                      key={event._id || `item-${index}`}
                      className={`${classes.linkListItem} ${
                        index % 2 === 0 ? classes.linkListItemEven : classes.linkListItemOdd
                      }`}
                    >
                      <LinkTypeSelect
                        value={linkType}
                        onChange={(newType) =>
                          setLinkTypeByEvent((prev) => ({ ...prev, [event._id]: newType }))
                        }
                        color={LINK_TYPES[linkType]?.color}
                      />
                      <CircleDot
                        size={10}
                        fill={getCollectionColor(event?.master_category || '#22c55e') ?? undefined}
                        strokeWidth={0}
                      />

                      <span className={`${classes.linkText} ${classes.linkTextDark}`}>
                        {event.subject}
                      </span>
                      <button
                        onClick={() => addEventLink(event._id, item._id, linkType)}
                        aria-label="add incoming influence"
                        className={`flex items-center hover:scale-140 transition-transform ${classes.noteIconButton}`}
                      >
                        <Plus size={12} color={'#22c55e'} strokeWidth={1.5} />
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      )}

      {tooltipInfo && (
        <div
          className={classes.weightTooltip}
          style={{
            left: tooltipInfo.x,
            top: tooltipInfo.y,
          }}
        >
          Weight: {tooltipInfo.weight > 0 ? '+' : ''}
          {tooltipInfo.weight}%
        </div>
      )}
    </div>
  );
}