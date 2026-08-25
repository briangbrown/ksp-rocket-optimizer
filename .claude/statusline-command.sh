#!/usr/bin/env bash
# Claude Code status line — rich info panel
# Reads JSON from stdin, outputs a single formatted line.
# Segments: model | directory | git branch | context % bar | token count | elapsed time

input=$(cat)

# ── Parse JSON fields ──────────────────────────────────────────────────────
model=$(echo "$input" | jq -r '.model.display_name // "Claude"')
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // "?"')
transcript=$(echo "$input" | jq -r '.transcript_path // ""')

used_pct=$(echo "$input"   | jq -r '.context_window.used_percentage      // ""')

total_in=$(echo "$input"  | jq -r '.context_window.total_input_tokens  // 0')
total_out=$(echo "$input" | jq -r '.context_window.total_output_tokens // 0')

# ── ANSI color helpers ────────────────────────────────────────────────────
RESET='\033[0m'
DIM='\033[2m'

C_CYAN='\033[36m'
C_BLUE='\033[34m'
C_GREEN='\033[32m'
C_YELLOW='\033[33m'
C_RED='\033[31m'
C_MAGENTA='\033[35m'
C_GRAY='\033[90m'

SEP="${C_GRAY}│${RESET}"

# ── Model ─────────────────────────────────────────────────────────────────
model_str="${C_MAGENTA}${model}${RESET}"

# ── Current directory (shorten home prefix, keep last 3 components) ───────
home_dir="${HOME:-/home/node}"
short_cwd="${cwd/#$home_dir/\~}"
component_count=$(echo "$short_cwd" | tr -cd '/' | wc -c)
if [ "$component_count" -gt 3 ]; then
  short_cwd="...$(echo "$short_cwd" | rev | cut -d'/' -f1-3 | rev)"
fi
dir_str="${C_BLUE}${short_cwd}${RESET}"

# ── Git branch — cached in /tmp for 5s to avoid repeated subprocess calls ─
cache_key=$(echo "$cwd" | tr '/' '_')
cache_file="/tmp/claude_gitbranch_${cache_key}"
cache_ttl=5

git_str=""
if [ -d "${cwd}/.git" ] || git --no-optional-locks -C "$cwd" rev-parse --git-dir &>/dev/null 2>&1; then
  if [ -f "$cache_file" ] && [ $(( $(date +%s) - $(stat -c %Y "$cache_file" 2>/dev/null || echo 0) )) -lt $cache_ttl ]; then
    branch=$(cat "$cache_file")
  else
    branch=$(git --no-optional-locks -C "$cwd" symbolic-ref --short HEAD 2>/dev/null \
             || git --no-optional-locks -C "$cwd" rev-parse --short HEAD 2>/dev/null \
             || echo "")
    echo "$branch" > "$cache_file"
  fi
  if [ -n "$branch" ]; then
    git_str="${C_CYAN}${branch}${RESET}"
  fi
fi

# ── Context window bar (8-cell block bar with color gradient) ─────────────
ctx_str=""
if [ -n "$used_pct" ]; then
  pct_int=${used_pct%.*}
  pct_int=${pct_int:-0}

  bar_width=8
  filled=$(( pct_int * bar_width / 100 ))
  empty=$(( bar_width - filled ))
  bar=""
  for i in $(seq 1 $filled);  do bar="${bar}█"; done
  for i in $(seq 1 $empty);   do bar="${bar}░"; done

  # Green < 50%, yellow < 80%, red >= 80%
  if   [ "$pct_int" -lt 50 ]; then bar_color="${C_GREEN}"
  elif [ "$pct_int" -lt 80 ]; then bar_color="${C_YELLOW}"
  else                              bar_color="${C_RED}"
  fi

  ctx_str="${bar_color}${bar}${RESET} ${DIM}${pct_int}%${RESET}"
fi

# ── Token count (compact K/M format) ──────────────────────────────────────
token_str=""
if [ "$total_in" -gt 0 ] || [ "$total_out" -gt 0 ]; then
  total=$(( total_in + total_out ))
  if [ "$total" -ge 1000000 ]; then
    token_label=$(awk -v t="$total" 'BEGIN { printf "%.1fM", t / 1000000 }')
  elif [ "$total" -ge 1000 ]; then
    token_label=$(awk -v t="$total" 'BEGIN { printf "%.1fK", t / 1000 }')
  else
    token_label="${total}"
  fi
  token_str="${C_YELLOW}${token_label} tok${RESET}"
fi

# ── Session elapsed time (from transcript directory mtime) ────────────────
time_str=""
if [ -n "$transcript" ] && [ -f "$transcript" ]; then
  session_dir=$(dirname "$transcript")
  start_ts=$(stat -c %Y "$session_dir" 2>/dev/null || echo "")
  if [ -n "$start_ts" ]; then
    now_ts=$(date +%s)
    elapsed=$(( now_ts - start_ts ))
    hrs=$(( elapsed / 3600 ))
    mins=$(( (elapsed % 3600) / 60 ))
    secs=$(( elapsed % 60 ))
    if [ "$hrs" -gt 0 ]; then
      time_str="${DIM}${hrs}h${mins}m${RESET}"
    else
      time_str="${DIM}${mins}m${secs}s${RESET}"
    fi
  fi
fi

# ── Assemble status line ─────────────────────────────────────────────────
parts=()
parts+=("${model_str}")
parts+=("${dir_str}")
[ -n "$git_str"  ] && parts+=("${git_str}")
[ -n "$ctx_str"  ] && parts+=("${ctx_str}")
[ -n "$token_str" ] && parts+=("${token_str}")
[ -n "$time_str" ] && parts+=("${time_str}")

line=""
for part in "${parts[@]}"; do
  if [ -z "$line" ]; then
    line="${part}"
  else
    line="${line}  ${SEP}  ${part}"
  fi
done

printf "%b\n" "${line}"
