// ============================================================================
//  PICKUP AVAILABILITY — edit this file to change which days customers can
//  choose in the order form's calendar. No other file needs to change.
// ============================================================================

export const pickup = {
  // Days of the week available for pickup.
  // 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday,
  // 4 = Thursday, 5 = Friday, 6 = Saturday
  availableWeekdays: [2, 3, 4], // Tuesday, Wednesday, Thursday

  // Orders must be placed at least this many days before pickup.
  minLeadDays: 3,

  // How many months ahead customers may book.
  monthsAhead: 3,

  // Specific dates to close even if they fall on an available weekday
  // (holidays, vacation). Format: 'YYYY-MM-DD'.
  blackoutDates: [
    // '2026-12-24',
  ],
};
