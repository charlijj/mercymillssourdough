// ============================================================================
//  MENU DATA — edit this file to update products, prices, and descriptions.
// ============================================================================
//  Each item has:
//    id          - short unique slug (used by the order form). No spaces.
//    name        - display name (English)
//    name_zh     - display name (Mandarin / 中文)
//    price       - number in dollars (e.g. 9 or 12.5)
//    unit        - what the price is for, English (e.g. "loaf")
//    unit_zh     - the unit in Mandarin (e.g. "条")
//    description    - one or two sentences shown on the card (English)
//    description_zh - the same description in Mandarin
//    image       - file in /public/images (leave the placeholder until you
//                  have a real photo; then drop the photo in and update this)
//    tags        - optional labels, English (e.g. ["Bestseller"], ["Seasonal"])
//
//  To add an item: copy a block, change the values, keep the commas.
//  To remove an item: delete its block.
//  (Tag translations live in src/components/Menu.astro.)
// ============================================================================

export const menu = [
  {
    id: 'classic-country',
    name: 'Classic Country Loaf',
    name_zh: '经典乡村面包',
    price: 9,
    unit: 'loaf',
    unit_zh: '条',
    description:
      'Our signature naturally-leavened sourdough. Crackly golden crust, open airy crumb, and a gentle tang from a 24-hour slow ferment.',
    description_zh:
      '我们的招牌天然酸种面包。金黄酥脆的外壳，松软通透的内里，24 小时慢发酵带来温和的酸香。',
    image: '/images/placeholder-loaf.svg',
    tags: ['Bestseller'],
  },
  {
    id: 'seeded-multigrain',
    name: 'Seeded Multigrain',
    name_zh: '多谷物杂粮面包',
    price: 11,
    unit: 'loaf',
    unit_zh: '条',
    description:
      'Hearty whole-grain crumb crusted with sunflower, flax, sesame, and pumpkin seeds. Nutty, wholesome, and perfect for toast.',
    description_zh:
      '扎实的全谷物面包心，外裹葵花籽、亚麻籽、芝麻和南瓜籽。坚果香浓，健康营养，最适合做吐司。',
    image: '/images/placeholder-loaf.svg',
    tags: [],
  },
  {
    id: 'rosemary-garlic',
    name: 'Rosemary & Roasted Garlic',
    name_zh: '迷迭香烤蒜面包',
    price: 12,
    unit: 'loaf',
    unit_zh: '条',
    description:
      'Fresh rosemary and slow-roasted garlic folded through a soft, savory crumb. Wonderful alongside soups and pasta.',
    description_zh:
      '新鲜迷迭香与慢烤大蒜融入柔软咸香的面包心。搭配浓汤和意面尤为美味。',
    image: '/images/placeholder-loaf.svg',
    tags: ['Seasonal'],
  },
  {
    id: 'cinnamon-raisin',
    name: 'Cinnamon Raisin Swirl',
    name_zh: '肉桂葡萄干卷',
    price: 12,
    unit: 'loaf',
    unit_zh: '条',
    description:
      'Sweet plump raisins and a warm cinnamon swirl in a tender sourdough. Makes unforgettable French toast.',
    description_zh:
      '香甜饱满的葡萄干与温暖的肉桂在柔软的酸种面包中层层卷起。用来做法式吐司令人难忘。',
    image: '/images/placeholder-loaf.svg',
    tags: [],
  },
  {
    id: 'sourdough-bagels',
    name: 'Sourdough Bagels',
    name_zh: '酸种贝果',
    price: 10,
    unit: 'half dozen',
    unit_zh: '半打',
    description:
      'Boiled then baked the traditional way for a chewy interior and glossy crust. Sold by the half dozen.',
    description_zh:
      '遵循传统先煮后烤，内里有嚼劲，表皮光亮。半打起售。',
    image: '/images/placeholder-loaf.svg',
    tags: [],
  },
  {
    id: 'sourdough-focaccia',
    name: 'Garden Focaccia',
    name_zh: '田园佛卡夏',
    price: 14,
    unit: 'tray',
    unit_zh: '盘',
    description:
      'Pillowy olive-oil focaccia topped with seasonal vegetables and flaky sea salt. Dimpled, golden, and shareable.',
    description_zh:
      '松软的橄榄油佛卡夏，铺满时令蔬菜和海盐片。布满凹坑，金黄诱人，适合分享。',
    image: '/images/placeholder-loaf.svg',
    tags: ['Seasonal'],
  },
];

// Business / contact details used across the site. Edit these in one place.
export const site = {
  name: 'Mercy Mills Sourdough',
  domain: 'mercymillsourdough.com',
  tagline: 'Small-batch sourdough, baked with patience.',
  location: 'Baked fresh — local pickup',
  location_zh: '新鲜烘焙 · 本地自取',
  email: 'hello@mercymillsourdough.com', // shown to customers; orders are emailed to the address configured in the order form
  instagram: '', // e.g. 'https://instagram.com/mercymillsourdough'
  facebook: '',
};
