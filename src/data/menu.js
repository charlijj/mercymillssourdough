// ============================================================================
//  MENU DATA — edit this file to update products, prices, and descriptions.
// ============================================================================
//  Each item has:
//    id          - short unique slug (used by the order form). No spaces.
//    name        - display name
//    price       - number in dollars (e.g. 9 or 12.5)
//    unit        - what the price is for (e.g. "loaf", "half dozen")
//    description - one or two sentences shown on the card
//    image       - file in /public/images (leave the placeholder until you
//                  have a real photo; then drop the photo in and update this)
//    tags        - optional short labels (e.g. ["Bestseller"], ["Seasonal"])
//
//  To add an item: copy a block, change the values, keep the commas.
//  To remove an item: delete its block.
// ============================================================================

export const menu = [
  {
    id: 'classic-country',
    name: 'Classic Country Loaf',
    price: 9,
    unit: 'loaf',
    description:
      'Our signature naturally-leavened sourdough. Crackly golden crust, open airy crumb, and a gentle tang from a 24-hour slow ferment.',
    image: '/images/placeholder-loaf.svg',
    tags: ['Bestseller'],
  },
  {
    id: 'seeded-multigrain',
    name: 'Seeded Multigrain',
    price: 11,
    unit: 'loaf',
    description:
      'Hearty whole-grain crumb crusted with sunflower, flax, sesame, and pumpkin seeds. Nutty, wholesome, and perfect for toast.',
    image: '/images/placeholder-loaf.svg',
    tags: [],
  },
  {
    id: 'rosemary-garlic',
    name: 'Rosemary & Roasted Garlic',
    price: 12,
    unit: 'loaf',
    description:
      'Fresh rosemary and slow-roasted garlic folded through a soft, savory crumb. Wonderful alongside soups and pasta.',
    image: '/images/placeholder-loaf.svg',
    tags: ['Seasonal'],
  },
  {
    id: 'cinnamon-raisin',
    name: 'Cinnamon Raisin Swirl',
    price: 12,
    unit: 'loaf',
    description:
      'Sweet plump raisins and a warm cinnamon swirl in a tender sourdough. Makes unforgettable French toast.',
    image: '/images/placeholder-loaf.svg',
    tags: [],
  },
  {
    id: 'sourdough-bagels',
    name: 'Sourdough Bagels',
    price: 10,
    unit: 'half dozen',
    description:
      'Boiled then baked the traditional way for a chewy interior and glossy crust. Sold by the half dozen.',
    image: '/images/placeholder-loaf.svg',
    tags: [],
  },
  {
    id: 'sourdough-focaccia',
    name: 'Garden Focaccia',
    price: 14,
    unit: 'tray',
    description:
      'Pillowy olive-oil focaccia topped with seasonal vegetables and flaky sea salt. Dimpled, golden, and shareable.',
    image: '/images/placeholder-loaf.svg',
    tags: ['Seasonal'],
  },
];

// Business / contact details used across the site. Edit these in one place.
export const site = {
  name: 'Mercy Mills Sourdough',
  domain: 'mercymillsourdough.com',
  tagline: 'Small-batch sourdough, baked with patience.',
  location: 'Baked fresh — local pickup & delivery',
  email: 'hello@mercymillsourdough.com', // shown to customers; orders are emailed to the address configured in the order form
  instagram: '', // e.g. 'https://instagram.com/mercymillsourdough'
  facebook: '',
};
