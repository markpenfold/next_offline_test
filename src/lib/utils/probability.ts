
import { TimelineEvent, EventLink } from "@/components/omenland/omenTypes";

/**
 * Calculate the probability of an event occurring based on incoming links.
 *
 * Algorithm:
 * - Base probability is 50% (no links = uncertain)
 * - Each incoming link contributes: sourceProb * (weight/100)
 * - Positive weights increase probability, negative decrease
 * - Result is clamped to 0-100%
 *
 * @param eventId - The event to calculate probability for
 * @param allEvents - All events in the graph
 * @returns Probability as a percentage (0-100)
 */
export function calculateEventProbability(
  eventId: string,
  allEvents: TimelineEvent[]
): number {
  // Find all incoming links to this event
  const incomingLinks: { sourceEvent: TimelineEvent; link: EventLink }[] = [];

  for (const event of allEvents) {
    if (event.linkedTo) {
      for (const link of event.linkedTo) {
        const linkData = typeof link === 'string'
          ? { targetId: link, linkType: 'contributing_factor', weight: 0 }
          : link;

        if (linkData.targetId === eventId) {
          incomingLinks.push({ sourceEvent: event, link: linkData });
        }
      }
    }
  }

  // No incoming links = base probability of 50%
  if (incomingLinks.length === 0) {
    return 50;
  }

  // Calculate weighted influence
  let totalInfluence = 0;

  for (const { link } of incomingLinks) {
    // Use 50% as default source probability to avoid infinite recursion
    const sourceProb = 50;

    // Weight is -100 to +100, normalize to -1 to +1
    const normalizedWeight = link.weight / 100;

    // Contribution: source probability * weight
    totalInfluence += (sourceProb / 100) * normalizedWeight;
  }

  // Average the influence if multiple links
  const avgInfluence = totalInfluence / incomingLinks.length;

  // Convert influence to probability
  // Base probability is 50%, influence shifts it
  const probability = 50 + (avgInfluence * 50);

  return Math.max(0, Math.min(100, Math.round(probability)));
}

/**
 * Calculate probabilities for all events in the graph.
 * Returns a map of eventId -> probability
 */
export function calculateAllProbabilities(
  events: TimelineEvent[]
): Map<string, number> {
  const probabilities = new Map<string, number>();

  for (const event of events) {
    probabilities.set(event._id, calculateEventProbability(event._id, events));
  }

  return probabilities;
}

/**
 * Get incoming links for an event (links that point TO this event)
 */
export function getIncomingLinks(
  eventId: string,
  allEvents: TimelineEvent[]
): { sourceEvent: TimelineEvent; link: EventLink }[] {
  const incoming: { sourceEvent: TimelineEvent; link: EventLink }[] = [];

  for (const event of allEvents) {
    if (event.linkedTo) {
      for (const link of event.linkedTo) {
        const linkData = typeof link === 'string'
          ? { targetId: link, linkType: 'contributing_factor', weight: 0 }
          : link;

        if (linkData.targetId === eventId) {
          incoming.push({ sourceEvent: event, link: linkData });
        }
      }
    }
  }

  return incoming;
}

/**
 * Get outgoing links for an event (links that point FROM this event)
 */
export function getOutgoingLinks(
  eventId: string,
  allEvents: TimelineEvent[]
): { targetEvent: TimelineEvent; link: EventLink }[] {
  const event = allEvents.find(e => e._id === eventId);
  if (!event?.linkedTo) return [];

  const outgoing: { targetEvent: TimelineEvent; link: EventLink }[] = [];

  for (const link of event.linkedTo) {
    const linkData = typeof link === 'string'
      ? { targetId: link, linkType: 'contributing_factor', weight: 0 }
      : link;

    const targetEvent = allEvents.find(e => e._id === linkData.targetId);
    if (targetEvent) {
      outgoing.push({ targetEvent, link: linkData });
    }
  }

  return outgoing;
}
