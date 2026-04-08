#!/usr/bin/env python3
"""Open Brain Viewer server — serves static files + dreaming log API."""

import http.server
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs

LOGS_DIR = None  # set from --logs-dir or JARVIS_LOGS_DIR env


class ViewerHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/api/dreaming/list':
            self.handle_dreaming_list()
        elif path.startswith('/api/dreaming/'):
            date = path.split('/')[-1]
            self.handle_dreaming_detail(date)
        else:
            super().do_GET()

    def handle_dreaming_list(self):
        if not LOGS_DIR or not os.path.isdir(LOGS_DIR):
            self.send_json({"error": "Logs directory not configured", "runs": []})
            return

        runs = []
        for f in sorted(Path(LOGS_DIR).glob("dreaming-*.md"), reverse=True):
            name = f.stem  # dreaming-2026-03-30
            m = re.search(r'(\d{4}-\d{2}-\d{2})', name)
            date = m.group(1) if m else name
            stat = f.stat()
            content = f.read_text(errors='replace')

            # Extract quick stats from content
            summary = extract_summary(content)
            runs.append({
                "date": date,
                "filename": f.name,
                "size": stat.st_size,
                "summary": summary,
            })

        self.send_json({"runs": runs})

    def handle_dreaming_detail(self, date):
        if not LOGS_DIR:
            self.send_json({"error": "Logs directory not configured"}, 404)
            return

        # Try exact filename match
        candidates = [
            Path(LOGS_DIR) / f"dreaming-{date}.md",
            Path(LOGS_DIR) / f"dreaming-dry-run-{date}.md",
        ]
        for p in candidates:
            if p.exists():
                content = p.read_text(errors='replace')
                sections = parse_dreaming_log(content)
                self.send_json({
                    "date": date,
                    "filename": p.name,
                    "raw": content,
                    "sections": sections,
                })
                return

        self.send_json({"error": f"No log found for {date}"}, 404)

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass  # suppress access logs


def extract_summary(content):
    """Pull key numbers from a dreaming log."""
    summary = {}

    m = re.search(r'New thoughts loaded.*?:\s*(\d+)', content)
    if m:
        summary['new_loaded'] = int(m.group(1))

    m = re.search(r'Old thoughts loaded.*?:\s*(\d+)', content)
    if m:
        summary['old_loaded'] = int(m.group(1))

    m = re.search(r'Total working list:\s*(\d+)', content)
    if m:
        summary['total_working'] = int(m.group(1))

    # Count deletes
    deletes = len(re.findall(r'(?:DELETED|deleted)', content, re.IGNORECASE))
    summary['actions'] = deletes

    # Count insights
    insights = re.findall(r'urgency:(high|medium|low)', content)
    if insights:
        summary['insights'] = len(insights)
        summary['high_urgency'] = insights.count('high')

    # Cursor dates
    m = re.search(r'Cursor.*?:\s*(\S+)', content)
    if m:
        summary['cursor'] = m.group(1)

    return summary


def parse_dreaming_log(content):
    """Parse markdown dreaming log into structured sections."""
    sections = []
    current = None

    for line in content.split('\n'):
        # Top-level heading = title
        if line.startswith('# ') and not line.startswith('## '):
            sections.append({"type": "title", "text": line[2:].strip(), "lines": []})
            current = sections[-1]
        # Section heading
        elif line.startswith('## '):
            sections.append({"type": "section", "title": line[3:].strip(), "lines": []})
            current = sections[-1]
        # Sub-section
        elif line.startswith('### '):
            sections.append({"type": "subsection", "title": line[4:].strip(), "lines": []})
            current = sections[-1]
        elif line.strip() == '---':
            continue
        elif current is not None:
            if line.strip():
                current["lines"].append(line)

    return sections


def main():
    global LOGS_DIR

    port = 8765
    logs_dir = os.environ.get('JARVIS_LOGS_DIR', '')

    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == '--port' and i + 1 < len(args):
            port = int(args[i + 1]); i += 2
        elif args[i] == '--logs-dir' and i + 1 < len(args):
            logs_dir = args[i + 1]; i += 2
        else:
            i += 1

    if logs_dir:
        logs_dir = os.path.expanduser(logs_dir)
        if os.path.isdir(logs_dir):
            LOGS_DIR = logs_dir
            print(f"Dreaming logs: {LOGS_DIR}")
        else:
            print(f"Warning: logs dir not found: {logs_dir}")

    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = http.server.HTTPServer(('', port), ViewerHandler)
    print(f"Serving on http://localhost:{port}/")
    server.serve_forever()


if __name__ == '__main__':
    main()
