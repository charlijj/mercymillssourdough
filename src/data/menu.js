// ============================================================================
//  MENU DATA — edit this file to update products, prices, and descriptions.
// ============================================================================
//  Each item has:
//    id             short unique slug (used by the order form). No spaces.
//    name/name_zh   display name in English / Chinese
//    price          number in dollars. Omit when `sizes` is used.
//    unit/unit_zh   what the price is for ("loaf", "6", "12")
//    description(_zh)  one or two sentences shown on the card
//    image          file in /public/images
//    tags           optional labels, English (translated in Menu.astro)
//    details        shown in the "details" popup when a product is clicked.
//                   Fill these in as the information becomes available; any
//                   field left as '' simply shows a "coming soon" note.
//                     ingredients / ingredients_zh  e.g. 'Unbleached flour, water, salt, starter'
//                     netWeight                     e.g. '800 g'
//                     about       / about_zh        a longer description
//
//  Optional:
//    sizes    [{ id, label, label_zh, price }]
//             A size/quantity choice that CHANGES the price (e.g. 6 or 12
//             bagels). The first entry is the default.
//    options  [{ id, label, label_zh, choices: [{ id, label, label_zh }] }]
//             A choice that does NOT change the price (shape, flavour).
//
//  To add an item: copy a block, change the values, keep the commas.
// ============================================================================

// Shape choice shared by the sourdough loaves.
const shapeOption = {
  id: 'shape',
  label: 'Shape',
  label_zh: '形狀',
  choices: [
    { id: 'boule', label: 'Boule (round)', label_zh: '圓形歐包' },
    { id: 'sandwich', label: 'Sandwich (loaf)', label_zh: '吐司形' },
  ],
};

export const menu = [
  {
    id: 'artisan-loaf',
    name: 'Artisan Regular Loaf',
    name_zh: '原味酸種歐包',
    price: 11,
    unit: 'loaf',
    unit_zh: '個',
    description:
      'Our signature loaf — just four ingredients: unbleached flour, water, salt, and our 150-year-old San Francisco starter.',
    description_zh:
      '我們的招牌歐包——僅用四種材料：無漂白麵粉、水、鹽，以及我們擁有 150 年歷史的舊金山酵種。',
    image: '/images/artisan-loaf.jpg',
    tags: ['Bestseller'],
    details: { ingredients: 'Unbleached flour, filtered water, sourdough starter, pinch of salt', ingredients_zh: '無漂白麵粉、過濾水、天然酵種、少許鹽', netWeight: '', about: '', about_zh: '' },
    options: [shapeOption],
  },
  {
    id: 'cranberry-walnut',
    name: 'Cranberries & Walnuts',
    name_zh: '蔓越莓核桃酸種歐包',
    price: 13,
    unit: 'loaf',
    unit_zh: '個',
    description: 'Sweet-tart cranberries and plenty of walnuts folded through a soft, open crumb.',
    description_zh: '酸甜蔓越莓與滿滿核桃，揉入柔軟通透的麵包心。',
    image: '/images/cranberry-walnut.jpg',
    tags: [],
    details: { ingredients: 'Unbleached flour, filtered water, sourdough starter, dried cranberries, roasted walnuts, pinch of salt', ingredients_zh: '無漂白麵粉、過濾水、天然酵種、蔓越莓乾、烘烤核桃、少許鹽', netWeight: '', about: '', about_zh: '' },
    options: [shapeOption],
  },
  {
    id: 'tomato-olive',
    name: 'Sun-dried Tomatoes & Olives',
    name_zh: '油漬蕃茄橄欖酸種歐包',
    price: 13,
    unit: 'loaf',
    unit_zh: '個',
    description: 'Savoury sun-dried tomatoes and olives throughout — wonderful with soup or cheese.',
    description_zh: '香濃油漬蕃茄與橄欖遍佈其中——搭配濃湯或起司特別美味。',
    image: '/images/tomato-olive.jpg',
    tags: [],
    details: { ingredients: 'Unbleached flour, filtered water, sourdough starter, sun-dried tomatoes, olives, pinch of salt', ingredients_zh: '無漂白麵粉、過濾水、天然酵種、油漬番茄、橄欖、少許鹽', netWeight: '', about: '', about_zh: '' },
    options: [shapeOption],
  },
  {
    id: 'jalapeno-cheddar',
    name: 'Jalapeño & Cheddar',
    name_zh: '墨西哥辣椒切達起司酸種歐包',
    price: 14,
    unit: 'loaf',
    unit_zh: '個',
    description: 'A gentle kick of jalapeño with pockets of melted cheddar and a golden cheese crust.',
    description_zh: '墨西哥辣椒帶來微辣風味，配上融化的切達起司與金黃起司外皮。',
    image: '/images/jalapeno-cheddar.jpg',
    tags: [],
    details: { ingredients: 'Unbleached flour, filtered water, sourdough starter, jalapeño, cheddar, pinch of salt', ingredients_zh: '無漂白麵粉、過濾水、天然酵種、墨西哥辣椒、切達起司、少許鹽', netWeight: '', about: '', about_zh: '' },
    options: [shapeOption],
  },
  {
    id: 'rosemary-cheddar',
    name: 'Rosemary & Cheddar',
    name_zh: '迷迭香切達起司酸種歐包',
    price: 14,
    unit: 'loaf',
    unit_zh: '個',
    description: 'Fresh rosemary and sharp cheddar — fragrant, savoury, and very hard to stop eating.',
    description_zh: '新鮮迷迭香與濃郁切達起司——香氣十足，鹹香誘人，令人停不下來。',
    image: '/images/rosemary-cheddar.jpg',
    tags: [],
    details: { ingredients: 'Unbleached flour, filtered water, sourdough starter, rosemary, cheddar, pinch of salt', ingredients_zh: '無漂白麵粉、過濾水、天然酵種、迷迭香、切達起司、少許鹽', netWeight: '', about: '', about_zh: '' },
    options: [shapeOption],
  },
  {
    id: 'sesame-seeds',
    name: 'Sesame & Seeds',
    name_zh: '芝麻多穀物酸種歐包',
    price: 13,
    unit: 'loaf',
    unit_zh: '個',
    description: 'Crusted all over with sesame and seeds for a nutty, wholesome crunch.',
    description_zh: '外層裹滿芝麻與多種穀物種子，帶來堅果香氣與紮實口感。',
    image: '/images/sesame-seeds.jpg',
    tags: [],
    details: { ingredients: 'Unbleached flour, filtered water, sourdough starter, flaxseeds, sunflower seeds, pumpkin seeds, black sesame seeds, pinch of salt', ingredients_zh: '無漂白麵粉、過濾水、天然酵種、亞麻籽、葵花籽、南瓜籽、黑芝麻、少許鹽', netWeight: '', about: '', about_zh: '' },
    options: [shapeOption],
  },
  {
    id: 'whole-wheat-loaf',
    name: 'Whole Wheat Loaf',
    name_zh: '全麥酸種歐包',
    price: 15,
    unit: 'loaf',
    unit_zh: '個',
    description:
      'Made with whole wheat freshly milled in our kitchen, for full whole-grain nutrition and aroma.',
    description_zh: '採用自家廚房現磨的全麥麵粉，保留完整全穀營養與麥香。',
    image: '/images/whole-wheat-loaf.jpg',
    tags: [],
    details: { ingredients: 'Fresh-milled flour, unbleached flour, filtered water, sourdough starter, olive oil, honey, pinch of salt', ingredients_zh: '現磨麵粉、無漂白麵粉、過濾水、天然酵種、橄欖油、蜂蜜、少許鹽', netWeight: '', about: '', about_zh: '' },
    options: [shapeOption],
  },
  {
    id: 'focaccia',
    name: 'Focaccia',
    name_zh: '佛卡夏',
    price: 14,
    unit: '8" × 8" tray',
    unit_zh: '8 吋方盤',
    description: 'Pillowy olive-oil focaccia, dimpled and golden. Baked in an 8" × 8" tray.',
    description_zh: '鬆軟的橄欖油佛卡夏，表面凹凸金黃。以 8 吋方盤烘烤。',
    image: '/images/focaccia.jpg',
    tags: [],
    details: { ingredients: 'Unbleached flour, filtered water, sourdough starter, pinch of salt. Topping choices: vegetables, herbs', ingredients_zh: '無漂白麵粉、過濾水、天然酵種、少許鹽。配料可選：蔬菜、香草', netWeight: '', about: '', about_zh: '' },
  },
  {
    id: 'english-muffins',
    name: 'Whole Wheat English Muffins',
    name_zh: '全麥英式馬芬',
    price: 15,
    unit: '6',
    unit_zh: '6 個',
    description: 'Fresh-milled whole wheat English muffins. Split, toast, and butter. Sold by the six.',
    description_zh: '以現磨全麥製作的英式馬芬。剖開烤香、抹上奶油最美味。6 個一組。',
    image: '/images/english-muffins.jpg',
    tags: [],
    details: { ingredients: 'Fresh-milled flour, unbleached flour, filtered water, sourdough starter, pinch of salt', ingredients_zh: '現磨麵粉、無漂白麵粉、過濾水、天然酵種、少許鹽', netWeight: '', about: '', about_zh: '' },
  },
  {
    id: 'bagels',
    name: 'Bagels',
    name_zh: '貝果',
    unit: 'bagels',
    unit_zh: '個',
    description: 'Chewy sourdough bagels, boiled then baked. Choose plain, sesame, or everything.',
    description_zh: '有嚼勁的酸種貝果，先煮後烤。可選原味、芝麻或全料。',
    image: '/images/bagels.jpg',
    tags: [],
    details: { ingredients: 'Unbleached flour, filtered water, sourdough starter, maple syrup, sugar, pinch of salt. Inclusions: sesame seeds or everything bagel spices', ingredients_zh: '無漂白麵粉、過濾水、天然酵種、楓糖漿、糖、少許鹽。可加：芝麻或全料貝果香料', netWeight: '', about: '', about_zh: '' },
    sizes: [
      { id: '6', label: '6 bagels', label_zh: '6 個', price: 15 },
      { id: '12', label: '12 bagels', label_zh: '12 個', price: 28 },
    ],
    options: [
      {
        id: 'flavour',
        label: 'Flavour',
        label_zh: '口味',
        choices: [
          { id: 'plain', label: 'Plain', label_zh: '原味' },
          { id: 'sesame', label: 'Sesame', label_zh: '芝麻' },
          { id: 'everything', label: 'Everything', label_zh: '全料' },
        ],
      },
    ],
  },
  {
    id: 'stuffed-bagels',
    name: 'Stuffed Bagels (Ham & Cheddar)',
    name_zh: '火腿切達起司夾餡貝果',
    price: 30,
    unit: '6',
    unit_zh: '6 個',
    description: 'Our bagels stuffed with ham and cheddar — a meal in itself. Sold by the six.',
    description_zh: '貝果內夾火腿與切達起司，份量十足。6 個一組。',
    image: '/images/stuffed-bagels.jpg',
    tags: ['Bestseller'],
    details: { ingredients: 'Unbleached flour, filtered water, sourdough starter, ham, cheddar, maple syrup, sugar, pinch of salt', ingredients_zh: '無漂白麵粉、過濾水、天然酵種、火腿、切達起司、楓糖漿、糖、少許鹽', netWeight: '', about: '', about_zh: '' },
  },
  {
    id: 'pizza-dough',
    name: 'Frozen Pizza Dough',
    name_zh: '冷凍披薩麵團',
    price: 15,
    unit: '3',
    unit_zh: '3 份',
    description: 'Ready-to-use sourdough pizza dough, frozen in portions. Three per pack.',
    description_zh: '可直接使用的酸種披薩麵團，分份冷凍。每包 3 份。',
    image: '/images/pizza-dough.jpg',
    tags: [],
    details: { ingredients: 'Unbleached flour, filtered water, sourdough starter, pinch of salt', ingredients_zh: '無漂白麵粉、過濾水、天然酵種、少許鹽', netWeight: '', about: '', about_zh: '' },
  },
  {
    id: 'bread-bowls',
    name: 'Bread Bowls',
    name_zh: '麵包碗',
    price: 15,
    unit: '3',
    unit_zh: '3 個',
    description: 'Round sourdough bowls made for soup and chowder. Three per order.',
    description_zh: '專為濃湯設計的圓形酸種麵包碗。每份 3 個。',
    image: '/images/bread-bowls.jpg',
    tags: [],
    details: { ingredients: 'Unbleached flour, filtered water, sourdough starter, pinch of salt', ingredients_zh: '無漂白麵粉、過濾水、天然酵種、少許鹽', netWeight: '', about: '', about_zh: '' },
  },
  {
    id: 'chocolate-cookies',
    name: 'Sourdough Chocolate Cookies',
    name_zh: '酸種巧克力餅乾',
    price: 18,
    unit: '12',
    unit_zh: '12 片',
    description: 'Chewy sourdough chocolate chip cookies, baked by the dozen.',
    description_zh: '有嚼勁的酸種巧克力豆餅乾，一打裝。',
    image: '/images/chocolate-cookies.jpg',
    tags: ['Sweet'],
    details: { ingredients: 'Unbleached flour, filtered water, chocolate chips, sourdough starter, brown sugar, butter, egg yolk, baking soda, pinch of salt', ingredients_zh: '無漂白麵粉、過濾水、巧克力豆、天然酵種、黑糖、奶油、蛋黃、小蘇打、少許鹽', netWeight: '', about: '', about_zh: '' },
  },
  {
    id: 'mantou',
    name: 'Healthy Assorted Mantou / Steamed Buns',
    name_zh: '養生饅頭',
    price: 25,
    unit: '900 g',
    unit_zh: '900 公克',
    description:
      'Randomly crafted with seasonal fresh ingredients, wholesome grains, and quality oils — every batch is a little different.',
    description_zh: '依當季新鮮食材、全穀雜糧與優質油品隨興變化，每一批風味都略有不同。',
    image: '/images/mantou.jpg',
    tags: [],
    details: {
      ingredients:
        'Varies by batch, drawn from: unbleached all-purpose and rye flours; fresh-milled whole grain rye, hard white, red spring, buckwheat, kamut, oat groat and millet; vegetables (pumpkin, yam, taro, leafy greens); beans (black, red, mung, assorted lentils, chickpeas); seeds (black and white sesame, pumpkin, sunflower, flaxseed, quinoa, hemp); rice (black, wild, brown); dates and brown sugar; avocado and olive oil',
      ingredients_zh:
        '依每批製作而異，選自：無漂白中筋麵粉與裸麥麵粉；現磨全穀裸麥、硬白小麥、紅春小麥、蕎麥、卡姆小麥、燕麥粒與小米；蔬菜（南瓜、山藥、芋頭、綠葉蔬菜）；豆類（黑豆、紅豆、綠豆、各式扁豆、鷹嘴豆）；種子（黑白芝麻、南瓜籽、葵花籽、亞麻籽、藜麥、大麻籽）；米類（黑米、野米、糙米）；紅棗與黑糖；酪梨油與橄欖油',
      netWeight: '900 g',
      about:
        'Every batch offers a unique and nutrient-dense taste experience: the natural sweetness of root veggies and dates, the dietary fibre of freshly milled grains and beans, and the subtle richness of superfood seeds and cold-pressed oils.',
      about_zh:
        '每一批都帶來獨特而營養豐富的風味體驗：根莖蔬菜與紅棗的自然甜味、現磨穀物與豆類的膳食纖維，以及超級種子與冷壓油品的淡雅香醇。',
    },
  },
];

// Business / contact details used across the site. Edit these in one place.
export const site = {
  name: 'Mercy Mill Sourdough',
  domain: 'mercymillsourdough.com',
  tagline: 'Handcrafted with Care, From My Home to Yours',
  location: 'Baked fresh — local pickup',
  location_zh: '新鮮烘焙 · 本地自取',
  email: 'mercymillsourdough@gmail.com', // public contact address shown in the footer
  instagram: '',
  facebook: '',
};

// Helper: the lowest price for an item (used for "from $X" on cards).
export const basePrice = (item) =>
  item.sizes ? Math.min(...item.sizes.map((s) => s.price)) : item.price;
