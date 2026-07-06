# Stripe Product Setup — PENDING

Stripe CLI authentication needed before products can be created.

## When Ready:
1. Run: stripe login
2. Authenticate in browser
3. Run: npx ts-node scripts/stripe-setup.ts
4. Save the output product/price IDs to scripts/stripe-products.json

## Products to Create (from Pricing Matrix):
- Eden: F $300/mo, P $500/mo, E $750/mo
- Crest: F $500/mo, P $800/mo, E $1200/mo
- Lexis: F $500/mo, P $800/mo, E $1200/mo
- Haven: F $500/mo, P $750/mo, E $1000/mo
- Forge: F $300/mo, P $500/mo, E $700/mo
- Nora: F $250/mo, P $400/mo, E $600/mo
- 7 add-ons ($25-75/mo each)
