#!/bin/bash
set -e

bun run db:migrate
exec bun run src/index.ts
