#!/usr/bin/env bash
# Validate the entries of a .trivyignore file against the policy in
# docs/ci/image-scanning.md.
#
# Every entry (a non-comment, non-blank line) must
#   - have the form "<ID> exp:YYYY-MM-DD",
#   - expire no more than MAX_DAYS days from today,
#   - be preceded, in the contiguous comment block directly above it, by a
#     "# Reason: ..." line and a "# Owner: ..." line.
# Malformed entries fail the check. Entries that have already expired do not
# fail it (Trivy no longer applies them) but produce a warning annotation.
#
# Usage: check-trivyignore.sh [path-to-ignore-file]   (default: .trivyignore)
set -euo pipefail

file="${1:-.trivyignore}"
max_days="${MAX_DAYS:-90}"

if [ ! -f "$file" ]; then
  echo "::error::$file not found"
  exit 1
fi

today="$(date -u +%F)"
limit="$(date -u -d "+${max_days} days" +%F)"
errors=0
entries=0
have_reason=0
have_owner=0
lineno=0

while IFS= read -r line || [ -n "$line" ]; do
  lineno=$((lineno + 1))
  line="${line%$'\r'}"
  trimmed="${line#"${line%%[![:space:]]*}"}"

  if [ -z "$trimmed" ]; then
    have_reason=0
    have_owner=0
    continue
  fi

  if [ "${trimmed:0:1}" = "#" ]; then
    body="${trimmed#\#}"
    body="${body#"${body%%[![:space:]]*}"}"
    case "$body" in
      Reason:*) have_reason=1 ;;
      Owner:*) have_owner=1 ;;
    esac
    continue
  fi

  entries=$((entries + 1))
  if [[ ! "$trimmed" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*[[:space:]]+exp:([0-9]{4}-[0-9]{2}-[0-9]{2})$ ]]; then
    echo "::error file=$file,line=$lineno::Entry must look like '<ID> exp:YYYY-MM-DD'"
    errors=$((errors + 1))
  else
    exp="${BASH_REMATCH[1]}"
    if ! date -u -d "$exp" +%F >/dev/null 2>&1; then
      echo "::error file=$file,line=$lineno::'$exp' is not a valid date"
      errors=$((errors + 1))
    elif [[ "$exp" > "$limit" ]]; then
      echo "::error file=$file,line=$lineno::Expiry $exp is more than $max_days days away (latest allowed: $limit)"
      errors=$((errors + 1))
    elif [[ "$exp" < "$today" ]]; then
      echo "::warning file=$file,line=$lineno::Entry expired on $exp and is no longer applied. Remove it or re-review and renew it."
    fi
  fi
  if [ "$have_reason" -ne 1 ] || [ "$have_owner" -ne 1 ]; then
    echo "::error file=$file,line=$lineno::Entry needs '# Reason:' and '# Owner:' comment lines directly above it"
    errors=$((errors + 1))
  fi
  have_reason=0
  have_owner=0
done < "$file"

if [ "$errors" -gt 0 ]; then
  echo "$file: $errors problem(s) in $entries entries"
  exit 1
fi
echo "$file: $entries entries, all valid"
