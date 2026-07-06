#!/bin/bash
# CloserEdge AI — First Time Setup
# Run this after cloning the repo

echo "Setting up CloserEdge AI..."

# Copy default config
mkdir -p ~/.closeredge
cp config/closeredge-defaults.toml ~/.closeredge/config.toml

# Create .env from example if it doesn't exist
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — edit it with your API keys"
fi

# Install frontend dependencies
cd app && pnpm install && cd ..

echo ""
echo "CloserEdge AI setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env with your API keys (ANTHROPIC_API_KEY or OPENROUTER_API_KEY)"
echo "2. Edit ~/.closeredge/config.toml to customize settings"
echo "3. Run 'pnpm dev' to start the web UI"
echo "4. Run 'pnpm dev:app:win' to start the desktop app"
echo ""
