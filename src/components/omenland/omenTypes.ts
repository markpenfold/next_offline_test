

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
  hour?:number;
  minutes?:number;
  seconds?: number;
  miliseconds?:number;
  precision?: number;
}

export type TimelineEvent = {
  _id: string;                          // Unique identifier (mapped from 'id' in Parquet)
  subject: string;                      // Core event title (e.g. "Formation of Earth's Water")
  description: string;                  // Detailed explanation / extra context
  master_category: string;              // High-level timeline / collection grouping (for collection colors)
  version?: string;                     // Dataset schema/data version (e.g. "v1")
  event_type?: string;                  // Sub-category or classification
  
  // Categorization & Taxonomy
  tags?: string[];                      // Array of categorization tags
  categories?: string[];                // Array of category strings
  
  // Temporal Data
  text_date?: string;                   // Mapped from 'date' (human-readable string)
  precision?: string;                   // Mapped from 'precision' (e.g. "year", "exact", "approximate")
  era?: string;                         // Mapped from 'era' (e.g. "pre_1900")
  date_obj: DateObj;                    // Structured date object (year, month, day, hour, etc.)
  
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
