// Demo Klub seed (T-027). Every document has a fixed ObjectId derived from a stable key, so
// re-running replaces instead of duplicating, and the e2e seed produces the same ids every run.
import { createHash } from "node:crypto";

import { hash } from "@node-rs/argon2";
import mongoose, { Types, type Model } from "mongoose";

import {
  Bar,
  Category,
  Counter,
  FeeRule,
  Item,
  Order,
  Promo,
  QrCode,
  User,
  Venue,
  VenueMember,
  Zone,
  type OrderStatus,
} from "./models";

/** Deterministic ObjectId for a seed key, e.g. seedId("venue:demo"). */
export function seedId(key: string): Types.ObjectId {
  return new Types.ObjectId(
    createHash("sha256").update(`seed:${key}`).digest("hex").slice(0, 24),
  );
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1";
}

/**
 * Allowlist, not a denylist: seeding runs only against a local server or a database whose name
 * ends in "_dev"/"-dev" or "_test"/"-test". Checked on the URI before connecting and again on the
 * open connection in seedDemo().
 */
function assertSeedableTarget(hosts: string[], dbName: string): void {
  const isLocal = hosts.length > 0 && hosts.every(isLocalHost);
  if (!isLocal && !/[_-](dev|test)$/.test(dbName)) {
    throw new Error(
      `Refusing to seed: MONGODB_URI must point to localhost or a database whose name ends in "_dev" or "_test" (got hosts "${hosts.join(",")}", database "${dbName}").`,
    );
  }
}

/** Returns the database name it checked; pass it to mongoose.connect as dbName. */
export function assertSeedableUri(uri: string): string {
  // A fragment is dropped by the driver but would be read as part of the name here.
  if (uri.includes("#")) {
    throw new Error("Refusing to seed: MONGODB_URI must not contain '#'.");
  }
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)\/?([^?]*)/.exec(
    uri,
  );
  const hosts = (match?.[1] ?? "")
    .split(",")
    .filter(Boolean)
    .map((host) => host.replace(/:\d+$/, "").toLowerCase());
  const dbName = decodeURIComponent(match?.[2] ?? "");
  assertSeedableTarget(hosts, dbName.toLowerCase());
  return dbName;
}

// Club tablet sign-in PINs (name + PIN), exported for e2e tests.
export const demoPins = {
  owner: "1001",
  manager: "2002",
  bartender1: "3003",
  bartender2: "3004",
  vipHost: "4005",
} as const;

// Same argon2id hash as @namitiszunk/auth hashPin (db cannot import auth: auth depends on db).
function hashPin(pin: string): Promise<string> {
  return hash(pin);
}

// shortcut: fixed 06:00 Europe/Budapest business-day start; switch to the T-024 helper once it exists.
function businessDateOf(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Budapest",
  }).format(new Date(now.getTime() - 6 * 3_600_000));
}

type Fields = Record<string, unknown> & { _id: Types.ObjectId };

async function upsert<T>(model: Model<T>, docs: Fields[]): Promise<void> {
  const now = new Date();
  const ops = await Promise.all(
    docs.map(async (fields) => {
      const doc = new model(fields);
      await doc.validate();
      return {
        replaceOne: {
          filter: { _id: fields._id },
          replacement: {
            createdAt: now,
            updatedAt: now,
            ...doc.toObject(),
          },
          upsert: true,
        },
      };
    }),
  );
  await model.bulkWrite(ops as Parameters<Model<T>["bulkWrite"]>[0], {
    timestamps: false,
  });
}

const venueId = seedId("venue:demo");
const mainBarId = seedId("bar:main");
const terraceBarId = seedId("bar:terrace");

const zones = [
  { key: "dancefloor", name: "Tánctér", barId: mainBarId, type: "bar_area" },
  { key: "gallery", name: "Galéria", barId: mainBarId, type: "bar_area" },
  { key: "terrace", name: "Terasz", barId: terraceBarId, type: "bar_area" },
  { key: "vip-1", name: "VIP 1", barId: mainBarId, type: "vip_table" },
  { key: "vip-2", name: "VIP 2", barId: mainBarId, type: "vip_table" },
] as const;

type Modifier = { name: string; nameEn: string; priceDeltaHuf: number };
type Group = {
  name: string;
  nameEn: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  modifiers: Modifier[];
};
// [name, English name or undefined, price in forints]
type ItemRow = [string, string | undefined, number];

const mod = (name: string, nameEn: string, priceDeltaHuf = 0): Modifier => ({
  name,
  nameEn,
  priceDeltaHuf,
});

const categories: {
  key: string;
  name: string;
  nameEn: string;
  vipOnly?: boolean;
  group?: Group;
  items: ItemRow[];
}[] = [
  {
    key: "beer",
    name: "Sörök",
    nameEn: "Beers",
    group: {
      name: "Méret",
      nameEn: "Size",
      required: true,
      minSelect: 1,
      maxSelect: 1,
      modifiers: [mod("0,3 l", "0.3 l"), mod("0,5 l", "0.5 l", 400)],
    },
    items: [
      ["Dreher Classic", undefined, 990],
      ["Soproni Óvatos Duhaj", undefined, 1190],
      ["Csapolt IPA", "Draft IPA", 1490],
      ["Búzasör", "Wheat beer", 1290],
      ["Alkoholmentes sör", "Alcohol-free beer", 890],
      ["Meggyes sör", "Cherry beer", 1090],
      ["Almabor", "Cider", 1190],
    ],
  },
  {
    key: "cocktails",
    name: "Koktélok",
    nameEn: "Cocktails",
    group: {
      name: "Extra",
      nameEn: "Extras",
      required: false,
      minSelect: 0,
      maxSelect: 2,
      modifiers: [
        mod("Dupla alap", "Double shot", 900),
        mod("Cukormentes", "Sugar-free"),
      ],
    },
    items: [
      ["Mojito", undefined, 2490],
      ["Aperol Spritz", undefined, 2690],
      ["Gin tonik", "Gin and tonic", 2490],
      ["Cuba Libre", undefined, 2290],
      ["Long Island Ice Tea", undefined, 3290],
      ["Pornstar Martini", undefined, 2990],
      ["Espresso Martini", undefined, 2890],
      ["Margarita", undefined, 2690],
    ],
  },
  {
    key: "shots",
    name: "Röviditalok",
    nameEn: "Shots",
    group: {
      name: "Jég",
      nameEn: "Ice",
      required: false,
      minSelect: 0,
      maxSelect: 1,
      modifiers: [mod("Jéggel", "With ice"), mod("Jég nélkül", "No ice")],
    },
    items: [
      ["Jägermeister", undefined, 990],
      ["Unicum", undefined, 990],
      ["Szilvapálinka", "Plum pálinka", 1290],
      ["Tequila", undefined, 1090],
      ["Vodka", undefined, 890],
      ["Rum", undefined, 990],
      ["Whisky", undefined, 1290],
    ],
  },
  {
    key: "wine",
    name: "Borok és pezsgők",
    nameEn: "Wine and sparkling",
    items: [
      ["Kisfröccs", "Small spritzer", 690],
      ["Nagyfröccs", "Large spritzer", 1090],
      ["Fehérbor (pohár)", "White wine (glass)", 1290],
      ["Vörösbor (pohár)", "Red wine (glass)", 1390],
      ["Rozé (pohár)", "Rosé (glass)", 1290],
      ["Prosecco (pohár)", "Prosecco (glass)", 1590],
    ],
  },
  {
    key: "soft",
    name: "Üdítők",
    nameEn: "Soft drinks",
    items: [
      ["Coca-Cola", undefined, 690],
      ["Coca-Cola Zero", undefined, 690],
      ["Ásványvíz", "Mineral water", 590],
      ["Narancslé", "Orange juice", 790],
      ["Red Bull", undefined, 1190],
      ["Tonik", "Tonic water", 690],
      ["Házi limonádé", "Homemade lemonade", 1290],
    ],
  },
  {
    key: "vip",
    name: "VIP palackok",
    nameEn: "VIP bottles",
    vipOnly: true,
    group: {
      name: "Mixer",
      nameEn: "Mixer",
      required: true,
      minSelect: 1,
      maxSelect: 2,
      modifiers: [
        mod("Tonik", "Tonic"),
        mod("Kóla", "Cola"),
        mod("Narancslé", "Orange juice"),
        mod("Red Bull (4 db)", "Red Bull (4 cans)", 4000),
      ],
    },
    items: [
      ["Absolut Vodka 0,7 l", "Absolut Vodka 0.7 l", 34900],
      ["Bombay Sapphire 0,7 l", "Bombay Sapphire 0.7 l", 39900],
      ["Jack Daniel's 0,7 l", "Jack Daniel's 0.7 l", 42900],
      ["Grey Goose 0,7 l", "Grey Goose 0.7 l", 49900],
      ["Don Julio Blanco 0,7 l", "Don Julio Blanco 0.7 l", 54900],
      ["Moët & Chandon 0,75 l", "Moët & Chandon 0.75 l", 59900],
    ],
  },
];

const items = categories.flatMap((category) =>
  category.items.map(([name, nameEn, priceHuf], index) => ({
    _id: seedId(`item:${name}`),
    venueId,
    categoryId: seedId(`category:${category.key}`),
    name,
    nameEn,
    priceHuf,
    vatRate: 27,
    sortOrder: index,
    vipOnly: category.vipOnly ?? false,
    // Subdocument ids are fixed too, so e2e tests can pick an option by id.
    modifierGroups: category.group
      ? [
          {
            ...category.group,
            _id: seedId(`group:${name}`),
            modifiers: category.group.modifiers.map((m) => ({
              ...m,
              _id: seedId(`modifier:${name}:${m.name}`),
            })),
          },
        ]
      : [],
  })),
);

/** One order line: item name, quantity, chosen modifier names (Hungarian). */
function line(itemName: string, quantity: number, optionNames: string[] = []) {
  const item = items.find((candidate) => candidate.name === itemName);
  if (!item) throw new Error(`Unknown seed item ${itemName}`);
  const options = optionNames.map((optionName) => {
    const group = item.modifierGroups.find((g) =>
      g.modifiers.some((m) => m.name === optionName),
    );
    const modifier = group?.modifiers.find((m) => m.name === optionName);
    if (!group || !modifier)
      throw new Error(`Unknown option ${optionName} on ${itemName}`);
    return {
      groupName: group.name,
      name: modifier.name,
      priceDeltaHuf: modifier.priceDeltaHuf,
    };
  });
  const unitWithOptions =
    item.priceHuf + options.reduce((sum, o) => sum + o.priceDeltaHuf, 0);
  return {
    itemId: item._id,
    name: item.name,
    nameEn: item.nameEn,
    unitPriceHuf: item.priceHuf,
    quantity,
    options,
    lineTotalHuf: unitWithOptions * quantity,
  };
}

type SeedOrder = {
  status: OrderStatus;
  barId: Types.ObjectId;
  zoneKey: (typeof zones)[number]["key"];
  lines: ReturnType<typeof line>[];
  minutesAgo: number;
  tipHuf?: number;
  promoCode?: string;
  extra?: Record<string, unknown>;
};

const welcomeDiscountHuf = 500;

const seedOrders: SeedOrder[] = [
  {
    status: "awaiting_payment",
    barId: mainBarId,
    zoneKey: "dancefloor",
    lines: [line("Mojito", 2)],
    minutesAgo: 2,
  },
  {
    status: "new",
    barId: mainBarId,
    zoneKey: "dancefloor",
    lines: [line("Dreher Classic", 2, ["0,5 l"]), line("Unicum", 2)],
    minutesAgo: 4,
    tipHuf: 300,
  },
  {
    status: "preparing",
    barId: mainBarId,
    zoneKey: "gallery",
    lines: [line("Aperol Spritz", 1), line("Gin tonik", 1, ["Dupla alap"])],
    minutesAgo: 8,
  },
  {
    status: "ready",
    barId: terraceBarId,
    zoneKey: "terrace",
    lines: [line("Csapolt IPA", 3, ["0,3 l"])],
    minutesAgo: 12,
  },
  {
    status: "picked_up",
    barId: terraceBarId,
    zoneKey: "terrace",
    // 3860 Ft: above WELCOME500's 3000 Ft minimum.
    lines: [line("Nagyfröccs", 3), line("Ásványvíz", 1)],
    minutesAgo: 40,
    promoCode: "WELCOME500",
  },
  {
    status: "cancelled",
    barId: mainBarId,
    zoneKey: "dancefloor",
    lines: [line("Tequila", 4, ["Jég nélkül"])],
    minutesAgo: 50,
  },
  {
    status: "rejected",
    barId: mainBarId,
    zoneKey: "gallery",
    lines: [line("Pornstar Martini", 2)],
    minutesAgo: 55,
    extra: { rejectionReason: "Elfogyott a maracuja" },
  },
  {
    status: "expired",
    barId: terraceBarId,
    zoneKey: "terrace",
    lines: [line("Red Bull", 1), line("Vodka", 1)],
    minutesAgo: 90,
  },
  {
    status: "refunded",
    barId: mainBarId,
    zoneKey: "dancefloor",
    lines: [line("Long Island Ice Tea", 1)],
    minutesAgo: 100,
  },
  {
    status: "preparing",
    barId: mainBarId,
    zoneKey: "vip-1",
    lines: [line("Grey Goose 0,7 l", 1, ["Tonik", "Red Bull (4 db)"])],
    minutesAgo: 6,
    tipHuf: 5000,
    extra: { isVip: true },
  },
];

const minutes = (n: number) => n * 60_000;

function buildOrder(order: SeedOrder, index: number, now: Date): Fields {
  const createdAt = new Date(now.getTime() - minutes(order.minutesAgo));
  const at = (offset: number) =>
    new Date(createdAt.getTime() + minutes(offset));
  const paid = !["awaiting_payment", "cancelled"].includes(order.status);
  const accepted = ["preparing", "ready", "picked_up", "expired"].includes(
    order.status,
  );
  const ready = ["ready", "picked_up", "expired"].includes(order.status);
  const subtotalHuf = order.lines.reduce((sum, l) => sum + l.lineTotalHuf, 0);
  const discountHuf = order.promoCode ? welcomeDiscountHuf : 0;
  const tipHuf = order.tipHuf ?? 0;
  const key = `order:${index + 1}`;
  return {
    _id: seedId(key),
    venueId,
    barId: order.barId,
    zoneId: seedId(`zone:${order.zoneKey}`),
    // shortcut: plain sequential numbers; T-024 allocates them through Counter in production.
    shortNumber: index + 1,
    // From the order's own time: an order placed before 06:00 belongs to the previous business day.
    businessDate: businessDateOf(createdAt),
    status: order.status,
    items: order.lines.map((l, lineIndex) => ({
      ...l,
      _id: seedId(`${key}:line:${lineIndex}`),
      options: l.options.map((o) => ({
        ...o,
        _id: seedId(`${key}:line:${lineIndex}:${o.name}`),
      })),
    })),
    subtotalHuf,
    serviceFeeHuf: 0,
    tipHuf,
    discountHuf,
    totalHuf: subtotalHuf + tipHuf - discountHuf,
    promoId: order.promoCode ? seedId(`promo:${order.promoCode}`) : undefined,
    pickupCode: `D${String(index + 1).padStart(2, "0")}`,
    guestTokenHash: createHash("sha256").update(key).digest("hex"),
    acceptedTermsVersion: "2026-11-01",
    paidAt: paid ? at(1) : undefined,
    acceptedAt: accepted ? at(2) : undefined,
    readyAt: ready ? at(5) : undefined,
    pickedUpAt: order.status === "picked_up" ? at(8) : undefined,
    createdAt,
    updatedAt: now,
    ...order.extra,
  };
}

/** Writes the Demo Klub into the current mongoose connection; safe to run any number of times. */
export async function seedDemo(now = new Date()): Promise<void> {
  // Re-checked on the open connection, so a caller that skipped assertSeedableUri is still stopped.
  assertSeedableTarget(
    [mongoose.connection.host.toLowerCase()],
    mongoose.connection.name.toLowerCase(),
  );
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );

  await upsert(FeeRule, [
    {
      _id: seedId("fee:platform"),
      commissionBps: 300,
      validFrom: new Date("2026-01-01T00:00:00Z"),
    },
    {
      _id: seedId("fee:demo"),
      venueId,
      commissionBps: 100,
      validFrom: new Date("2026-01-01T00:00:00Z"),
    },
  ]);

  await upsert(Venue, [
    {
      _id: venueId,
      slug: "demo",
      name: "Demo Klub",
      address: {
        street: "Király utca 1.",
        city: "Budapest",
        postalCode: "1061",
      },
      company: { name: "Demo Klub Kft." },
      status: "active",
    },
  ]);

  await upsert(Bar, [
    { _id: mainBarId, venueId, name: "Főpult", isOpen: true },
    { _id: terraceBarId, venueId, name: "Terasz pult", isOpen: true },
  ]);

  await upsert(
    Zone,
    zones.map((zone) => ({
      _id: seedId(`zone:${zone.key}`),
      venueId,
      barId: zone.barId,
      name: zone.name,
      type: zone.type,
    })),
  );

  await upsert(
    QrCode,
    zones.map((zone) => ({
      _id: seedId(`qr:${zone.key}`),
      venueId,
      barId: zone.barId,
      zoneId: seedId(`zone:${zone.key}`),
      code: `demo-${zone.key}`,
    })),
  );

  await upsert(
    Category,
    categories.map((category, index) => ({
      _id: seedId(`category:${category.key}`),
      venueId,
      name: category.name,
      nameEn: category.nameEn,
      sortOrder: index,
    })),
  );
  await upsert(Item, items);

  // Owner and manager sign in with email (credentials arrive with Better Auth, T-030).
  await upsert(User, [
    {
      _id: seedId("user:owner"),
      email: "owner@demo.namitiszunk.hu",
      name: "Kovács Anna",
    },
    {
      _id: seedId("user:manager"),
      email: "manager@demo.namitiszunk.hu",
      name: "Nagy Péter",
    },
  ]);
  const staff = [
    { key: "owner", role: "owner", displayName: "Anna", user: "owner" },
    { key: "manager", role: "manager", displayName: "Péter", user: "manager" },
    { key: "bartender1", role: "bartender", displayName: "Bence" },
    { key: "bartender2", role: "bartender", displayName: "Dóra" },
    { key: "vipHost", role: "vip_host", displayName: "Lili" },
  ] as const;
  await upsert(
    VenueMember,
    await Promise.all(
      staff.map(async (member) => ({
        _id: seedId(`member:${member.key}`),
        venueId,
        userId: "user" in member ? seedId(`user:${member.user}`) : undefined,
        role: member.role,
        displayName: member.displayName,
        pinHash: await hashPin(demoPins[member.key]),
      })),
    ),
  );

  await upsert(Promo, [
    {
      _id: seedId("promo:DEMO10"),
      venueId,
      code: "DEMO10",
      type: "percent",
      value: 1000,
    },
    {
      _id: seedId("promo:WELCOME500"),
      venueId,
      code: "WELCOME500",
      type: "fixed",
      value: welcomeDiscountHuf,
      minOrderHuf: 3000,
      usedCount: 1,
    },
    {
      _id: seedId("promo:EXPIRED"),
      venueId,
      code: "EXPIRED",
      type: "percent",
      value: 2000,
      validTo: new Date("2026-01-31T23:00:00Z"),
      isActive: false,
    },
  ]);

  const orders = seedOrders.map((order, index) =>
    buildOrder(order, index, now),
  );
  await upsert(Order, orders);
  // Keeps T-024's sequence past the seeded short numbers on each business day they landed on.
  const maxShortNumber = new Map<string, number>();
  for (const order of orders) {
    const date = order.businessDate as string;
    const shortNumber = order.shortNumber as number;
    maxShortNumber.set(
      date,
      Math.max(maxShortNumber.get(date) ?? 0, shortNumber),
    );
  }
  await Promise.all(
    [...maxShortNumber].map(([businessDate, seq]) =>
      Counter.updateOne(
        { venueId, businessDate },
        {
          $max: { seq },
          $setOnInsert: { _id: seedId(`counter:${businessDate}`) },
        },
        { upsert: true },
      ),
    ),
  );
}
