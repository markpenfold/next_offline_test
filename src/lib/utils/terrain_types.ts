// ============================================================================
// TYPES
// ============================================================================
import { Vector3 } from 'three';
import type { BufferGeometry } from 'three';

/**
 * Date object structure containing year and optional month/day
 * - year: The primary temporal coordinate (can be negative for BCE)
 * - month: Optional month (1-12)
 * - day: Optional day of month
 * - time: Optional time components [hours, minutes, seconds]
 * - approximate: Flag indicating if the date is approximate/uncertain
 */
export type DateObj = {
  year: number;
  month?: number;
  day?: number;
  time?: number[];
  approximate?: boolean;
}

export interface HoverInfo {
  position: Vector3;
  year: number | null; // Can be null when no valid intersection
}

export type LinkTypeSelectProps = {
  value: string;
  onChange: (value: string) => void;
  color: string;
};
/**
 * Link type definition for graph edges
 * - id: Unique identifier for the link type
 * - label: Human-readable name
 * - weight: Default weight for this type (user can override per-link)
 * - color: Hex color for visualization
 */
export interface LinkType {
  id: string;
  label: string;
  weight: number;
  color: string;
  short: string;
  icon:string;
}

/**
 * Predefined link types for causal relationships
 * Weight range: -100% to +100%, default 0
 */
export const LINK_TYPES: Record<string, LinkType> = {
  direct_cause: { id: 'direct_cause', label: 'Direct Cause', weight: 0, color: '#F55347', short: 'caused by' , icon: 'ArrowRight'},
  contributing_factor: { id: 'contributing_factor', label: 'Contributing Factor', weight: 0, color: '#6E64F7', short: 'contributing factor' , icon: 'Merge'},
  confounding_factor: { id: 'confounding_factor', label: 'Confounding Factor', weight: 0, color: '#47F553', short: 'confounded by' , icon: 'ArrowRightToLine'},
  modifier: { id: 'modifier', label: 'Modifier', weight: 0, color: '#4792F5', short: 'modified by', icon: 'Variable' },
  condition: { id: 'condition', label: 'Condition', weight: 0, color: '#4c4c4c', short: 'conditional upon', icon: 'Key'},
};

export const DEFAULT_LINK_TYPE = 'contributing_factor';

/**
 * Individual link from one event to another
 * - targetId: The event being linked to
 * - linkType: Type of relationship (from LINK_TYPES)
 * - weight: User-adjustable weight (-100% to +100%)
 */
export interface EventLink {
  targetId: string;
  linkType: string;
  weight: number;
}

/**
 * Individual historical event with all metadata
 * This represents a single event in history with:
 * - Temporal information (date_obj)
 * - Event content (event, text_date, additional_information)
 * - Classification (event_type, tags, status)
 * - Provenance (collection for filtering, timelinePosition for color assignment)
 * - Quality metrics (confidence, accuracy)
 * - Relationships (linked_event)
 */
export type TimelineEvent = {
  _id: string;                          // Unique identifier
  event_type: string;                   // Type/category of event
  text_date: string;                    // Human-readable date string
  additional_information: string;       // Extra context/details
  uid: string;                          // User/source identifier
  event: string;                        // Main event description/title
  tags: string[];                       // Categorization tags
  confidence: number;                   // Confidence score (0-1)
  base_date: number;                    // Unix timestamp or base temporal value
  linked_event: string;                 // Reference to related event
  date_obj: DateObj;                    // Structured date information
  accuracy: string;                     // Accuracy descriptor (e.g., "exact", "approximate")
  status: string;                       // Processing status
  collection: string;                   // Collection key (e.g., "japan_history") - used for filtering
  timelinePosition?: number;            // Stable position index for color mapping (assigned when collection is added)
  userNote?: string;                    // User-added notes for timeline builder events
  graphNodePosition?: { x: number; y: number; z: number }; // 3D graph node position (persisted)
  linkedTo?: EventLink[];               // Array of links to other events with type and weight
}

/**
 * Year aggregate containing all events for a specific year
 * This is the core data structure for the visualization:
 * - Events from multiple collections are merged by year
 * - Each year has an array of full event objects
 * - Count is derived from events.length
 * - Composition is now an array of arrays indexed by timeline position
 */
export type EventYear = {
  year: number;                         // The year (can be negative for BCE)
  events: TimelineEvent[];              // All events that occurred in this year
  count: number;                        // Number of events (events.length)
  composition: number[];              // Array of arrays indexed by timeline position: [[counts_for_position_0], [counts_for_position_1], ...]
}

/**
 * Metadata about a collection/timeline
 * Describes a single historical timeline/dataset:
 * - Display information (displayName, description)
 * - Statistics (eventCount, yearRange)
 * - Source attribution (source, author)
 */
export type CollectionMetadata = {
  key: string;                          // Unique identifier (matches collection name in DB)
  displayName: string;                  // User-friendly display name
  description?: string;                 // Description of the collection
  eventCount: number;                   // Total number of events
  yearRange: { min: number; max: number }; // Temporal span of events
  source?: string;                      // URL or reference to source material
  author?: string;                      // Author/creator of the timeline
}

/**
 * Collection info with assigned color and timeline position
 * Used in the store to track loaded collections with their visual representation:
 * - key: Collection identifier for lookups
 * - displayName: User-friendly name for UI display
 * - color: Hex color assigned from palette when collection is loaded
 * - position: Stable index that persists even when other collections are removed
 */
export type CollectionInfo = {
  key: string;                          // Collection identifier (e.g., "japan_history")
  displayName: string;                  // User-friendly display name
  color: string;                        // Hex color code (e.g., "#FF6B44") assigned from palette
  position: number;                     // Stable timeline position (0, 1, 2, ...) used for consistent color mapping
}



import type * as THREE from 'three';

export interface UIStore {
  graphData: GraphData;
  setGraphData: (data: GraphData) => void;

  selectedNode: string | null;
  setSelectedNode: (node: string | null) => void;

  hoveredNode: string | null;
  setHoveredNode: (node: string | null) => void;

  isUiDragging: boolean;
  setIsUiDragging: (dragging: boolean) => void;

  // Hover info in world space (existing)
  hoverInfo: HoverInfo | null;
  setHoverInfo: (info: HoverInfo | null) => void;

  // For shader dot & old logic (keep if still needed)
  clickedUV: { x: number; y: number } | null;
  setClickedUV: (uv: { x: number; y: number } | null) => void;

  hoverUV: { x: number; y: number } | null;
  setHoverUV: (uv: { x: number; y: number } | null) => void;

  // NEW: baked-geometry lookup
hoverVertexData: { uv: { x: number; y: number } } | null;
setHoverVertexData: (data: { uv: { x: number; y: number } } | null) => void;

  viewingWindowStart: number;
  setViewingWindowStart: (s: number) => number;

  viewingWindowWidth: number;
  setViewingWindowWidth: (w: number) => number;

  selectedLink: { sourceId: string; targetId: string; linkType: string } | null;
  setSelectedLink: (
    link: { sourceId: string; targetId: string; linkType: string } | null
  ) => void;

  hoverYear: number | null;
  setHoverYear: (year: number | null) => void;


}




export interface EventStore {
  selectedCollections: CollectionInfo[];
  aggregatedEvents: EventYear[];
  availableDateRange: [number, number];
  sliderYear: number;
  timeUnitSize: number;
  availableCollections: CollectionMetadata[];
  collectionsLoading: boolean;
  collectionsError: string | null;
  latestClickedEvents: TimelineEvent[];
  timelineBuilderEvents: TimelineEvent[];  // Events added to the timeline builder (includes graphNodePosition)
  nextTimelinePosition: number;         // Counter for assigning stable positions to new collections
  terrainData: number[][];
  restorationComplete: boolean;         // Flag indicating all collections have been restored

  updateTerrainData: () => void;
  fetchAvailableCollections: (limit?: number, sortBy?: string) => Promise<void>;
  addCollection: (collectionKey: string) => Promise<void>;
  removeCollection: (collectionKey: string) => void;
  setSliderYear: (year: number) => void;
  setTimeUnitSize: (size: number) => void;
  setLatestClickedEvents: (year: number) => void; // ✅ Changed from index to year
  addToTimeline: (event: TimelineEvent) => void;
  removeFromTimeline: (eventId: string) => void;
  updateEventNote: (eventId: string, note: string) => void; // Add/update note on timeline builder event
  updateEventGraphPosition: (eventId: string, x: number, y: number, z: number) => void; // Update event's graph node position
  updateEventLinks: (eventId: string, linkedTo: EventLink[]) => void; // Update event's linkedTo array
  addEventLink: (sourceId: string, targetId: string, linkType?: string, weight?: number) => void; // Add a link with type and weight
  removeEventLink: (sourceId: string, targetId: string, linkType?: string) => void; // Remove a link (optionally by type)
  updateEventLinkWeight: (sourceId: string, targetId: string, linkType: string, weight: number) => void; // Update weight of an existing link
  restorePersistedCollections: () => Promise<void>; // Re-fetch collections after page load
  loadFromSaved: (source: string | SavedState) => Promise<void>; // Load state from URL or SavedState object

  reset: () => void;
  getCollectionColor: (collectionKey: string) => string | null;
}

/**
 * Persisted/saved state structure
 * Matches the partialize output - only UI state and metadata, not heavy data
 */
export interface SavedState {
  sliderYear: number;
  timeUnitSize: number;
  availableDateRange: [number, number];
  timelineBuilderEvents: TimelineEvent[];
  selectedCollections: CollectionInfo[];
  nextTimelinePosition: number;
}


export interface GraphNode {
  id: string | number;
  name: string;
  description: string;
  year?: string;
  yearValue?: number;
  val?: number;
  color?: string;
  saved_col?: string;

  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  value?: number;
  collection?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface GraphViewProps {
  year: number;
}