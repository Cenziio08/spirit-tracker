"""
Met à jour spirits-data.js à partir d'un relevé de fortnite.gg
(scrapeList() de tools/scrape_fortnitegg.js, enregistré en JSON).

- esprits déjà connus : coche/décoche « pas encore sorti », signale les
  changements de nom, de rareté ou de variante ;
- nouveaux esprits : ajoutés (nouvelle saison = nouveau bloc en tête de liste,
  saison existante = à la suite des esprits de cette saison) ;
- date « updated » mise à jour.

Usage (depuis le dossier du site) :
    python tools/update_spirits.py list.json [--season 44=c8s1] [--dry-run] [--build]

--season : correspondance pour une saison que fortnite.gg numérote et que le
           script ne connaît pas encore (c<chapitre>s<saison>, ou c<chapitre>ms
           pour une mini-saison). Le script s'arrête s'il en manque une.
--build  : relance ensuite build_fingerprints.py et build_icons.py (nécessaire
           dès qu'il y a de nouveaux esprits).
"""
import datetime
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(ROOT, "spirits-data.js")

# Numéro de saison de fortnite.gg -> code utilisé par le site
FGG_SEASONS = {"41": "c7s3", "42": "c7s4", "43": "c7ms"}

ROW_RE = re.compile(
    r'^(\s*)\["(\d+)","([^"]*)","((?:[^"\\]|\\.)*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"(,true)?\],?\s*$')


def season_title(code):
    m = re.match(r"c(\d+)(?:s(\d+)|(ms))$", code)
    if not m:
        return code
    return f"Chapitre {m.group(1)} – " + ("Mini-saison" if m.group(3) else f"Saison {m.group(2)}")


def js_str(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')


def row_text(indent, sid, parent, name, rarity, variant, season, image, hidden):
    return (f'{indent}["{sid}","{js_str(parent)}","{js_str(name)}","{rarity}","{variant}",'
            f'"{season}","{js_str(image)}"' + (",true" if hidden else "") + "],")


def main():
    args = sys.argv[1:]
    if not args or args[0].startswith("-"):
        print(__doc__)
        sys.exit(1)
    dry = "--dry-run" in args
    build = "--build" in args
    seasons = dict(FGG_SEASONS)
    for i, a in enumerate(args):
        if a == "--season":
            k, v = args[i + 1].split("=")
            if not re.match(r"c\d+(s\d+|ms)$", v):
                sys.exit(f"Code de saison invalide : {v} (attendu : c8s1, c7ms…)")
            seasons[k] = v

    cards = json.load(open(args[0], encoding="utf-8"))
    unknown = sorted({c["season"] for c in cards} - set(seasons))
    if unknown:
        sys.exit("Saison(s) fortnite.gg inconnue(s) : " + ", ".join(unknown)
                 + "\nRelance avec --season <numéro>=<code>, ex. --season 44=c8s1"
                 + " (vérifie le nom de la saison sur fortnite.gg/season-countdown).")

    lines = open(DATA_JS, encoding="utf-8").read().split("\n")
    known = {}
    for i, line in enumerate(lines):
        m = ROW_RE.match(line)
        if m:
            known[m.group(2)] = (i, m)

    report = {"sortis": [], "masqués": [], "changés": [], "nouveaux": []}
    fresh = []
    for c in cards:
        sid = c["id"]
        season = seasons[c["season"]]
        if sid not in known:
            fresh.append((c, season))
            continue
        i, m = known[sid]
        indent, _, parent, name, rarity, variant, old_season, image, flag = m.groups()
        was_hidden = bool(flag)
        name_plain = name.replace('\\"', '"').replace("\\\\", "\\")
        changed = [f"{label} {a!r} -> {b!r}" for label, a, b in (
            ("parent", parent, c["parent"]), ("nom", name_plain, c["name"]),
            ("rareté", rarity, c["rarity"]), ("variante", variant, c["variant"]),
            ("saison", old_season, season)) if a != b]
        if changed:
            report["changés"].append(f"{sid} : " + ", ".join(changed))
        if was_hidden and not c["hidden"]:
            report["sortis"].append(f"{sid} {c['name']} ({c['variant']})")
        if not was_hidden and c["hidden"]:
            report["masqués"].append(f"{sid} {c['name']} ({c['variant']})")
        lines[i] = row_text(indent, sid, c["parent"], c["name"], c["rarity"], c["variant"],
                            season, c["image"] or image, c["hidden"])

    # nouveaux esprits, regroupés par saison
    today = datetime.date.today().isoformat()
    by_season = {}
    for c, season in fresh:
        by_season.setdefault(season, []).append(c)
        report["nouveaux"].append(f"{c['id']} {c['name']} ({c['variant']}, {c['rarity']}, {season})"
                                  + (" — pas encore sorti" if c["hidden"] else ""))
    start = next(i for i, l in enumerate(lines) if l.strip() == "spirits: [") + 1
    for season, group in by_season.items():
        group.sort(key=lambda c: int(c["id"]))
        rows = [row_text("    ", c["id"], c["parent"], c["name"], c["rarity"], c["variant"],
                         season, c["image"], c["hidden"]) for c in group]
        existing = [i for i, m in known.values() if m.group(7) == season]
        if existing:
            at = max(existing) + 1
            lines[at:at] = [f"    // Ajoutés le {today}"] + rows
        else:
            lines[start:start] = [f"    // ----- {season_title(season)} (ajoutés le {today}) -----"] + rows + [""]
        # les index de lignes connus ont bougé : on les recalcule
        known = {}
        for i, line in enumerate(lines):
            m = ROW_RE.match(line)
            if m:
                known[m.group(2)] = (i, m)

    src = "\n".join(lines)
    src = re.sub(r'updated: "[^"]*"', f'updated: "{today}"', src)
    src = re.sub(r"relevée le \d{4}-\d{2}-\d{2}", f"relevée le {today}", src)
    # pas de virgule après la dernière ligne de la liste
    src = re.sub(r"\],(\s*\n\s*\]\s*\n\s*\};)", r"]\1", src)

    for k, v in report.items():
        print(f"{k} ({len(v)})" + ("" if not v else " :"))
        for x in v:
            print("   ", x)
    if not any(report.values()):
        print("Rien de nouveau : spirits-data.js est déjà à jour.")
        return
    if dry:
        print("\n(--dry-run : rien n'a été écrit)")
        return
    open(DATA_JS, "w", encoding="utf-8", newline="\n").write(src)
    print("\nspirits-data.js mis à jour.")
    # retient les nouvelles correspondances de saison pour la prochaine fois
    added = {k: v for k, v in seasons.items() if k not in FGG_SEASONS}
    if added:
        me = os.path.abspath(__file__)
        code = open(me, encoding="utf-8").read()
        table = json.dumps({**FGG_SEASONS, **added})
        code = re.sub(r"^FGG_SEASONS = \{.*\}$", lambda _: f"FGG_SEASONS = {table}", code, count=1, flags=re.M)
        open(me, "w", encoding="utf-8", newline="\n").write(code)
        print("Saison(s) retenue(s) dans FGG_SEASONS :", added)
    if fresh:
        print("Nouveaux esprits : il faut aussi leurs fiches (tools/update_details.py),"
              " les empreintes du scanner et les icônes.")
        if build:
            for tool in ("build_fingerprints.py", "build_icons.py"):
                subprocess.run([sys.executable, os.path.join(ROOT, "tools", tool)], check=True, cwd=ROOT)
        else:
            print("  -> python tools/build_fingerprints.py && python tools/build_icons.py")


if __name__ == "__main__":
    main()
