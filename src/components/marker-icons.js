/**
 * Marker icon catalog for the map editor.
 *
 * Full upstream license notices: docs/marker-icons-LICENSE.txt.
 * Most glyph paths are copied from lucide-react v1.24.0 (ISC license).
 * The catalog is kept as plain SVG node data so it can be imported by Node
 * without React or browser globals. Custom marker shapes and faces are local.
 */

export const MARKER_ICON_CATEGORIES = Object.freeze([
  {
    "id": "basic",
    "labelZh": "基础",
    "labelEn": "Basic"
  },
  {
    "id": "food",
    "labelZh": "餐饮",
    "labelEn": "Food & Drink"
  },
  {
    "id": "living",
    "labelZh": "住宿与生活",
    "labelEn": "Living"
  },
  {
    "id": "transport",
    "labelZh": "出行交通",
    "labelEn": "Transport"
  },
  {
    "id": "shopping",
    "labelZh": "购物与商业",
    "labelEn": "Shopping"
  },
  {
    "id": "leisure",
    "labelZh": "游玩与文化",
    "labelEn": "Leisure & Culture"
  },
  {
    "id": "nature",
    "labelZh": "自然与户外",
    "labelEn": "Nature & Outdoors"
  },
  {
    "id": "service",
    "labelZh": "服务与公共",
    "labelEn": "Services"
  },
  {
    "id": "work",
    "labelZh": "工作与活动",
    "labelEn": "Work & Activities"
  },
  {
    "id": "other",
    "labelZh": "形状与其他",
    "labelEn": "Shapes & Other"
  }
]);

export const MARKER_ICONS = Object.freeze([
  {
    "id": "pin",
    "labelZh": "默认标记",
    "labelEn": "Pin",
    "categoryId": "basic",
    "nodes": [
      [
        "path",
        {
          "d": "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "10",
          "r": "2.5"
        }
      ]
    ]
  },
  {
    "id": "circle",
    "labelZh": "圆点",
    "labelEn": "Dot",
    "categoryId": "basic",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "4",
          "fill": "currentColor",
          "stroke": "none"
        }
      ]
    ]
  },
  {
    "id": "square-small",
    "labelZh": "小方块",
    "labelEn": "Small square",
    "categoryId": "basic",
    "nodes": [
      [
        "rect",
        {
          "x": "8",
          "y": "8",
          "width": "8",
          "height": "8",
          "rx": "1",
          "fill": "currentColor",
          "stroke": "none"
        }
      ]
    ]
  },
  {
    "id": "square",
    "labelZh": "方块",
    "labelEn": "Square",
    "categoryId": "basic",
    "nodes": [
      [
        "rect",
        {
          "x": "5",
          "y": "5",
          "width": "14",
          "height": "14",
          "rx": "2"
        }
      ]
    ]
  },
  {
    "id": "diamond",
    "labelZh": "菱形",
    "labelEn": "Diamond",
    "categoryId": "basic",
    "nodes": [
      [
        "path",
        {
          "d": "m12 3 9 9-9 9-9-9 9-9Z"
        }
      ]
    ]
  },
  {
    "id": "ring",
    "labelZh": "圆环",
    "labelEn": "Ring",
    "categoryId": "basic",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "7"
        }
      ]
    ]
  },
  {
    "id": "star",
    "labelZh": "星标",
    "labelEn": "Star",
    "categoryId": "basic",
    "nodes": [
      [
        "path",
        {
          "d": "m12 2 3 6 6.5 1-4.7 4.6 1.1 6.4-5.9-3-5.9 3 1.1-6.4L2.5 9 9 8l3-6Z"
        }
      ]
    ]
  },
  {
    "id": "heart",
    "labelZh": "心形",
    "labelEn": "Heart",
    "categoryId": "basic",
    "nodes": [
      [
        "path",
        {
          "d": "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"
        }
      ]
    ]
  },
  {
    "id": "check",
    "labelZh": "对勾",
    "labelEn": "Check",
    "categoryId": "basic",
    "nodes": [
      [
        "path",
        {
          "d": "m5 12 4 4L19 6"
        }
      ]
    ]
  },
  {
    "id": "x",
    "labelZh": "叉号",
    "labelEn": "X",
    "categoryId": "basic",
    "nodes": [
      [
        "line",
        {
          "x1": "5",
          "y1": "5",
          "x2": "19",
          "y2": "19"
        }
      ],
      [
        "line",
        {
          "x1": "19",
          "y1": "5",
          "x2": "5",
          "y2": "19"
        }
      ]
    ]
  },
  {
    "id": "flag",
    "labelZh": "旗帜",
    "labelEn": "Flag",
    "categoryId": "basic",
    "nodes": [
      [
        "path",
        {
          "d": "M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528",
          "key": "1jaruq"
        }
      ]
    ]
  },
  {
    "id": "food",
    "labelZh": "餐厅",
    "labelEn": "Food",
    "categoryId": "food",
    "nodes": [
      [
        "path",
        {
          "d": "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2",
          "key": "cjf0a3"
        }
      ],
      [
        "path",
        {
          "d": "M7 2v20",
          "key": "1473qp"
        }
      ],
      [
        "path",
        {
          "d": "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7",
          "key": "j28e5"
        }
      ]
    ]
  },
  {
    "id": "coffee",
    "labelZh": "咖啡",
    "labelEn": "Coffee",
    "categoryId": "food",
    "nodes": [
      [
        "path",
        {
          "d": "M10 2v2",
          "key": "7u0qdc"
        }
      ],
      [
        "path",
        {
          "d": "M14 2v2",
          "key": "6buw04"
        }
      ],
      [
        "path",
        {
          "d": "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1",
          "key": "pwadti"
        }
      ],
      [
        "path",
        {
          "d": "M6 2v2",
          "key": "colzsn"
        }
      ]
    ]
  },
  {
    "id": "beer",
    "labelZh": "酒吧",
    "labelEn": "Beer",
    "categoryId": "food",
    "nodes": [
      [
        "path",
        {
          "d": "M17 11h1a3 3 0 0 1 0 6h-1",
          "key": "1yp76v"
        }
      ],
      [
        "path",
        {
          "d": "M9 12v6",
          "key": "1u1cab"
        }
      ],
      [
        "path",
        {
          "d": "M13 12v6",
          "key": "1sugkk"
        }
      ],
      [
        "path",
        {
          "d": "M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z",
          "key": "1510fo"
        }
      ],
      [
        "path",
        {
          "d": "M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8",
          "key": "19jb7n"
        }
      ]
    ]
  },
  {
    "id": "fast-food",
    "labelZh": "快餐",
    "labelEn": "Fast food",
    "categoryId": "food",
    "nodes": [
      [
        "path",
        {
          "d": "M12 16H4a2 2 0 1 1 0-4h16a2 2 0 1 1 0 4h-4.25",
          "key": "5dloqd"
        }
      ],
      [
        "path",
        {
          "d": "M5 12a2 2 0 0 1-2-2 9 7 0 0 1 18 0 2 2 0 0 1-2 2",
          "key": "1vl3my"
        }
      ],
      [
        "path",
        {
          "d": "M5 16a2 2 0 0 0-2 2 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 2 2 0 0 0-2-2q0 0 0 0",
          "key": "1us75o"
        }
      ],
      [
        "path",
        {
          "d": "m6.67 12 6.13 4.6a2 2 0 0 0 2.8-.4l3.15-4.2",
          "key": "qqzweh"
        }
      ]
    ]
  },
  {
    "id": "bakery",
    "labelZh": "烘焙",
    "labelEn": "Bakery",
    "categoryId": "food",
    "nodes": [
      [
        "path",
        {
          "d": "M10.2 18H4.774a1.5 1.5 0 0 1-1.352-.97 11 11 0 0 1 .132-6.487",
          "key": "14kkz9"
        }
      ],
      [
        "path",
        {
          "d": "M18 10.2V4.774a1.5 1.5 0 0 0-.97-1.352 11 11 0 0 0-6.486.132",
          "key": "1g7v07"
        }
      ],
      [
        "path",
        {
          "d": "M18 5a4 3 0 0 1 4 3 2 2 0 0 1-2 2 10 10 0 0 0-5.139 1.42",
          "key": "ratg6b"
        }
      ],
      [
        "path",
        {
          "d": "M5 18a3 4 0 0 0 3 4 2 2 0 0 0 2-2 10 10 0 0 1 1.42-5.14",
          "key": "4454f0"
        }
      ],
      [
        "path",
        {
          "d": "M8.709 2.554a10 10 0 0 0-6.155 6.155 1.5 1.5 0 0 0 .676 1.626l9.807 5.42a2 2 0 0 0 2.718-2.718l-5.42-9.807a1.5 1.5 0 0 0-1.626-.676",
          "key": "qmemie"
        }
      ]
    ]
  },
  {
    "id": "restaurant",
    "labelZh": "餐馆",
    "labelEn": "Restaurant",
    "categoryId": "food",
    "nodes": [
      [
        "path",
        {
          "d": "M2 12h20",
          "key": "9i4pu4"
        }
      ],
      [
        "path",
        {
          "d": "M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8",
          "key": "u0tga0"
        }
      ],
      [
        "path",
        {
          "d": "m4 8 16-4",
          "key": "16g0ng"
        }
      ],
      [
        "path",
        {
          "d": "m8.86 6.78-.45-1.81a2 2 0 0 1 1.45-2.43l1.94-.48a2 2 0 0 1 2.43 1.46l.45 1.8",
          "key": "12cejc"
        }
      ]
    ]
  },
  {
    "id": "bed",
    "labelZh": "住宿",
    "labelEn": "Lodging",
    "categoryId": "living",
    "nodes": [
      [
        "path",
        {
          "d": "M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8",
          "key": "1k78r4"
        }
      ],
      [
        "path",
        {
          "d": "M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4",
          "key": "fb3tl2"
        }
      ],
      [
        "path",
        {
          "d": "M12 4v6",
          "key": "1dcgq2"
        }
      ],
      [
        "path",
        {
          "d": "M2 18h20",
          "key": "ajqnye"
        }
      ]
    ]
  },
  {
    "id": "home",
    "labelZh": "住宅",
    "labelEn": "Home",
    "categoryId": "living",
    "nodes": [
      [
        "path",
        {
          "d": "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
          "key": "5wwlr5"
        }
      ],
      [
        "path",
        {
          "d": "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
          "key": "r6nss1"
        }
      ]
    ]
  },
  {
    "id": "shop",
    "labelZh": "建筑",
    "labelEn": "Shop",
    "categoryId": "living",
    "nodes": [
      [
        "path",
        {
          "d": "M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5",
          "key": "slp6dd"
        }
      ],
      [
        "path",
        {
          "d": "M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244",
          "key": "o0xfot"
        }
      ],
      [
        "path",
        {
          "d": "M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05",
          "key": "wn3emo"
        }
      ]
    ]
  },
  {
    "id": "restroom",
    "labelZh": "洗手间",
    "labelEn": "Restroom",
    "categoryId": "living",
    "nodes": [
      [
        "path",
        {
          "d": "M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.598a.5.5 0 0 0-.424.765l1.544 2.47a.5.5 0 0 1-.424.765H5.402a.5.5 0 0 1-.424-.765L7 18",
          "key": "kc4kqr"
        }
      ],
      [
        "path",
        {
          "d": "M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8",
          "key": "1tqs57"
        }
      ]
    ]
  },
  {
    "id": "watch",
    "labelZh": "洗衣",
    "labelEn": "Laundry",
    "categoryId": "living",
    "nodes": [
      [
        "path",
        {
          "d": "M3 6h3",
          "key": "155dbl"
        }
      ],
      [
        "path",
        {
          "d": "M17 6h.01",
          "key": "e2y6kg"
        }
      ],
      [
        "rect",
        {
          "width": "18",
          "height": "20",
          "x": "3",
          "y": "2",
          "rx": "2",
          "key": "od3kk9"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "13",
          "r": "5",
          "key": "nlbqau"
        }
      ],
      [
        "path",
        {
          "d": "M12 18a2.5 2.5 0 0 0 0-5 2.5 2.5 0 0 1 0-5",
          "key": "17lach"
        }
      ]
    ]
  },
  {
    "id": "apartment",
    "labelZh": "公寓",
    "labelEn": "Apartment",
    "categoryId": "living",
    "nodes": [
      [
        "path",
        {
          "d": "M10 12h4",
          "key": "a56b0p"
        }
      ],
      [
        "path",
        {
          "d": "M10 8h4",
          "key": "1sr2af"
        }
      ],
      [
        "path",
        {
          "d": "M14 21v-3a2 2 0 0 0-4 0v3",
          "key": "1rgiei"
        }
      ],
      [
        "path",
        {
          "d": "M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2",
          "key": "secmi2"
        }
      ],
      [
        "path",
        {
          "d": "M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16",
          "key": "16ra0t"
        }
      ]
    ]
  },
  {
    "id": "building",
    "labelZh": "楼宇",
    "labelEn": "Building",
    "categoryId": "living",
    "nodes": [
      [
        "path",
        {
          "d": "M12 10h.01",
          "key": "1nrarc"
        }
      ],
      [
        "path",
        {
          "d": "M12 14h.01",
          "key": "1etili"
        }
      ],
      [
        "path",
        {
          "d": "M12 6h.01",
          "key": "1vi96p"
        }
      ],
      [
        "path",
        {
          "d": "M16 10h.01",
          "key": "1m94wz"
        }
      ],
      [
        "path",
        {
          "d": "M16 14h.01",
          "key": "1gbofw"
        }
      ],
      [
        "path",
        {
          "d": "M16 6h.01",
          "key": "1x0f13"
        }
      ],
      [
        "path",
        {
          "d": "M8 10h.01",
          "key": "19clt8"
        }
      ],
      [
        "path",
        {
          "d": "M8 14h.01",
          "key": "6423bh"
        }
      ],
      [
        "path",
        {
          "d": "M8 6h.01",
          "key": "1dz90k"
        }
      ],
      [
        "path",
        {
          "d": "M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3",
          "key": "cabbwy"
        }
      ],
      [
        "rect",
        {
          "x": "4",
          "y": "2",
          "width": "16",
          "height": "20",
          "rx": "2",
          "key": "1uxh74"
        }
      ]
    ]
  },
  {
    "id": "cottage",
    "labelZh": "小屋",
    "labelEn": "Cottage",
    "categoryId": "living",
    "nodes": [
      [
        "path",
        {
          "d": "M8.62 13.8A2.25 2.25 0 1 1 12 10.836a2.25 2.25 0 1 1 3.38 2.966l-2.626 2.856a.998.998 0 0 1-1.507 0z",
          "key": "n9s7kx"
        }
      ],
      [
        "path",
        {
          "d": "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
          "key": "r6nss1"
        }
      ]
    ]
  },
  {
    "id": "hotel",
    "labelZh": "酒店",
    "labelEn": "Hotel",
    "categoryId": "living",
    "nodes": [
      [
        "path",
        {
          "d": "M10 22v-6.57",
          "key": "1wmca3"
        }
      ],
      [
        "path",
        {
          "d": "M12 11h.01",
          "key": "z322tv"
        }
      ],
      [
        "path",
        {
          "d": "M12 7h.01",
          "key": "1ivr5q"
        }
      ],
      [
        "path",
        {
          "d": "M14 15.43V22",
          "key": "1q2vjd"
        }
      ],
      [
        "path",
        {
          "d": "M15 16a5 5 0 0 0-6 0",
          "key": "o9wqvi"
        }
      ],
      [
        "path",
        {
          "d": "M16 11h.01",
          "key": "xkw8gn"
        }
      ],
      [
        "path",
        {
          "d": "M16 7h.01",
          "key": "1kdx03"
        }
      ],
      [
        "path",
        {
          "d": "M8 11h.01",
          "key": "1dfujw"
        }
      ],
      [
        "path",
        {
          "d": "M8 7h.01",
          "key": "1vti4s"
        }
      ],
      [
        "rect",
        {
          "x": "4",
          "y": "2",
          "width": "16",
          "height": "20",
          "rx": "2",
          "key": "1uxh74"
        }
      ]
    ]
  },
  {
    "id": "house",
    "labelZh": "房屋",
    "labelEn": "House",
    "categoryId": "living",
    "nodes": [
      [
        "path",
        {
          "d": "M12.35 21H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v2.35",
          "key": "8ek5ge"
        }
      ],
      [
        "path",
        {
          "d": "M14.8 12.4A1 1 0 0 0 14 12h-4a1 1 0 0 0-1 1v8",
          "key": "1rbg29"
        }
      ],
      [
        "path",
        {
          "d": "M15 18h6",
          "key": "3b3c90"
        }
      ],
      [
        "path",
        {
          "d": "M18 15v6",
          "key": "9wciyi"
        }
      ]
    ]
  },
  {
    "id": "pagoda",
    "labelZh": "宝塔",
    "labelEn": "Pagoda",
    "categoryId": "living",
    "nodes": [
      [
        "path",
        {
          "d": "M10 18v-7",
          "key": "wt116b"
        }
      ],
      [
        "path",
        {
          "d": "M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z",
          "key": "yxxwt6"
        }
      ],
      [
        "path",
        {
          "d": "M14 18v-7",
          "key": "vav6t3"
        }
      ],
      [
        "path",
        {
          "d": "M18 18v-7",
          "key": "aexdmj"
        }
      ],
      [
        "path",
        {
          "d": "M3 22h18",
          "key": "8prr45"
        }
      ],
      [
        "path",
        {
          "d": "M6 18v-7",
          "key": "1ivflk"
        }
      ]
    ]
  },
  {
    "id": "town",
    "labelZh": "城镇",
    "labelEn": "Town",
    "categoryId": "living",
    "nodes": [
      [
        "path",
        {
          "d": "M10 5V3",
          "key": "1y54qe"
        }
      ],
      [
        "path",
        {
          "d": "M14 5V3",
          "key": "m6isi"
        }
      ],
      [
        "path",
        {
          "d": "M15 21v-3a3 3 0 0 0-6 0v3",
          "key": "lbp5hj"
        }
      ],
      [
        "path",
        {
          "d": "M18 3v8",
          "key": "2ollhf"
        }
      ],
      [
        "path",
        {
          "d": "M18 5H6",
          "key": "98imr9"
        }
      ],
      [
        "path",
        {
          "d": "M22 11H2",
          "key": "1lmjae"
        }
      ],
      [
        "path",
        {
          "d": "M22 9v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9",
          "key": "1rly83"
        }
      ],
      [
        "path",
        {
          "d": "M6 3v8",
          "key": "csox7g"
        }
      ]
    ]
  },
  {
    "id": "car",
    "labelZh": "汽车",
    "labelEn": "Car",
    "categoryId": "transport",
    "nodes": [
      [
        "path",
        {
          "d": "M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2",
          "key": "5owen"
        }
      ],
      [
        "circle",
        {
          "cx": "7",
          "cy": "17",
          "r": "2",
          "key": "u2ysq9"
        }
      ],
      [
        "path",
        {
          "d": "M9 17h6",
          "key": "r8uit2"
        }
      ],
      [
        "circle",
        {
          "cx": "17",
          "cy": "17",
          "r": "2",
          "key": "axvx0g"
        }
      ]
    ]
  },
  {
    "id": "bus",
    "labelZh": "公交",
    "labelEn": "Bus",
    "categoryId": "transport",
    "nodes": [
      [
        "path",
        {
          "d": "M4 6 2 7",
          "key": "1mqr15"
        }
      ],
      [
        "path",
        {
          "d": "M10 6h4",
          "key": "1itunk"
        }
      ],
      [
        "path",
        {
          "d": "m22 7-2-1",
          "key": "1umjhc"
        }
      ],
      [
        "rect",
        {
          "width": "16",
          "height": "16",
          "x": "4",
          "y": "3",
          "rx": "2",
          "key": "1wxw4b"
        }
      ],
      [
        "path",
        {
          "d": "M4 11h16",
          "key": "mpoxn0"
        }
      ],
      [
        "path",
        {
          "d": "M8 15h.01",
          "key": "a7atzg"
        }
      ],
      [
        "path",
        {
          "d": "M16 15h.01",
          "key": "rnfrdf"
        }
      ],
      [
        "path",
        {
          "d": "M6 19v2",
          "key": "1loha6"
        }
      ],
      [
        "path",
        {
          "d": "M18 21v-2",
          "key": "sqyl04"
        }
      ]
    ]
  },
  {
    "id": "tram",
    "labelZh": "有轨电车",
    "labelEn": "Tram",
    "categoryId": "transport",
    "nodes": [
      [
        "rect",
        {
          "width": "16",
          "height": "16",
          "x": "4",
          "y": "3",
          "rx": "2",
          "key": "1wxw4b"
        }
      ],
      [
        "path",
        {
          "d": "M4 11h16",
          "key": "mpoxn0"
        }
      ],
      [
        "path",
        {
          "d": "M12 3v8",
          "key": "1h2ygw"
        }
      ],
      [
        "path",
        {
          "d": "m8 19-2 3",
          "key": "13i0xs"
        }
      ],
      [
        "path",
        {
          "d": "m18 22-2-3",
          "key": "1p0ohu"
        }
      ],
      [
        "path",
        {
          "d": "M8 15h.01",
          "key": "a7atzg"
        }
      ],
      [
        "path",
        {
          "d": "M16 15h.01",
          "key": "rnfrdf"
        }
      ]
    ]
  },
  {
    "id": "train-front",
    "labelZh": "火车",
    "labelEn": "Railway",
    "categoryId": "transport",
    "nodes": [
      [
        "path",
        {
          "d": "M2 22V12a10 10 0 1 1 20 0v10",
          "key": "o0fyp0"
        }
      ],
      [
        "path",
        {
          "d": "M15 6.8v1.4a3 2.8 0 1 1-6 0V6.8",
          "key": "m8q3n9"
        }
      ],
      [
        "path",
        {
          "d": "M10 15h.01",
          "key": "44in9x"
        }
      ],
      [
        "path",
        {
          "d": "M14 15h.01",
          "key": "5mohn5"
        }
      ],
      [
        "path",
        {
          "d": "M10 19a4 4 0 0 1-4-4v-3a6 6 0 1 1 12 0v3a4 4 0 0 1-4 4Z",
          "key": "hckbmu"
        }
      ],
      [
        "path",
        {
          "d": "m9 19-2 3",
          "key": "iij7hm"
        }
      ],
      [
        "path",
        {
          "d": "m15 19 2 3",
          "key": "npx8sa"
        }
      ]
    ]
  },
  {
    "id": "plane",
    "labelZh": "机场",
    "labelEn": "Airport",
    "categoryId": "transport",
    "nodes": [
      [
        "path",
        {
          "d": "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
          "key": "1v9wt8"
        }
      ]
    ]
  },
  {
    "id": "parking",
    "labelZh": "停车",
    "labelEn": "Parking",
    "categoryId": "transport",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10",
          "key": "1mglay"
        }
      ],
      [
        "path",
        {
          "d": "M9 17V7h4a3 3 0 0 1 0 6H9",
          "key": "1dfk2c"
        }
      ]
    ]
  },
  {
    "id": "airport",
    "labelZh": "航站楼",
    "labelEn": "Airport terminal",
    "categoryId": "transport",
    "nodes": [
      [
        "path",
        {
          "d": "M18.2 12.27 20 6H4l1.8 6.27a1 1 0 0 0 .95.73h10.5a1 1 0 0 0 .96-.73Z",
          "key": "1pledb"
        }
      ],
      [
        "path",
        {
          "d": "M8 13v9",
          "key": "hmv0ci"
        }
      ],
      [
        "path",
        {
          "d": "M16 22v-9",
          "key": "ylnf1u"
        }
      ],
      [
        "path",
        {
          "d": "m9 6 1 7",
          "key": "dpdgam"
        }
      ],
      [
        "path",
        {
          "d": "m15 6-1 7",
          "key": "ls7zgu"
        }
      ],
      [
        "path",
        {
          "d": "M12 6V2",
          "key": "1pj48d"
        }
      ],
      [
        "path",
        {
          "d": "M13 2h-2",
          "key": "mj6ths"
        }
      ]
    ]
  },
  {
    "id": "bridge",
    "labelZh": "桥梁",
    "labelEn": "Bridge",
    "categoryId": "transport",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "8",
          "key": "46899m"
        }
      ],
      [
        "path",
        {
          "d": "M12 2v7.5",
          "key": "1e5rl5"
        }
      ],
      [
        "path",
        {
          "d": "m19 5-5.23 5.23",
          "key": "1ezxxf"
        }
      ],
      [
        "path",
        {
          "d": "M22 12h-7.5",
          "key": "le1719"
        }
      ],
      [
        "path",
        {
          "d": "m19 19-5.23-5.23",
          "key": "p3fmgn"
        }
      ],
      [
        "path",
        {
          "d": "M12 14.5V22",
          "key": "dgcmos"
        }
      ],
      [
        "path",
        {
          "d": "M10.23 13.77 5 19",
          "key": "qwopd4"
        }
      ],
      [
        "path",
        {
          "d": "M9.5 12H2",
          "key": "r7bup8"
        }
      ],
      [
        "path",
        {
          "d": "M10.23 10.23 5 5",
          "key": "k2y7lj"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "2.5",
          "key": "ix0uyj"
        }
      ]
    ]
  },
  {
    "id": "metro",
    "labelZh": "地铁",
    "labelEn": "Metro",
    "categoryId": "transport",
    "nodes": [
      [
        "circle",
        {
          "cx": "6",
          "cy": "19",
          "r": "3",
          "key": "1kj8tv"
        }
      ],
      [
        "path",
        {
          "d": "M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15",
          "key": "1d8sl"
        }
      ],
      [
        "circle",
        {
          "cx": "18",
          "cy": "5",
          "r": "3",
          "key": "gq8acd"
        }
      ]
    ]
  },
  {
    "id": "parking-sign",
    "labelZh": "停车标志",
    "labelEn": "Parking sign",
    "categoryId": "transport",
    "nodes": [
      [
        "rect",
        {
          "width": "18",
          "height": "18",
          "x": "3",
          "y": "3",
          "rx": "2",
          "key": "afitv7"
        }
      ],
      [
        "path",
        {
          "d": "M9 17V7h4a3 3 0 0 1 0 6H9",
          "key": "1dfk2c"
        }
      ]
    ]
  },
  {
    "id": "subway",
    "labelZh": "地铁站",
    "labelEn": "Subway",
    "categoryId": "transport",
    "nodes": [
      [
        "path",
        {
          "d": "M8 3.1V7a4 4 0 0 0 8 0V3.1",
          "key": "1v71zp"
        }
      ],
      [
        "path",
        {
          "d": "m9 15-1-1",
          "key": "1yrq24"
        }
      ],
      [
        "path",
        {
          "d": "m15 15 1-1",
          "key": "1t0d6s"
        }
      ],
      [
        "path",
        {
          "d": "M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z",
          "key": "1p0hjs"
        }
      ],
      [
        "path",
        {
          "d": "m8 19-2 3",
          "key": "13i0xs"
        }
      ],
      [
        "path",
        {
          "d": "m16 19 2 3",
          "key": "xo31yx"
        }
      ]
    ]
  },
  {
    "id": "train",
    "labelZh": "列车",
    "labelEn": "Train",
    "categoryId": "transport",
    "nodes": [
      [
        "path",
        {
          "d": "M2 17 17 2",
          "key": "18b09t"
        }
      ],
      [
        "path",
        {
          "d": "m2 14 8 8",
          "key": "1gv9hu"
        }
      ],
      [
        "path",
        {
          "d": "m5 11 8 8",
          "key": "189pqp"
        }
      ],
      [
        "path",
        {
          "d": "m8 8 8 8",
          "key": "1imecy"
        }
      ],
      [
        "path",
        {
          "d": "m11 5 8 8",
          "key": "ummqn6"
        }
      ],
      [
        "path",
        {
          "d": "m14 2 8 8",
          "key": "1vk7dn"
        }
      ],
      [
        "path",
        {
          "d": "M7 22 22 7",
          "key": "15mb1i"
        }
      ]
    ]
  },
  {
    "id": "travel",
    "labelZh": "旅行",
    "labelEn": "Travel",
    "categoryId": "transport",
    "nodes": [
      [
        "path",
        {
          "d": "M6 20a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2",
          "key": "1m57jg"
        }
      ],
      [
        "path",
        {
          "d": "M8 18V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14",
          "key": "1l99gc"
        }
      ],
      [
        "path",
        {
          "d": "M10 20h4",
          "key": "ni2waw"
        }
      ],
      [
        "circle",
        {
          "cx": "16",
          "cy": "20",
          "r": "2",
          "key": "1vifvg"
        }
      ],
      [
        "circle",
        {
          "cx": "8",
          "cy": "20",
          "r": "2",
          "key": "ckkr5m"
        }
      ]
    ]
  },
  {
    "id": "bag",
    "labelZh": "商店",
    "labelEn": "Shopping bag",
    "categoryId": "shopping",
    "nodes": [
      [
        "path",
        {
          "d": "M16 10a4 4 0 0 1-8 0",
          "key": "1ltviw"
        }
      ],
      [
        "path",
        {
          "d": "M3.103 6.034h17.794",
          "key": "awc11p"
        }
      ],
      [
        "path",
        {
          "d": "M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z",
          "key": "o988cm"
        }
      ]
    ]
  },
  {
    "id": "mall",
    "labelZh": "商场",
    "labelEn": "Mall",
    "categoryId": "shopping",
    "nodes": [
      [
        "path",
        {
          "d": "m15 11-1 9",
          "key": "5wnq3a"
        }
      ],
      [
        "path",
        {
          "d": "m19 11-4-7",
          "key": "cnml18"
        }
      ],
      [
        "path",
        {
          "d": "M2 11h20",
          "key": "3eubbj"
        }
      ],
      [
        "path",
        {
          "d": "m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4",
          "key": "yiazzp"
        }
      ],
      [
        "path",
        {
          "d": "M4.5 15.5h15",
          "key": "13mye1"
        }
      ],
      [
        "path",
        {
          "d": "m5 11 4-7",
          "key": "116ra9"
        }
      ],
      [
        "path",
        {
          "d": "m9 11 1 9",
          "key": "1ojof7"
        }
      ]
    ]
  },
  {
    "id": "market",
    "labelZh": "市集",
    "labelEn": "Market",
    "categoryId": "shopping",
    "nodes": [
      [
        "circle",
        {
          "cx": "4",
          "cy": "4",
          "r": "2",
          "key": "bt5ra8"
        }
      ],
      [
        "path",
        {
          "d": "m14 5 3-3 3 3",
          "key": "1sorif"
        }
      ],
      [
        "path",
        {
          "d": "m14 10 3-3 3 3",
          "key": "1jyi9h"
        }
      ],
      [
        "path",
        {
          "d": "M17 14V2",
          "key": "8ymqnk"
        }
      ],
      [
        "path",
        {
          "d": "M17 14H7l-5 8h20Z",
          "key": "13ar7p"
        }
      ],
      [
        "path",
        {
          "d": "M8 14v8",
          "key": "1ghmqk"
        }
      ],
      [
        "path",
        {
          "d": "m9 14 5 8",
          "key": "13pgi6"
        }
      ]
    ]
  },
  {
    "id": "bank",
    "labelZh": "银行",
    "labelEn": "Bank",
    "categoryId": "shopping",
    "nodes": [
      [
        "path",
        {
          "d": "M14 21v-3a2 2 0 0 0-4 0v3",
          "key": "1rgiei"
        }
      ],
      [
        "path",
        {
          "d": "M18 12h.01",
          "key": "yjnet6"
        }
      ],
      [
        "path",
        {
          "d": "M18 16h.01",
          "key": "plv8zi"
        }
      ],
      [
        "path",
        {
          "d": "M22 7a1 1 0 0 0-1-1h-2a2 2 0 0 1-1.143-.359L13.143 2.36a2 2 0 0 0-2.286-.001L6.143 5.64A2 2 0 0 1 5 6H3a1 1 0 0 0-1 1v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z",
          "key": "1ogmi3"
        }
      ],
      [
        "path",
        {
          "d": "M6 12h.01",
          "key": "c2rlol"
        }
      ],
      [
        "path",
        {
          "d": "M6 16h.01",
          "key": "1pmjb7"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "10",
          "r": "2",
          "key": "1yojzk"
        }
      ]
    ]
  },
  {
    "id": "atm",
    "labelZh": "ATM",
    "labelEn": "ATM",
    "categoryId": "shopping",
    "nodes": [
      [
        "rect",
        {
          "x": "3",
          "y": "5",
          "width": "18",
          "height": "14",
          "rx": "2"
        }
      ],
      [
        "text",
        {
          "x": "12",
          "y": "14.5",
          "textAnchor": "middle",
          "fontSize": "7",
          "fontWeight": "700",
          "children": "ATM"
        }
      ]
    ]
  },
  {
    "id": "money",
    "labelZh": "钱袋",
    "labelEn": "Money",
    "categoryId": "shopping",
    "nodes": [
      [
        "path",
        {
          "d": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
          "key": "3c2336"
        }
      ],
      [
        "path",
        {
          "d": "M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8",
          "key": "1h4pet"
        }
      ],
      [
        "path",
        {
          "d": "M12 18V6",
          "key": "zqpxq5"
        }
      ]
    ]
  },
  {
    "id": "cart",
    "labelZh": "购物车",
    "labelEn": "Shopping cart",
    "categoryId": "shopping",
    "nodes": [
      [
        "circle",
        {
          "cx": "8",
          "cy": "21",
          "r": "1",
          "key": "jimo8o"
        }
      ],
      [
        "circle",
        {
          "cx": "19",
          "cy": "21",
          "r": "1",
          "key": "13723u"
        }
      ],
      [
        "path",
        {
          "d": "M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12",
          "key": "9zh506"
        }
      ]
    ]
  },
  {
    "id": "museum",
    "labelZh": "博物馆",
    "labelEn": "Museum",
    "categoryId": "leisure",
    "nodes": [
      [
        "rect",
        {
          "width": "18",
          "height": "18",
          "x": "3",
          "y": "3",
          "rx": "2",
          "key": "afitv7"
        }
      ],
      [
        "path",
        {
          "d": "M9 3v18",
          "key": "fh3hqa"
        }
      ],
      [
        "path",
        {
          "d": "M15 3v18",
          "key": "14nvp0"
        }
      ]
    ]
  },
  {
    "id": "theater",
    "labelZh": "剧院",
    "labelEn": "Theater",
    "categoryId": "leisure",
    "nodes": [
      [
        "path",
        {
          "d": "M10 11h.01",
          "key": "d2at3l"
        }
      ],
      [
        "path",
        {
          "d": "M14 6h.01",
          "key": "k028ub"
        }
      ],
      [
        "path",
        {
          "d": "M18 6h.01",
          "key": "1v4wsw"
        }
      ],
      [
        "path",
        {
          "d": "M6.5 13.1h.01",
          "key": "1748ia"
        }
      ],
      [
        "path",
        {
          "d": "M22 5c0 9-4 12-6 12s-6-3-6-12c0-2 2-3 6-3s6 1 6 3",
          "key": "172yzv"
        }
      ],
      [
        "path",
        {
          "d": "M17.4 9.9c-.8.8-2 .8-2.8 0",
          "key": "1obv0w"
        }
      ],
      [
        "path",
        {
          "d": "M10.1 7.1C9 7.2 7.7 7.7 6 8.6c-3.5 2-4.7 3.9-3.7 5.6 4.5 7.8 9.5 8.4 11.2 7.4.9-.5 1.9-2.1 1.9-4.7",
          "key": "rqjl8i"
        }
      ],
      [
        "path",
        {
          "d": "M9.1 16.5c.3-1.1 1.4-1.7 2.4-1.4",
          "key": "1mr6wy"
        }
      ]
    ]
  },
  {
    "id": "movie",
    "labelZh": "影院",
    "labelEn": "Cinema",
    "categoryId": "leisure",
    "nodes": [
      [
        "path",
        {
          "d": "m12.296 3.464 3.02 3.956",
          "key": "qash78"
        }
      ],
      [
        "path",
        {
          "d": "M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z",
          "key": "1h7j8b"
        }
      ],
      [
        "path",
        {
          "d": "M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
          "key": "4lm6w1"
        }
      ],
      [
        "path",
        {
          "d": "m6.18 5.276 3.1 3.899",
          "key": "zjj9t3"
        }
      ]
    ]
  },
  {
    "id": "attraction",
    "labelZh": "景点",
    "labelEn": "Attraction",
    "categoryId": "leisure",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "2",
          "key": "1c9p78"
        }
      ],
      [
        "path",
        {
          "d": "M12 2v4",
          "key": "3427ic"
        }
      ],
      [
        "path",
        {
          "d": "m6.8 15-3.5 2",
          "key": "hjy98k"
        }
      ],
      [
        "path",
        {
          "d": "m20.7 7-3.5 2",
          "key": "f08gto"
        }
      ],
      [
        "path",
        {
          "d": "M6.8 9 3.3 7",
          "key": "1aevh4"
        }
      ],
      [
        "path",
        {
          "d": "m20.7 17-3.5-2",
          "key": "1liqo3"
        }
      ],
      [
        "path",
        {
          "d": "m9 22 3-8 3 8",
          "key": "wees03"
        }
      ],
      [
        "path",
        {
          "d": "M8 22h8",
          "key": "rmew8v"
        }
      ],
      [
        "path",
        {
          "d": "M18 18.7a9 9 0 1 0-12 0",
          "key": "dhzg4g"
        }
      ]
    ]
  },
  {
    "id": "sport",
    "labelZh": "体育场",
    "labelEn": "Sports",
    "categoryId": "leisure",
    "nodes": [
      [
        "path",
        {
          "d": "M11 7a16 16 20 0 1 10.98 4.362",
          "key": "1mmfx7"
        }
      ],
      [
        "path",
        {
          "d": "M12 12a13 13 0 0 1-8.66 5",
          "key": "14sm5y"
        }
      ],
      [
        "path",
        {
          "d": "M16.83 13.634a16 16 0 0 1-9.267 7.328",
          "key": "j0eyj5"
        }
      ],
      [
        "path",
        {
          "d": "M20.66 17A13 13 0 0 0 12 12a13 13 0 0 1 0-10",
          "key": "qaetsw"
        }
      ],
      [
        "path",
        {
          "d": "M8.17 15.366a16 16 0 0 1-1.713-11.69",
          "key": "17ewdd"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10",
          "key": "1mglay"
        }
      ]
    ]
  },
  {
    "id": "library",
    "labelZh": "图书馆",
    "labelEn": "Library",
    "categoryId": "leisure",
    "nodes": [
      [
        "path",
        {
          "d": "m16 6 4 14",
          "key": "ji33uf"
        }
      ],
      [
        "path",
        {
          "d": "M12 6v14",
          "key": "1n7gus"
        }
      ],
      [
        "path",
        {
          "d": "M8 8v12",
          "key": "1gg7y9"
        }
      ],
      [
        "path",
        {
          "d": "M4 4v16",
          "key": "6qkkli"
        }
      ]
    ]
  },
  {
    "id": "book-library",
    "labelZh": "阅读",
    "labelEn": "Reading",
    "categoryId": "leisure",
    "nodes": [
      [
        "path",
        {
          "d": "M12 7v14",
          "key": "1akyts"
        }
      ],
      [
        "path",
        {
          "d": "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",
          "key": "ruj8y"
        }
      ]
    ]
  },
  {
    "id": "pool",
    "labelZh": "泳池",
    "labelEn": "Pool",
    "categoryId": "leisure",
    "nodes": [
      [
        "path",
        {
          "d": "M2 12q2.5 2 5 0t5 0 5 0 5 0",
          "key": "8ddzzs"
        }
      ],
      [
        "path",
        {
          "d": "M2 19q2.5 2 5 0t5 0 5 0 5 0",
          "key": "1wj4st"
        }
      ],
      [
        "path",
        {
          "d": "M2 5q2.5 2 5 0t5 0 5 0 5 0",
          "key": "69x50u"
        }
      ]
    ]
  },
  {
    "id": "picnic",
    "labelZh": "公园",
    "labelEn": "Picnic",
    "categoryId": "nature",
    "nodes": [
      [
        "path",
        {
          "d": "m2.37 11.223 8.372-6.777a2 2 0 0 1 2.516 0l8.371 6.777",
          "key": "f1wd0e"
        }
      ],
      [
        "path",
        {
          "d": "M21 15a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5.25",
          "key": "1pfu07"
        }
      ],
      [
        "path",
        {
          "d": "M3 15a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h9",
          "key": "1oq9qw"
        }
      ],
      [
        "path",
        {
          "d": "m6.67 15 6.13 4.6a2 2 0 0 0 2.8-.4l3.15-4.2",
          "key": "1fnwu5"
        }
      ],
      [
        "rect",
        {
          "width": "20",
          "height": "4",
          "x": "2",
          "y": "11",
          "rx": "1",
          "key": "itshg"
        }
      ]
    ]
  },
  {
    "id": "tree",
    "labelZh": "树木",
    "labelEn": "Tree",
    "categoryId": "nature",
    "nodes": [
      [
        "path",
        {
          "d": "M8 19a4 4 0 0 1-2.24-7.32A3.5 3.5 0 0 1 9 6.03V6a3 3 0 1 1 6 0v.04a3.5 3.5 0 0 1 3.24 5.65A4 4 0 0 1 16 19Z",
          "key": "oadzkq"
        }
      ],
      [
        "path",
        {
          "d": "M12 19v3",
          "key": "npa21l"
        }
      ]
    ]
  },
  {
    "id": "mountain",
    "labelZh": "山峰",
    "labelEn": "Mountain",
    "categoryId": "nature",
    "nodes": [
      [
        "path",
        {
          "d": "m8 3 4 8 5-5 5 15H2L8 3z",
          "key": "otkl63"
        }
      ],
      [
        "path",
        {
          "d": "M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19",
          "key": "1pvmmp"
        }
      ]
    ]
  },
  {
    "id": "beach",
    "labelZh": "海滩",
    "labelEn": "Beach",
    "categoryId": "nature",
    "nodes": [
      [
        "path",
        {
          "d": "M12 13v7a2 2 0 0 0 4 0",
          "key": "rpgb42"
        }
      ],
      [
        "path",
        {
          "d": "M12 2v2",
          "key": "tus03m"
        }
      ],
      [
        "path",
        {
          "d": "M20.992 13a1 1 0 0 0 .97-1.274 10.284 10.284 0 0 0-19.923 0A1 1 0 0 0 3 13z",
          "key": "124nyo"
        }
      ]
    ]
  },
  {
    "id": "camp",
    "labelZh": "营地",
    "labelEn": "Camp",
    "categoryId": "nature",
    "nodes": [
      [
        "path",
        {
          "d": "M3.5 21 14 3",
          "key": "1szst5"
        }
      ],
      [
        "path",
        {
          "d": "M20.5 21 10 3",
          "key": "1310c3"
        }
      ],
      [
        "path",
        {
          "d": "M15.5 21 12 15l-3.5 6",
          "key": "1ddtfw"
        }
      ],
      [
        "path",
        {
          "d": "M2 21h20",
          "key": "1nyx9w"
        }
      ]
    ]
  },
  {
    "id": "viewpoint",
    "labelZh": "观景点",
    "labelEn": "Viewpoint",
    "categoryId": "nature",
    "nodes": [
      [
        "path",
        {
          "d": "M10 10h4",
          "key": "tcdvrf"
        }
      ],
      [
        "path",
        {
          "d": "M19 7V4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3",
          "key": "3apit1"
        }
      ],
      [
        "path",
        {
          "d": "M20 21a2 2 0 0 0 2-2v-3.851c0-1.39-2-2.962-2-4.829V8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2z",
          "key": "rhpgnw"
        }
      ],
      [
        "path",
        {
          "d": "M 22 16 L 2 16",
          "key": "14lkq7"
        }
      ],
      [
        "path",
        {
          "d": "M4 21a2 2 0 0 1-2-2v-3.851c0-1.39 2-2.962 2-4.829V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2z",
          "key": "104b3k"
        }
      ],
      [
        "path",
        {
          "d": "M9 7V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v3",
          "key": "14fczp"
        }
      ]
    ]
  },
  {
    "id": "broadleaf-tree",
    "labelZh": "阔叶树",
    "labelEn": "Broadleaf tree",
    "categoryId": "nature",
    "nodes": [
      [
        "path",
        {
          "d": "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z",
          "key": "nnexq3"
        }
      ],
      [
        "path",
        {
          "d": "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12",
          "key": "mt58a7"
        }
      ]
    ]
  },
  {
    "id": "forest-camp",
    "labelZh": "森林营地",
    "labelEn": "Forest camp",
    "categoryId": "nature",
    "nodes": [
      [
        "path",
        {
          "d": "M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z",
          "key": "1l6gj6"
        }
      ],
      [
        "path",
        {
          "d": "M7 16v6",
          "key": "1a82de"
        }
      ],
      [
        "path",
        {
          "d": "M13 19v3",
          "key": "13sx9i"
        }
      ],
      [
        "path",
        {
          "d": "M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5",
          "key": "1sj9kv"
        }
      ]
    ]
  },
  {
    "id": "palm",
    "labelZh": "棕榈树",
    "labelEn": "Palm tree",
    "categoryId": "nature",
    "nodes": [
      [
        "path",
        {
          "d": "M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4",
          "key": "foxbe7"
        }
      ],
      [
        "path",
        {
          "d": "M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3",
          "key": "18arnh"
        }
      ],
      [
        "path",
        {
          "d": "M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35",
          "key": "ywahnh"
        }
      ],
      [
        "path",
        {
          "d": "M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14",
          "key": "ft0feo"
        }
      ]
    ]
  },
  {
    "id": "conifer",
    "labelZh": "针叶林",
    "labelEn": "Conifer",
    "categoryId": "nature",
    "nodes": [
      [
        "path",
        {
          "d": "m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z",
          "key": "cpyugq"
        }
      ],
      [
        "path",
        {
          "d": "M12 22v-3",
          "key": "kmzjlo"
        }
      ]
    ]
  },
  {
    "id": "landscape",
    "labelZh": "自然景观",
    "labelEn": "Landscape",
    "categoryId": "nature",
    "nodes": [
      [
        "path",
        {
          "d": "m8 3 4 8 5-5 5 15H2L8 3z",
          "key": "otkl63"
        }
      ]
    ]
  },
  {
    "id": "flower",
    "labelZh": "花卉",
    "labelEn": "Flower",
    "categoryId": "nature",
    "nodes": [
      [
        "path",
        {
          "d": "M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1",
          "key": "3pnvol"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "8",
          "r": "2",
          "key": "1822b1"
        }
      ],
      [
        "path",
        {
          "d": "M12 10v12",
          "key": "6ubwww"
        }
      ],
      [
        "path",
        {
          "d": "M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z",
          "key": "9hd38g"
        }
      ],
      [
        "path",
        {
          "d": "M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z",
          "key": "ufn41s"
        }
      ]
    ]
  },
  {
    "id": "tree-row",
    "labelZh": "林带",
    "labelEn": "Tree row",
    "categoryId": "nature",
    "nodes": [
      [
        "path",
        {
          "d": "M21.66 17.67a1.08 1.08 0 0 1-.04 1.6A12 12 0 0 1 4.73 2.38a1.1 1.1 0 0 1 1.61-.04z",
          "key": "4ite01"
        }
      ],
      [
        "path",
        {
          "d": "M19.65 15.66A8 8 0 0 1 8.35 4.34",
          "key": "1gxipu"
        }
      ],
      [
        "path",
        {
          "d": "m14 10-5.5 5.5",
          "key": "92pfem"
        }
      ],
      [
        "path",
        {
          "d": "M14 17.85V10H6.15",
          "key": "xqmtsk"
        }
      ]
    ]
  },
  {
    "id": "waterfall",
    "labelZh": "瀑布",
    "labelEn": "Waterfall",
    "categoryId": "nature",
    "nodes": [
      [
        "path",
        {
          "d": "M12 10L12 2",
          "key": "jvb0aw"
        }
      ],
      [
        "path",
        {
          "d": "M16 6L12 10L8 6",
          "key": "9j6vje"
        }
      ],
      [
        "path",
        {
          "d": "M2 15C2.6 15.5 3.2 16 4.5 16C7 16 7 14 9.5 14C12.1 14 11.9 16 14.5 16C17 16 17 14 19.5 14C20.8 14 21.4 14.5 22 15",
          "key": "s2zepw"
        }
      ],
      [
        "path",
        {
          "d": "M2 21C2.6 21.5 3.2 22 4.5 22C7 22 7 20 9.5 20C12.1 20 11.9 22 14.5 22C17 22 17 20 19.5 20C20.8 20 21.4 20.5 22 21",
          "key": "u68omc"
        }
      ]
    ]
  },
  {
    "id": "waters",
    "labelZh": "水域",
    "labelEn": "Waters",
    "categoryId": "nature",
    "nodes": [
      [
        "path",
        {
          "d": "M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z",
          "key": "1ptgy4"
        }
      ],
      [
        "path",
        {
          "d": "M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97",
          "key": "1sl1rz"
        }
      ]
    ]
  },
  {
    "id": "hospital",
    "labelZh": "医院",
    "labelEn": "Hospital",
    "categoryId": "service",
    "nodes": [
      [
        "path",
        {
          "d": "M12 7v4",
          "key": "xawao1"
        }
      ],
      [
        "path",
        {
          "d": "M14 21v-3a2 2 0 0 0-4 0v3",
          "key": "1rgiei"
        }
      ],
      [
        "path",
        {
          "d": "M14 9h-4",
          "key": "1w2s2s"
        }
      ],
      [
        "path",
        {
          "d": "M18 11h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2",
          "key": "1tthqt"
        }
      ],
      [
        "path",
        {
          "d": "M18 21V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16",
          "key": "dw4p4i"
        }
      ]
    ]
  },
  {
    "id": "pharmacy",
    "labelZh": "药店",
    "labelEn": "Pharmacy",
    "categoryId": "service",
    "nodes": [
      [
        "path",
        {
          "d": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
          "key": "3c2336"
        }
      ],
      [
        "line",
        {
          "x1": "12",
          "x2": "12",
          "y1": "8",
          "y2": "16",
          "key": "10p56q"
        }
      ],
      [
        "line",
        {
          "x1": "8",
          "x2": "16",
          "y1": "12",
          "y2": "12",
          "key": "1jonct"
        }
      ]
    ]
  },
  {
    "id": "police",
    "labelZh": "警察",
    "labelEn": "Police",
    "categoryId": "service",
    "nodes": [
      [
        "path",
        {
          "d": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
          "key": "oel41y"
        }
      ]
    ]
  },
  {
    "id": "school",
    "labelZh": "学校",
    "labelEn": "School",
    "categoryId": "service",
    "nodes": [
      [
        "path",
        {
          "d": "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z",
          "key": "j76jl0"
        }
      ],
      [
        "path",
        {
          "d": "M22 10v6",
          "key": "1lu8f3"
        }
      ],
      [
        "path",
        {
          "d": "M6 12.5V16a6 3 0 0 0 12 0v-3.5",
          "key": "1r8lef"
        }
      ]
    ]
  },
  {
    "id": "mail",
    "labelZh": "邮局",
    "labelEn": "Post office",
    "categoryId": "service",
    "nodes": [
      [
        "path",
        {
          "d": "m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7",
          "key": "132q7q"
        }
      ],
      [
        "rect",
        {
          "x": "2",
          "y": "4",
          "width": "20",
          "height": "16",
          "rx": "2",
          "key": "izxlao"
        }
      ]
    ]
  },
  {
    "id": "fuel",
    "labelZh": "加油站",
    "labelEn": "Fuel",
    "categoryId": "service",
    "nodes": [
      [
        "path",
        {
          "d": "M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5",
          "key": "1wtuz0"
        }
      ],
      [
        "path",
        {
          "d": "M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16",
          "key": "e09ifn"
        }
      ],
      [
        "path",
        {
          "d": "M2 21h13",
          "key": "1x0fut"
        }
      ],
      [
        "path",
        {
          "d": "M3 9h11",
          "key": "1p7c0w"
        }
      ]
    ]
  },
  {
    "id": "medical",
    "labelZh": "医疗服务",
    "labelEn": "Medical services",
    "categoryId": "service",
    "nodes": [
      [
        "path",
        {
          "d": "M12 11v4",
          "key": "a6ujw6"
        }
      ],
      [
        "path",
        {
          "d": "M14 13h-4",
          "key": "1pl8zg"
        }
      ],
      [
        "path",
        {
          "d": "M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2",
          "key": "1ksdt3"
        }
      ],
      [
        "path",
        {
          "d": "M18 6v14",
          "key": "1mu4gy"
        }
      ],
      [
        "path",
        {
          "d": "M6 6v14",
          "key": "1s15cj"
        }
      ],
      [
        "rect",
        {
          "width": "20",
          "height": "14",
          "x": "2",
          "y": "6",
          "rx": "2",
          "key": "i6l2r4"
        }
      ]
    ]
  },
  {
    "id": "office",
    "labelZh": "办公",
    "labelEn": "Office",
    "categoryId": "work",
    "nodes": [
      [
        "path",
        {
          "d": "M12 12h.01",
          "key": "1mp3jc"
        }
      ],
      [
        "path",
        {
          "d": "M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2",
          "key": "1ksdt3"
        }
      ],
      [
        "path",
        {
          "d": "M22 13a18.15 18.15 0 0 1-20 0",
          "key": "12hx5q"
        }
      ],
      [
        "rect",
        {
          "width": "20",
          "height": "14",
          "x": "2",
          "y": "6",
          "rx": "2",
          "key": "i6l2r4"
        }
      ]
    ]
  },
  {
    "id": "warehouse",
    "labelZh": "仓储",
    "labelEn": "Warehouse",
    "categoryId": "work",
    "nodes": [
      [
        "path",
        {
          "d": "M18 21V10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v11",
          "key": "pb2vm6"
        }
      ],
      [
        "path",
        {
          "d": "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 1.132-1.803l7.95-3.974a2 2 0 0 1 1.837 0l7.948 3.974A2 2 0 0 1 22 8z",
          "key": "doq5xv"
        }
      ],
      [
        "path",
        {
          "d": "M6 13h12",
          "key": "yf64js"
        }
      ],
      [
        "path",
        {
          "d": "M6 17h12",
          "key": "1jwigz"
        }
      ]
    ]
  },
  {
    "id": "ticket",
    "labelZh": "活动",
    "labelEn": "Event",
    "categoryId": "work",
    "nodes": [
      [
        "path",
        {
          "d": "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z",
          "key": "qn84l0"
        }
      ],
      [
        "path",
        {
          "d": "M13 5v2",
          "key": "dyzc3o"
        }
      ],
      [
        "path",
        {
          "d": "M13 17v2",
          "key": "1ont0d"
        }
      ],
      [
        "path",
        {
          "d": "M13 11v2",
          "key": "1wjjxi"
        }
      ]
    ]
  },
  {
    "id": "camera",
    "labelZh": "拍照点",
    "labelEn": "Photo spot",
    "categoryId": "work",
    "nodes": [
      [
        "path",
        {
          "d": "M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z",
          "key": "18u6gg"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "13",
          "r": "3",
          "key": "1vg3eu"
        }
      ]
    ]
  },
  {
    "id": "factory",
    "labelZh": "工厂",
    "labelEn": "Factory",
    "categoryId": "work",
    "nodes": [
      [
        "path",
        {
          "d": "M12 16h.01",
          "key": "1drbdi"
        }
      ],
      [
        "path",
        {
          "d": "M16 16h.01",
          "key": "1f9h7w"
        }
      ],
      [
        "path",
        {
          "d": "M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z",
          "key": "1iv0i2"
        }
      ],
      [
        "path",
        {
          "d": "M8 16h.01",
          "key": "18s6g9"
        }
      ]
    ]
  },
  {
    "id": "fingerprint",
    "labelZh": "指纹",
    "labelEn": "Fingerprint",
    "categoryId": "other",
    "nodes": [
      [
        "path",
        {
          "d": "M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4",
          "key": "1nerag"
        }
      ],
      [
        "path",
        {
          "d": "M14 13.12c0 2.38 0 6.38-1 8.88",
          "key": "o46ks0"
        }
      ],
      [
        "path",
        {
          "d": "M17.29 21.02c.12-.6.43-2.3.5-3.02",
          "key": "ptglia"
        }
      ],
      [
        "path",
        {
          "d": "M2 12a10 10 0 0 1 18-6",
          "key": "ydlgp0"
        }
      ],
      [
        "path",
        {
          "d": "M2 16h.01",
          "key": "1gqxmh"
        }
      ],
      [
        "path",
        {
          "d": "M21.8 16c.2-2 .131-5.354 0-6",
          "key": "drycrb"
        }
      ],
      [
        "path",
        {
          "d": "M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2",
          "key": "1tidbn"
        }
      ],
      [
        "path",
        {
          "d": "M8.65 22c.21-.66.45-1.32.57-2",
          "key": "13wd9y"
        }
      ],
      [
        "path",
        {
          "d": "M9 6.8a6 6 0 0 1 9 5.2v2",
          "key": "1fr1j5"
        }
      ]
    ]
  },
  {
    "id": "graph",
    "labelZh": "节点图",
    "labelEn": "Graph",
    "categoryId": "other",
    "nodes": [
      [
        "path",
        {
          "d": "M15 6a9 9 0 0 0-9 9V3",
          "key": "1cii5b"
        }
      ],
      [
        "circle",
        {
          "cx": "18",
          "cy": "6",
          "r": "3",
          "key": "1h7g24"
        }
      ],
      [
        "circle",
        {
          "cx": "6",
          "cy": "18",
          "r": "3",
          "key": "fqmcym"
        }
      ]
    ]
  },
  {
    "id": "target",
    "labelZh": "圆形标记",
    "labelEn": "Target",
    "categoryId": "other",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10",
          "key": "1mglay"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "6",
          "key": "1vlfrh"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "2",
          "key": "1c9p78"
        }
      ]
    ]
  },
  {
    "id": "bullseye",
    "labelZh": "靶心",
    "labelEn": "Bullseye",
    "categoryId": "other",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10",
          "key": "1mglay"
        }
      ],
      [
        "line",
        {
          "x1": "22",
          "x2": "18",
          "y1": "12",
          "y2": "12",
          "key": "l9bcsi"
        }
      ],
      [
        "line",
        {
          "x1": "6",
          "x2": "2",
          "y1": "12",
          "y2": "12",
          "key": "13hhkx"
        }
      ],
      [
        "line",
        {
          "x1": "12",
          "x2": "12",
          "y1": "6",
          "y2": "2",
          "key": "10w3f3"
        }
      ],
      [
        "line",
        {
          "x1": "12",
          "x2": "12",
          "y1": "22",
          "y2": "18",
          "key": "15g9kq"
        }
      ]
    ]
  },
  {
    "id": "question",
    "labelZh": "问号",
    "labelEn": "Question",
    "categoryId": "other",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10"
        }
      ],
      [
        "path",
        {
          "d": "M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4"
        }
      ],
      [
        "line",
        {
          "x1": "12",
          "y1": "18",
          "x2": "12.01",
          "y2": "18"
        }
      ]
    ]
  },
  {
    "id": "plus",
    "labelZh": "加号",
    "labelEn": "Plus",
    "categoryId": "other",
    "nodes": [
      [
        "line",
        {
          "x1": "12",
          "y1": "4",
          "x2": "12",
          "y2": "20"
        }
      ],
      [
        "line",
        {
          "x1": "4",
          "y1": "12",
          "x2": "20",
          "y2": "12"
        }
      ]
    ]
  },
  {
    "id": "alert",
    "labelZh": "感叹号",
    "labelEn": "Alert",
    "categoryId": "other",
    "nodes": [
      [
        "path",
        {
          "d": "M10.3 3.7 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"
        }
      ],
      [
        "line",
        {
          "x1": "12",
          "y1": "9",
          "x2": "12",
          "y2": "13"
        }
      ],
      [
        "line",
        {
          "x1": "12",
          "y1": "17",
          "x2": "12.01",
          "y2": "17"
        }
      ]
    ]
  },
  {
    "id": "smile",
    "labelZh": "笑脸",
    "labelEn": "Smile",
    "categoryId": "other",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10"
        }
      ],
      [
        "circle",
        {
          "cx": "8.5",
          "cy": "10",
          "r": "1",
          "fill": "currentColor"
        }
      ],
      [
        "circle",
        {
          "cx": "15.5",
          "cy": "10",
          "r": "1",
          "fill": "currentColor"
        }
      ],
      [
        "path",
        {
          "d": "M7.5 14s1.7 3 4.5 3 4.5-3 4.5-3"
        }
      ]
    ]
  },
  {
    "id": "love-face",
    "labelZh": "爱心笑脸",
    "labelEn": "Love face",
    "categoryId": "other",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10"
        }
      ],
      [
        "path",
        {
          "d": "M6.5 9c1-2 3-1 3 .5 0 1.5-3 3-3 3s-3-1.5-3-3c0-1 .7-1.8 1.5-1.8.7 0 1.2.4 1.5 1.3ZM17.5 9c1-2 3-1 3 .5 0 1.5-3 3-3 3s-3-1.5-3-3c0-1 .7-1.8 1.5-1.8.7 0 1.2.4 1.5 1.3Z"
        }
      ],
      [
        "path",
        {
          "d": "M8 16s1.5 2 4 2 4-2 4-2"
        }
      ]
    ]
  },
  {
    "id": "angel-face",
    "labelZh": "天使脸",
    "labelEn": "Angel face",
    "categoryId": "other",
    "nodes": [
      [
        "ellipse",
        {
          "cx": "12",
          "cy": "3.5",
          "rx": "5",
          "ry": "2"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "13",
          "r": "8"
        }
      ],
      [
        "line",
        {
          "x1": "9",
          "y1": "11",
          "x2": "9.01",
          "y2": "11"
        }
      ],
      [
        "line",
        {
          "x1": "15",
          "y1": "11",
          "x2": "15.01",
          "y2": "11"
        }
      ],
      [
        "path",
        {
          "d": "M9 16s1 1 3 1 3-1 3-1"
        }
      ]
    ]
  },
  {
    "id": "devil-face",
    "labelZh": "恶魔脸",
    "labelEn": "Devil face",
    "categoryId": "other",
    "nodes": [
      [
        "path",
        {
          "d": "M4 4c0 4 3 5 3 5M20 4c0 4-3 5-3 5"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "13",
          "r": "8"
        }
      ],
      [
        "path",
        {
          "d": "m8 12 2-1M16 12l-2-1"
        }
      ],
      [
        "path",
        {
          "d": "M9 16c2 1 4 1 6 0"
        }
      ]
    ]
  },
  {
    "id": "neutral-face",
    "labelZh": "平静脸",
    "labelEn": "Neutral face",
    "categoryId": "other",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10"
        }
      ],
      [
        "line",
        {
          "x1": "8",
          "y1": "10",
          "x2": "8.01",
          "y2": "10"
        }
      ],
      [
        "line",
        {
          "x1": "16",
          "y1": "10",
          "x2": "16.01",
          "y2": "10"
        }
      ],
      [
        "line",
        {
          "x1": "8",
          "y1": "16",
          "x2": "16",
          "y2": "16"
        }
      ]
    ]
  },
  {
    "id": "surprised-face",
    "labelZh": "惊讶脸",
    "labelEn": "Surprised face",
    "categoryId": "other",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10"
        }
      ],
      [
        "circle",
        {
          "cx": "8.5",
          "cy": "9.5",
          "r": "1"
        }
      ],
      [
        "circle",
        {
          "cx": "15.5",
          "cy": "9.5",
          "r": "1"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "16",
          "r": "2"
        }
      ]
    ]
  },
  {
    "id": "sad-face",
    "labelZh": "难过脸",
    "labelEn": "Sad face",
    "categoryId": "other",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10"
        }
      ],
      [
        "line",
        {
          "x1": "8.5",
          "y1": "10",
          "x2": "8.51",
          "y2": "10"
        }
      ],
      [
        "line",
        {
          "x1": "15.5",
          "y1": "10",
          "x2": "15.51",
          "y2": "10"
        }
      ],
      [
        "path",
        {
          "d": "M8 17s1.5-3 4-3 4 3 4 3"
        }
      ]
    ]
  },
  {
    "id": "crying-face",
    "labelZh": "哭脸",
    "labelEn": "Crying face",
    "categoryId": "other",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10"
        }
      ],
      [
        "path",
        {
          "d": "m7 9 3-1M17 9l-3-1"
        }
      ],
      [
        "path",
        {
          "d": "M8 17s1.5-3 4-3 4 3 4 3"
        }
      ],
      [
        "path",
        {
          "d": "M6.5 11c0 2-1 2-1 4"
        }
      ],
      [
        "path",
        {
          "d": "M18.5 11c0 2 1 2 1 4"
        }
      ]
    ]
  },
  {
    "id": "tear-face",
    "labelZh": "泪眼脸",
    "labelEn": "Tearful face",
    "categoryId": "other",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10"
        }
      ],
      [
        "circle",
        {
          "cx": "8.5",
          "cy": "10",
          "r": "1"
        }
      ],
      [
        "circle",
        {
          "cx": "15.5",
          "cy": "10",
          "r": "1"
        }
      ],
      [
        "path",
        {
          "d": "M9 17c1.5-1 4.5-1 6 0"
        }
      ],
      [
        "path",
        {
          "d": "M17 12c2 2 2 3 0 4-2-1-2-2 0-4Z",
          "fill": "currentColor"
        }
      ]
    ]
  }
]);

const ICON_BY_ID = new Map(MARKER_ICONS.map((icon) => [icon.id, icon]));
const LEGACY_ICON_ALIASES = Object.freeze({ place: 'pin', park: 'picnic' });

export const MARKER_ICON_IDS = new Set([
  ...MARKER_ICONS.map((icon) => icon.id),
  ...Object.keys(LEGACY_ICON_ALIASES),
]);

export function getMarkerIcon(id) {
  const resolvedId = LEGACY_ICON_ALIASES[id] ?? id;
  return ICON_BY_ID.get(resolvedId) ?? ICON_BY_ID.get('pin');
}
