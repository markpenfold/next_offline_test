import { Vector3 } from 'three';


export interface EventRowProps {
  item: TimelineEvent;
  collectionColor: string;
  isAdded: boolean;
  onToggleAdd: (event: TimelineEvent) => void;
  showYear?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}


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




export type TimelineEvent = {
  _id: string;                          // Unique identifier (mapped from 'id' in Parquet)
  subject: string;                      // Core event title (e.g. "Formation of Earth's Water")
  description: string;                  // Detailed explanation / extra context
  master_category: string;              // High-level timeline / collection grouping (for collection colors)
  fileName:string;                          // free | pro
  version?: string;                     // Dataset schema/data version (e.g. "v1")
  event_type?: string;                  // Sub-category or classification
  
  // Categorization & Taxonomy
  tags?: string[];                      // Array of categorization tags
  categories?: string[];                // Array of category strings
  
  // Temporal Data
  text_date?: string;                   // Mapped from 'date' (human-readable string)
  precision?: string;                   // Mapped from 'precision' (e.g. "year", "exact", "approximate")
  era?: string;                         // Mapped from 'era' (e.g. "pre_1900")
  
  
  year: number;
  month?: number;
  day?: number;
  hour?:number;
  minutes?:number;
  seconds?: number;
  miliseconds?:number;
  
  // Spatial & Media Metadata (Optional)
  location?: number;                    // Spatial index / location identifier
  media?: number;                       // Associated media ID / index
  
  // App & Graph State
  userNote?: string;                    // User-added notes for timeline builder events
  graphNodePosition?: { x: number; y: number; z: number }; // 3D graph node position
  linkedTo?: EventLink[];               // Array of links to other events with type and weight
};




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


// GRAPH STUFF BELOW ///////////////////////////////////////////////

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
  condition: { id: 'condition', label: 'Condition', weight: 0, color: '#fccfcc', short: 'conditional upon', icon: 'Key'},
};

export const DEFAULT_LINK_TYPE = 'contributing_factor';
