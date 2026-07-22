/**
 * Collection display name mappings
 * Maps collection keys to short display names for compact UI views
 *
 * ADD YOUR SHORT NAMES HERE - Replace 'TODO' with short display names
 */

export const COLLECTION_SHORT_NAMES: Record<string, string> = {
  '1000inventions3jsonhdg': '1000 Inventions',
  '100_years_of_physical_chemistry_a_collection_of_landmark_papers_royal_society_of_chemistry': 'Chemistry',
  '1066_and_before_all_that_ed_west': '1066 and before',
  '1177_bc_the_year_civilization_collapsed_eric_h_cline': '1177',
  '1453_the_holy_war_for_constantinople_and_the_clash_of_islam_and_the_west_roger_crowley': 'Crusades',
  '5000_years_of_geometry_mathematics_in_history_and_culture': 'Geometry',
  'a_brief_history_of_ancient_astrology': 'Astrology',
  'a_brief_history_of_ancient_greek_stephen_colvin': 'Ancient Greek',
  'a_brief_history_of_britain_14851660_ronald_hutton': 'Britain',
  'a_brief_history_of_earth_four_billion_years_in_eight_chapters_andrew_h_knoll': 'Geological History',
  'a_brief_history_of_economic_thought': 'Economics',
  'accidental_medical_discoveries_how_tenacity_and_pure_dumb_luck_changed_the_world': 'Ancient Medicine',
  'a_companion_to_ancient_history_andrew_erskine': 'Ancient History',
  'a_companion_to_ancient_macedonia_blackwell_companions_to_the_ancient_world_joseph_roisman_ian_worthington_eds': 'Ancient Macedonia',
  'a_companion_to_food_in_the_ancient_world_nadeau_robin_wilkins_john': 'Ancient Food',
  'a_companion_to_late_antiquity_philip_rousseau': 'Late Antiquity',
  'a_companion_to_the_ancient_near_east_daniel_c_snell': 'Ancient Near East',
  'hinduism': 'Hinduism',
  'japan': 'Japan',
};

/**
 * Get short name for a collection, falling back to formatted display name
 */
export function getCollectionShortName(key: string, displayName: string): string {
  return COLLECTION_SHORT_NAMES[key] || displayName;
}

/**
 * Check if a collection has a custom short name
 */
export function hasShortName(key: string): boolean {
  return key in COLLECTION_SHORT_NAMES;
}
