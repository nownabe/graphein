#!/bin/bash
set -e

bun run db:migrate

exec "$@"
