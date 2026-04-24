#!/bin/bash
. /etc/profile

set -e

pnpm install

pnpm run deploy
