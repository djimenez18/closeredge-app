/**
 * CloserEdge AI — Stripe Product & Price Setup
 *
 * Run once to initialize all Stripe products, prices, and metadata.
 * Idempotent: checks for existing products by metadata before creating.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_xxx npx tsx scripts/stripe-setup.ts
 *
 * Output:
 *   Writes scripts/stripe-products.json with all product/price IDs.
 */

import Stripe from "stripe";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentType =
  | "eden"
  | "crest"
  | "lexis"
  | "haven"
  | "forge"
  | "nora";

type TierName = "foundation" | "pro" | "elite";

interface TierPricing {
  monthly: number; // dollars per month
  setup: number; // one-time dollars
}

interface AgentDefinition {
  key: AgentType;
  name: string;
  description: string;
  tiers: Record<TierName, TierPricing>;
}

interface AddOnDefinition {
  key: string;
  name: string;
  description: string;
  monthlyPrice: number; // dollars per month
}

interface PriceIds {
  foundation_monthly: string;
  foundation_setup: string;
  pro_monthly: string;
  pro_setup: string;
  elite_monthly: string;
  elite_setup: string;
}

interface ProductEntry {
  product_id: string;
  prices: PriceIds;
}

interface AddOnEntry {
  product_id: string;
  price_id: string;
}

interface StripeProductsOutput {
  products: Record<AgentType, ProductEntry>;
  addons: Record<string, AddOnEntry>;
}

// ---------------------------------------------------------------------------
// Pricing Matrix
// ---------------------------------------------------------------------------

const AGENTS: AgentDefinition[] = [
  {
    key: "eden",
    name: "Eden",
    description:
      "CloserEdge AI residential real estate agent — lead capture, nurture, and transaction coordination.",
    tiers: {
      foundation: { monthly: 300, setup: 750 },
      pro: { monthly: 500, setup: 1500 },
      elite: { monthly: 750, setup: 2500 },
    },
  },
  {
    key: "crest",
    name: "Crest",
    description:
      "CloserEdge AI commercial real estate agent — tenant screening, lease management, and deal flow.",
    tiers: {
      foundation: { monthly: 500, setup: 1500 },
      pro: { monthly: 800, setup: 2500 },
      elite: { monthly: 1200, setup: 4000 },
    },
  },
  {
    key: "lexis",
    name: "Lexis",
    description:
      "CloserEdge AI law office agent — intake automation, case management, and client communication.",
    tiers: {
      foundation: { monthly: 500, setup: 1500 },
      pro: { monthly: 800, setup: 2500 },
      elite: { monthly: 1200, setup: 4000 },
    },
  },
  {
    key: "haven",
    name: "Haven",
    description:
      "CloserEdge AI medical/dental practice agent — patient scheduling, follow-ups, and review management.",
    tiers: {
      foundation: { monthly: 500, setup: 1500 },
      pro: { monthly: 750, setup: 2500 },
      elite: { monthly: 1000, setup: 4000 },
    },
  },
  {
    key: "forge",
    name: "Forge",
    description:
      "CloserEdge AI home services contractor agent — lead routing, job scheduling, and customer follow-up.",
    tiers: {
      foundation: { monthly: 300, setup: 750 },
      pro: { monthly: 500, setup: 1500 },
      elite: { monthly: 700, setup: 2500 },
    },
  },
  {
    key: "nora",
    name: "Nora",
    description:
      "CloserEdge AI property management agent — tenant communication, maintenance coordination, and lease tracking. Overage: $2/unit/mo.",
    tiers: {
      foundation: { monthly: 250, setup: 750 },
      pro: { monthly: 400, setup: 1500 },
      elite: { monthly: 600, setup: 2500 },
    },
  },
];

const ADDONS: AddOnDefinition[] = [
  {
    key: "voice",
    name: "Call Your Agent (Voice)",
    description: "Inbound/outbound voice calling powered by AI.",
    monthlyPrice: 75,
  },
  {
    key: "mentor",
    name: "Mentor Layer",
    description:
      "Strategic coaching layer that monitors agent performance and suggests optimizations.",
    monthlyPrice: 50,
  },
  {
    key: "mls_data",
    name: "MLS Data Connection",
    description: "Live MLS data feed integration for property search and listing updates.",
    monthlyPrice: 50,
  },
  {
    key: "social_media",
    name: "Social Media Autopilot",
    description: "Automated social media posting and engagement across platforms.",
    monthlyPrice: 50,
  },
  {
    key: "seasonal_campaigns",
    name: "Seasonal Campaigns",
    description: "Pre-built seasonal marketing campaigns with automated scheduling.",
    monthlyPrice: 50,
  },
  {
    key: "review_automation",
    name: "Review Automation",
    description: "Automated review solicitation and response management.",
    monthlyPrice: 25,
  },
  {
    key: "investor_reporting",
    name: "Investor Reporting",
    description: "Automated investor reports with portfolio performance dashboards.",
    monthlyPrice: 75,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Search for an existing Stripe product by its `closeredge_key` metadata.
 * Returns the product if found, null otherwise.
 */
async function findExistingProduct(
  stripe: Stripe,
  metadataKey: string,
): Promise<Stripe.Product | null> {
  // Stripe doesn't support metadata filtering on list, so we search by name
  // and then verify metadata. We keep the search narrow by using active-only.
  const products = await stripe.products.list({ limit: 100, active: true });
  for (const product of products.data) {
    if (product.metadata.closeredge_key === metadataKey) {
      return product;
    }
  }
  // If there are more pages, paginate
  let hasMore = products.has_more;
  let startingAfter = products.data[products.data.length - 1]?.id;
  while (hasMore && startingAfter) {
    const page = await stripe.products.list({
      limit: 100,
      active: true,
      starting_after: startingAfter,
    });
    for (const product of page.data) {
      if (product.metadata.closeredge_key === metadataKey) {
        return product;
      }
    }
    hasMore = page.has_more;
    startingAfter = page.data[page.data.length - 1]?.id;
  }
  return null;
}

/**
 * Find an existing price for a product matching the given lookup_key.
 */
async function findExistingPrice(
  stripe: Stripe,
  lookupKey: string,
): Promise<Stripe.Price | null> {
  const prices = await stripe.prices.list({
    lookup_keys: [lookupKey],
    limit: 1,
  });
  return prices.data[0] ?? null;
}

/**
 * Create a recurring monthly price, or return existing one by lookup_key.
 */
async function ensureMonthlyPrice(
  stripe: Stripe,
  productId: string,
  amountDollars: number,
  lookupKey: string,
  nickname: string,
): Promise<Stripe.Price> {
  const existing = await findExistingPrice(stripe, lookupKey);
  if (existing) {
    console.log(`  [exists] Price ${lookupKey} -> ${existing.id}`);
    return existing;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: dollarsToCents(amountDollars),
    currency: "usd",
    recurring: { interval: "month" },
    lookup_key: lookupKey,
    nickname,
    metadata: { closeredge_lookup: lookupKey },
  });
  console.log(`  [created] Price ${lookupKey} -> ${price.id} ($${amountDollars}/mo)`);
  return price;
}

/**
 * Create a one-time setup fee price, or return existing one by lookup_key.
 */
async function ensureSetupPrice(
  stripe: Stripe,
  productId: string,
  amountDollars: number,
  lookupKey: string,
  nickname: string,
): Promise<Stripe.Price> {
  const existing = await findExistingPrice(stripe, lookupKey);
  if (existing) {
    console.log(`  [exists] Price ${lookupKey} -> ${existing.id}`);
    return existing;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: dollarsToCents(amountDollars),
    currency: "usd",
    lookup_key: lookupKey,
    nickname,
    metadata: { closeredge_lookup: lookupKey },
  });
  console.log(`  [created] Price ${lookupKey} -> ${price.id} ($${amountDollars} one-time)`);
  return price;
}

// ---------------------------------------------------------------------------
// Main setup
// ---------------------------------------------------------------------------

async function setupAgentProducts(stripe: Stripe): Promise<Record<AgentType, ProductEntry>> {
  const results = {} as Record<AgentType, ProductEntry>;

  for (const agent of AGENTS) {
    const metadataKey = `closeredge_${agent.key}`;
    console.log(`\n--- ${agent.name} (${agent.key}) ---`);

    // Find or create product
    let product = await findExistingProduct(stripe, metadataKey);
    if (product) {
      console.log(`  [exists] Product ${agent.name} -> ${product.id}`);
    } else {
      product = await stripe.products.create({
        name: `CloserEdge AI — ${agent.name}`,
        description: agent.description,
        metadata: {
          closeredge_key: metadataKey,
          agent_type: agent.key,
          platform: "closeredge",
        },
      });
      console.log(`  [created] Product ${agent.name} -> ${product.id}`);
    }

    // Create prices for each tier
    const tierNames: TierName[] = ["foundation", "pro", "elite"];
    const prices = {} as PriceIds;

    for (const tier of tierNames) {
      const tierData = agent.tiers[tier];

      const monthlyKey = `${agent.key}_${tier}_monthly`;
      const setupKey = `${agent.key}_${tier}_setup`;

      const monthlyPrice = await ensureMonthlyPrice(
        stripe,
        product.id,
        tierData.monthly,
        monthlyKey,
        `${agent.name} ${tier.charAt(0).toUpperCase() + tier.slice(1)} — Monthly`,
      );

      const setupPrice = await ensureSetupPrice(
        stripe,
        product.id,
        tierData.setup,
        setupKey,
        `${agent.name} ${tier.charAt(0).toUpperCase() + tier.slice(1)} — Setup Fee`,
      );

      prices[`${tier}_monthly` as keyof PriceIds] = monthlyPrice.id;
      prices[`${tier}_setup` as keyof PriceIds] = setupPrice.id;
    }

    results[agent.key] = {
      product_id: product.id,
      prices,
    };
  }

  return results;
}

async function setupAddOnProducts(stripe: Stripe): Promise<Record<string, AddOnEntry>> {
  const results = {} as Record<string, AddOnEntry>;

  for (const addon of ADDONS) {
    const metadataKey = `closeredge_addon_${addon.key}`;
    console.log(`\n--- Add-On: ${addon.name} (${addon.key}) ---`);

    // Find or create product
    let product = await findExistingProduct(stripe, metadataKey);
    if (product) {
      console.log(`  [exists] Product ${addon.name} -> ${product.id}`);
    } else {
      product = await stripe.products.create({
        name: `CloserEdge AI Add-On — ${addon.name}`,
        description: addon.description,
        metadata: {
          closeredge_key: metadataKey,
          addon_type: addon.key,
          platform: "closeredge",
        },
      });
      console.log(`  [created] Product ${addon.name} -> ${product.id}`);
    }

    const lookupKey = `addon_${addon.key}_monthly`;
    const price = await ensureMonthlyPrice(
      stripe,
      product.id,
      addon.monthlyPrice,
      lookupKey,
      `${addon.name} — Monthly`,
    );

    results[addon.key] = {
      product_id: product.id,
      price_id: price.id,
    };
  }

  return results;
}

async function main(): Promise<void> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error("ERROR: STRIPE_SECRET_KEY environment variable is required.");
    console.error("Usage: STRIPE_SECRET_KEY=sk_test_xxx npx tsx scripts/stripe-setup.ts");
    process.exit(1);
  }

  const stripe = new Stripe(secretKey, {
    apiVersion: "2025-04-30.basil",
    typescript: true,
  });

  console.log("=== CloserEdge AI — Stripe Setup ===\n");
  console.log("Verifying Stripe connection...");
  try {
    await stripe.accounts.retrieve();
    console.log("Connected to Stripe.\n");
  } catch (err) {
    console.error("Failed to connect to Stripe. Check your STRIPE_SECRET_KEY.");
    console.error(err);
    process.exit(1);
  }

  // --- Agent Products ---
  console.log("\n========== AGENT PRODUCTS ==========");
  const products = await setupAgentProducts(stripe);

  // --- Add-On Products ---
  console.log("\n========== ADD-ON PRODUCTS ==========");
  const addons = await setupAddOnProducts(stripe);

  // --- Output ---
  const output: StripeProductsOutput = { products, addons };

  const outputPath = path.resolve(__dirname, "stripe-products.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`\n=== Done. Wrote ${outputPath} ===`);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
