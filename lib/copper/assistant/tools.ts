// Module 2: the four tools Ask Copper can use. Products and prices come from
// lib/copper/catalog.ts and stock from lib/copper/inventory.ts, so the
// chatbot never has to make them up.
// The contract for each tool is in specs/module-2/spec.md.
import { tool } from "ai";
import { z } from "zod";
import { getPlans, getProducts } from "@/lib/copper/catalog";
import type { Plan, ProductId } from "@/lib/copper/catalog";
import { readInventory } from "@/lib/copper/inventory";

export type ProductList = {
  products: {
    id: ProductId;
    name: string;
    type: string;
    priceUsd: number;
    colors: string[];
  }[];
};

export type Prices = {
  products: { id: ProductId; name: string; priceUsd: number }[];
  plans: {
    id: Plan["id"];
    name: string;
    monthlyUsd: number;
    annualUsd: number;
  }[];
};

export type CalculateCostInput = {
  products: ProductId[];
  plan: Plan["id"];
  billing: "monthly" | "annual";
  years: number;
};

export type CostBreakdown = {
  lines: { item: string; usd: number }[];
  totalUsd: number;
};

export type CheckAvailabilityInput = { product: ProductId; color?: string };

export type Stock = "in_stock" | "low_stock" | "backordered";

export type Availability =
  | {
      status: "ok";
      product: string;
      colors: { color: string; stock: Stock; restockDate: string | null }[];
    }
  | { status: "not_a_color"; product: string; color: string; colors: string[] }
  | { status: "unavailable"; message: string };

const PRODUCT_IDS = ["copper-home", "copper-notes"] as const;

const roundCents = (amount: number) => Math.round(amount * 100) / 100;

/** get_products: what Copper sells and which colors each one comes in. */
export function listProducts(): ProductList {
  return {
    products: getProducts().map(({ id, name, type, priceUsd, colors }) => ({
      id,
      name,
      type,
      priceUsd,
      colors,
    })),
  };
}

/** get_prices: every product and plan price, read from the catalog. */
export function getPrices(): Prices {
  return {
    products: getProducts().map(({ id, name, priceUsd }) => ({
      id,
      name,
      priceUsd,
    })),
    plans: getPlans().map(({ id, name, monthlyUsd, annualUsd }) => ({
      id,
      name,
      monthlyUsd,
      annualUsd,
    })),
  };
}

export const calculateCostInput: z.ZodType<CalculateCostInput> = z.object({
  products: z.array(z.enum(PRODUCT_IDS)).max(5),
  plan: z.enum(["free", "copper-plus"]),
  billing: z.enum(["monthly", "annual"]),
  years: z.number().int().min(1).max(5),
});

/** calculate_cost: the total cost of devices plus a plan over some years. */
export function calculateCost(input: CalculateCostInput): CostBreakdown {
  const products = getProducts();
  const lines: CostBreakdown["lines"] = [];

  for (const id of input.products) {
    const product = products.find((p) => p.id === id);
    if (product)
      lines.push({ item: product.name, usd: roundCents(product.priceUsd) });
  }

  // Copper Plus covers the whole household, so it's one line however many devices.
  const plan = getPlans().find((p) => p.id === input.plan);
  if (plan && plan.id !== "free") {
    const usd =
      input.billing === "monthly"
        ? plan.monthlyUsd * 12 * input.years
        : plan.annualUsd * input.years;
    lines.push({
      item: `${plan.name}, ${input.billing}, ${input.years} ${input.years === 1 ? "year" : "years"}`,
      usd: roundCents(usd),
    });
  }

  return {
    lines,
    totalUsd: roundCents(lines.reduce((sum, line) => sum + line.usd, 0)),
  };
}

export const checkAvailabilityInput: z.ZodType<CheckAvailabilityInput> =
  z.object({
    product: z.enum(PRODUCT_IDS),
    color: z.string().optional(),
  });

function stockOf(units: number): Stock {
  if (units <= 0) return "backordered";
  return units < 10 ? "low_stock" : "in_stock";
}

/** check_availability: stock for one product (or one of its colors), read fresh each time. */
export async function checkAvailability(
  input: CheckAvailabilityInput,
): Promise<Availability> {
  const product = getProducts().find((p) => p.id === input.product);
  if (!product) {
    return {
      status: "unavailable",
      message: "That product isn't one Copper sells.",
    };
  }

  // Check the color against the catalog first: a color the product doesn't
  // come in is "not_a_color" even when stock can't be read.
  const wanted = input.color?.trim().toLowerCase();
  const colors =
    wanted === undefined
      ? product.colors
      : product.colors.filter((c) => c.toLowerCase() === wanted);
  if (wanted !== undefined && colors.length === 0) {
    return {
      status: "not_a_color",
      product: product.name,
      color: input.color ?? "",
      colors: product.colors,
    };
  }

  const rows = await readInventory();
  if (rows === null) {
    return {
      status: "unavailable",
      message: "Stock can't be checked right now. Please try again later.",
    };
  }

  const result: { color: string; stock: Stock; restockDate: string | null }[] =
    [];
  for (const color of colors) {
    const row = rows.find(
      (r) =>
        r.product === product.name &&
        r.color.toLowerCase() === color.toLowerCase(),
    );
    if (!row) continue;
    const stock = stockOf(row.units_in_stock);
    result.push({
      color,
      stock,
      restockDate: stock === "backordered" ? row.next_shipment : null,
    });
  }
  return { status: "ok", product: product.name, colors: result };
}

export const copperTools = {
  get_products: tool({
    description:
      "List every Copper product with its type, price and the colors it comes in; use it for what Copper sells and which colors exist, not for stock.",
    inputSchema: z.object({}),
    execute: async () => listProducts(),
  }),
  get_prices: tool({
    description:
      "Get the current price of every Copper product and the monthly and yearly price of every plan.",
    inputSchema: z.object({}),
    execute: async () => getPrices(),
  }),
  calculate_cost: tool({
    description:
      "Work out the total cost of up to 5 devices plus a plan over 1 to 5 years; Copper Plus is counted once for the whole household.",
    inputSchema: calculateCostInput,
    execute: async (input) => calculateCost(input),
  }),
  check_availability: tool({
    description:
      "Check today's stock for a Copper product, for one color or every color; use it for whether a color is on the shelf, not for which colors exist.",
    inputSchema: checkAvailabilityInput,
    execute: async (input) => checkAvailability(input),
  }),
};
