#!/usr/bin/env bash
# FactoryDepo — one-shot status board. Run this FIRST in any new session:
#   bash scripts/where-are-we.sh
# Answers: what branch / what's uncommitted / what's not on GitHub / is prod up and
# which code is it running / is mail flowing / what's left to do.
set -u
cd "$(dirname "$0")/.." || exit 1
PROD="${PROD:-https://www.factorydepo.com}"

echo "==================== GIT ===================="
echo "branch : $(git rev-parse --abbrev-ref HEAD)"
echo "head   : $(git log --oneline -1)"
dirty=$(git status --porcelain | wc -l | tr -d ' ')
echo "dirty  : $dirty file(s)"
[ "$dirty" != "0" ] && git status --short | head -20

git fetch -q origin 2>/dev/null
if git rev-parse --verify -q origin/main >/dev/null; then
  read -r behind ahead <<<"$(git rev-list --left-right --count origin/main...HEAD | tr '\t' ' ')"
  echo "vs origin/main: $ahead commit(s) ahead, $behind behind"
  if [ "${ahead:-0}" != "0" ]; then
    echo "  !! NOT ON GITHUB (a GitHub-sourced deploy would ship stale code):"
    git log origin/main..HEAD --oneline | sed 's/^/     /'
  fi
fi

echo "==================== LOCAL GATES ===================="
echo "(run before committing: pnpm run typecheck && pnpm run build)"

echo "==================== PRODUCTION ===================="
code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$PROD/api/healthz")
echo "healthz: $code $(curl -s -m 20 "$PROD/api/healthz" || true)"
total=$(curl -s -m 20 "$PROD/api/products?limit=1" | sed -n 's/.*"total":\([0-9]*\).*/\1/p')
echo "products live: ${total:-<no answer>}"
# route markers — tells whether prod runs the newest code
for p in "/api/products/categories" "/api/orders/stats" "/feed" "/explore"; do
  printf '  %-28s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$PROD$p")"
done
# six-language landing marker (data-t attributes exist only in the newest landing)
curl -s -m 25 "$PROD/" | grep -c 'data-t=' | sed 's/^/landing data-t markers: /'

echo "==================== RAILWAY ===================="
railway deployment list 2>&1 | head -6
echo "--- env gaps (prod) ---"
vars=$(railway variables 2>/dev/null)
for v in APP_SECRET SITE_URL DATABASE_URL ADMIN_EMAIL ADMIN_PASSWORD RESEND_API_KEY EMAIL_FROM; do
  if echo "$vars" | grep -q " $v  *│"; then echo "  set     : $v"; else echo "  MISSING : $v"; fi
done

echo "==================== DO NEXT ===================="
echo "1. Push the branch to GitHub and get prod deploying FROM the repo (not a local upload)."
echo "2. Set RESEND_API_KEY + EMAIL_FROM on Railway, or mail keeps queuing in email_outbox."
echo "3. Anything not on origin/main is invisible to a GitHub-based deploy."
