#!/usr/bin/env bash
# Hard rule (the "process.env only in src/config" rule): src/config/ is the ONLY place that reads
# process.env. This runs in CI alongside the ESLint rule, so silencing the lint
# rule is not enough to smuggle a secret read into the app.
set -euo pipefail

offenders=$(grep -rn "process\.env" src --include='*.ts' | grep -v '^src/config/' || true)

if [[ -n "$offenders" ]]; then
    echo "ERROR: process.env read outside src/config/:"
    echo "$offenders"
    exit 1
fi

echo "env guard OK: process.env only read inside src/config/"
