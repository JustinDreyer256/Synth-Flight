"""Local game server — sends whole files with Content-Length and closes the connection.
Avoids Chrome/Edge hanging near the end of large JS on Python's default http.server."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import gzip
import json
import mimetypes
import re
import shutil
import sys
import time
import urllib.parse

ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 8777
GAME_PART_MAX_BYTES = 120000
GAME_CACHE = "snes336"
PLAYER_SAVE_DIR = ROOT / "player-saves"
PLAYER_SAVE_ID_RE = re.compile(r"^[A-Z0-9]{6,16}$")
PLAYER_SAVE_MAX_BYTES = 262144


def split_game_js():
    """Split game.js into small classic scripts. Cursor/Chrome often abort ~19s JS downloads."""
    text = (ROOT / "game.js").read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    chunks = []
    current = []
    current_bytes = 0
    for line in lines:
        line_bytes = len(line.encode("utf-8"))
        if (
            current
            and current_bytes + line_bytes > GAME_PART_MAX_BYTES
            and line.startswith("function ")
        ):
            chunks.append("".join(current))
            current = [line]
            current_bytes = line_bytes
        else:
            current.append(line)
            current_bytes += line_bytes
    if current:
        chunks.append("".join(current))
    for old in ROOT.glob("game-part*.js"):
        old.unlink()
    for i, chunk in enumerate(chunks, 1):
        (ROOT / ("game-part%d.js" % i)).write_bytes(chunk.encode("utf-8"))
    return len(chunks)


PLAYER_BUILD_FLAG = "<script>window.SYNTH_FLIGHT_PLAYER_BUILD=true;</script>\n"


def apply_player_build_html(html):
    html = re.sub(r"<title>Synth Flight[^<]*</title>", "<title>Synth Flight</title>", html)
    if "SYNTH_FLIGHT_PLAYER_BUILD" not in html:
        html = html.replace("<body>", "<body>\n" + PLAYER_BUILD_FLAG, 1)
    return html


def write_player_package():
    """Static copy with no DEV / editor / sound-test chrome. Zip this folder to host it."""
    n = split_game_js()
    write_index_part_tags(n)
    dest = ROOT / "player-build"
    dest.mkdir(exist_ok=True)
    html = apply_player_build_html((ROOT / "index.html").read_text(encoding="utf-8"))
    # Chrome treats function declarations in split classic scripts as
    # script-local when the files also use let/const, so resetGame cannot
    # see stopLiftSound. Ship one file so those names share a scope.
    html, replaced = re.subn(
        r"<!-- GAME_PARTS -->.*?<!-- /GAME_PARTS -->",
        "<!-- GAME_PARTS -->\n"
        '<script src="game.js?v=%s"></script>\n'
        "<!-- /GAME_PARTS -->" % GAME_CACHE,
        html,
        count=1,
        flags=re.S,
    )
    if replaced != 1:
        raise RuntimeError("index.html is missing GAME_PARTS markers")
    (dest / "index.html").write_text(html, encoding="utf-8", newline="\n")
    shutil.copy2(ROOT / "game.js", dest / "game.js")
    custom = ROOT / "custom-levels.js"
    if custom.exists():
        shutil.copy2(custom, dest / "custom-levels.js")
    audio_src = ROOT / "audio"
    if audio_src.exists():
        audio_dest = dest / "audio"
        audio_dest.mkdir(exist_ok=True)
        for src in audio_src.rglob("*"):
            if src.is_dir() or src.name.endswith(".pre-trim.mp3"):
                continue
            rel = src.relative_to(audio_src)
            out = audio_dest / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, out)
    return dest


def write_index_part_tags(part_count):
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    html = re.sub(
        r"<title>Synth Flight[^<]*</title>",
        "<title>Synth Flight %s</title>" % GAME_CACHE,
        html,
        count=1,
    )
    tags = "\n".join(
        '<script src="game-part%d.js?v=%s"></script>' % (i, GAME_CACHE)
        for i in range(1, part_count + 1)
    )
    html, n = re.subn(
        r"<!-- GAME_PARTS -->.*?<!-- /GAME_PARTS -->",
        "<!-- GAME_PARTS -->\n%s\n<!-- /GAME_PARTS -->" % tags,
        html,
        count=1,
        flags=re.S,
    )
    if n != 1:
        raise RuntimeError("index.html is missing GAME_PARTS markers")
    (ROOT / "index.html").write_text(html, encoding="utf-8", newline="\n")


def build_offline_html():
    """One-file copy you can double-click. Avoids HTTP truncation in Chrome/Edge."""
    n = split_game_js()
    write_index_part_tags(n)
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    html = html.replace(
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n',
        "",
    )
    html = html.replace(
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n',
        "",
    )
    html = html.replace(
        '<link href="https://fonts.googleapis.com/css2?family=Monoton&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet" media="print" onload="this.media=\'all\'">\n',
        "",
    )
    html = apply_player_build_html(html)

    def inline_src(match):
        src = match.group(1).split("?")[0]
        code = (ROOT / src).read_text(encoding="utf-8")
        code = code.replace("</script>", "<\\/script>")
        return "<script>\n" + code + "\n</script>"

    html = re.sub(r'<script src="([^"]+)"></script>', inline_src, html)
    out = ROOT / "Synth-Flight.html"
    out.write_bytes(html.encode("utf-8"))
    return out



class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def log_message(self, fmt, *args):
        try:
            print("%s - %s" % (self.address_string(), fmt % args), flush=True)
        except Exception:
            pass

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, TimeoutError):
            pass
        except Exception:
            try:
                if not self.wfile.closed:
                    self.send_error(500, "Internal server error")
            except Exception:
                pass

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Connection", "close")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def _player_save_id(self, rel):
        prefix = "/api/player-save/"
        if not rel.startswith(prefix):
            return None
        save_id = rel[len(prefix):].strip("/").upper()
        if not PLAYER_SAVE_ID_RE.match(save_id):
            return False
        return save_id

    def _player_save_path(self, save_id):
        PLAYER_SAVE_DIR.mkdir(parents=True, exist_ok=True)
        return PLAYER_SAVE_DIR / (save_id + ".json")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        rel = parsed.path
        save_id = self._player_save_id(rel)
        if save_id is False:
            self.send_error(400)
            return
        if save_id:
            fs = self._player_save_path(save_id)
            if not fs.is_file():
                self.send_error(404)
                return
            data = fs.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self._cors_headers()
            self.end_headers()
            self.wfile.write(data)
            return
        if rel == "/":
            rel = "/index.html"
        if "player-saves" in rel.replace("\\", "/").split("/"):
            self.send_error(404)
            return
        fs = (ROOT / rel.lstrip("/")).resolve()
        if ROOT not in fs.parents and fs != ROOT:
            self.send_error(403)
            return
        if not fs.is_file():
            self.send_error(404)
            return
        data = fs.read_bytes()
        suffix = fs.suffix.lower()
        if suffix == ".js":
            ctype = "text/javascript; charset=utf-8"
        elif suffix == ".html":
            ctype = "text/html; charset=utf-8"
        elif suffix == ".ogg":
            ctype = "audio/ogg"
        elif suffix == ".mp3":
            ctype = "audio/mpeg"
        elif suffix == ".wav":
            ctype = "audio/wav"
        else:
            ctype = mimetypes.guess_type(str(fs))[0] or "application/octet-stream"
        is_audio = suffix in {".ogg", ".mp3", ".wav"}
        total = len(data)
        start = 0
        end = total - 1
        status = 200
        range_hdr = self.headers.get("Range") or ""
        if is_audio and range_hdr.startswith("bytes=") and total > 0:
            spec = range_hdr[6:].split(",")[0].strip()
            left, _, right = spec.partition("-")
            try:
                if left == "":
                    suffix_len = int(right)
                    start = max(0, total - suffix_len)
                else:
                    start = int(left)
                    end = int(right) if right else total - 1
                start = max(0, min(start, total - 1))
                end = max(start, min(end, total - 1))
                status = 206
            except ValueError:
                start, end, status = 0, total - 1, 200
        payload = data[start:end + 1] if total else b""
        accept_enc = (self.headers.get("Accept-Encoding") or "").lower()
        use_gzip = False
        if not is_audio and "gzip" in accept_enc and suffix in {".js", ".html", ".json", ".css"}:
            use_gzip = len(payload) > 500000
        if use_gzip:
            payload = gzip.compress(payload, 6)
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(payload)))
        if is_audio:
            self.send_header("Accept-Ranges", "bytes")
            if status == 206:
                self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, total))
            self.send_header("Cache-Control", "public, max-age=86400")
        else:
            if use_gzip:
                self.send_header("Content-Encoding", "gzip")
                self.send_header("Vary", "Accept-Encoding")
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Pragma", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Connection", "close")
        self.end_headers()
        view = memoryview(payload)
        offset = 0
        chunk = 32 * 1024
        while offset < len(view):
            self.wfile.write(view[offset:offset + chunk])
            offset += chunk
            try:
                self.wfile.flush()
            except Exception:
                pass

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        save_id = self._player_save_id(parsed.path)
        if save_id is False:
            self.send_error(400)
            return
        if not save_id:
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0 or length > PLAYER_SAVE_MAX_BYTES:
            self.send_error(413)
            return
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            self.send_error(400)
            return
        if not isinstance(payload, dict):
            self.send_error(400)
            return
        payload["saveId"] = save_id
        payload["savedAt"] = int(payload.get("savedAt") or 0) or int(time.time() * 1000)
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        if len(data) > PLAYER_SAVE_MAX_BYTES:
            self.send_error(413)
            return
        self._player_save_path(save_id).write_bytes(data)
        self.send_response(204)
        self._cors_headers()
        self.end_headers()


if __name__ == "__main__":
    if "--package" in sys.argv:
        dest = write_player_package()
        print("Player build: %s" % dest)
        print("Zip that folder and upload it, or run a static server from inside it.")
        sys.exit(0)
    offline = build_offline_html()
    n = len(list(ROOT.glob("game-part*.js")))
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print("Synth Flight: http://%s:%s/  (%d js parts)" % (HOST, PORT, n))
    print("Offline file: %s  (%d bytes)" % (offline, offline.stat().st_size))
    httpd.serve_forever()
