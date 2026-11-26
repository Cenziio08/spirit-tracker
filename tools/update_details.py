"""
Met à jour spirits-details.js (ce que fait chaque esprit) à partir d'un relevé
de fortnite.gg (scrapeDetails() de tools/scrape_fortnitegg.js, en JSON).

fortnite.gg n'a que l'anglais : chaque NOUVELLE phrase anglaise doit avoir sa
traduction française, écrite à la main dans un fichier JSON {anglais: français}.
S'il en manque, le script n'écrit rien et crée un fichier « à traduire »
(fr-a-traduire.json) à compléter puis à passer avec --fr.

Usage (depuis le dossier du site) :
    python tools/update_details.py details.json [--fr traductions.json] [--dry-run]

Les fautes d'anglais de fortnite.gg déjà corrigées sur le site (EN_FIXES) sont
réappliquées automatiquement, pour ne pas les réintroduire.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DETAILS_JS = os.path.join(ROOT, "spirits-details.js")

# Texte de fortnite.gg -> texte corrigé affiché sur le site
EN_FIXES = {
    "Grants cloak for a duration upon reloading.": "Grants Cloak for a short time when you reload.",
    "Players who attack you are marked for a duration.": "Players who attack you are marked for a short time.",
    "Grants a bush on you after a duration, gain a bush on elimination at max level.": "Grants you a bush after a short time; at max level, you also gain a bush on each elimination.",
    "Grants random items at each level, only levels up by consuming items.": "Grants random items at each level; only levels up by consuming items.",
    "Recover some health or shields after being damaged after a short duration.": "Recover some health or shields shortly after taking damage.",
    "Grants cloak for a duration when you take damage.": "Grants Cloak for a short time when you take damage.",
    "(Active) - Jump shortly after landing to trigger a Super Jump, if charges are present.": "(Active) Jump shortly after landing to trigger a Super Jump, if you have charges left.",
    "Upon earning an elimination, slowly replenish shield for you and nearby squad members for a duration.": "Upon earning an elimination, slowly replenish shields for you and nearby squad members for a short time.",
    "Health regenerated to increases at each Level Up: 60 Health -> 70 Health -> 80 Health -> 90 Health -> 100 Health": "Health regenerated increases at each Level Up: 60 Health -> 70 Health -> 80 Health -> 90 Health -> 100 Health",
    "Extract other players equipped Sprites when eliminating them.": "Extract other players' equipped Sprites when eliminating them.",
    "Gets upset when removed and marks you on the map": "Gets upset when removed and marks you on the map.",
    "Effect radius increases with each level up!": "Effect radius increases with each Level Up!",
    "Reveals nearby Chests": "Reveals nearby Chests.",
    "Increased chance of finding rare Sprites, take damage in water": "Increased chance of finding rare Sprites, but you take damage in water.",
    "Max charges increase and recharge time decrease with Level Up!": "Max charges increase and recharge time decreases with each Level Up!",
    "Chance to spawn bees at the hit location upon dealing damage with a ranged weapon": "Chance to spawn bees at the hit location when you deal damage with a ranged weapon.",
    "Gives 50% Sprite XP to all other Sprites in your inventory": "Gives 50% Sprite XP to all other Sprites in your inventory.",
    "Button mash! All inputs are correct when entering cheat codes found in the world": "Button mash! All inputs are correct when entering cheat codes found in the world.",
    "5% chance for your squad to find rare Sprite Variants from looting chests": "5% chance for your squad to find rare Sprite Variants when looting chests.",
    "Take 30% less Fall damage": "Take 30% less fall damage.",
    "Gain 20% more Sprite Dust upon Extraction": "Gain 20% more Sprite Dust upon Extraction.",
    "Gain 30% more Ammo whenever picked up in the world": "Gain 30% more ammo whenever you pick it up.",
    "Gain 3x bonus XP from eliminations": "Gain 3x bonus XP from eliminations.",
}


def fix(s):
    return EN_FIXES.get(s, s)


def main():
    args = sys.argv[1:]
    if not args or args[0].startswith("-"):
        print(__doc__)
        sys.exit(1)
    dry = "--dry-run" in args
    fr_new = {}
    if "--fr" in args:
        fr_new = json.load(open(args[args.index("--fr") + 1], encoding="utf-8"))

    scraped = json.load(open(args[0], encoding="utf-8"))
    src = open(DETAILS_JS, encoding="utf-8").read()
    m_en = re.search(r"    en: (\[.*?\]),\n", src)
    m_fr = re.search(r"    fr: (\[\n.*?\n    \])\n", src, re.S)
    m_map = re.search(r"  map: (\{.*\})\n", src)
    en, fr, mp = json.loads(m_en.group(1)), json.loads(m_fr.group(1)), json.loads(m_map.group(1))
    assert len(en) == len(fr), "strings.en et strings.fr n'ont pas la même longueur"

    # phrases anglaises nouvelles (absentes du site)
    missing = []
    for v in scraped.values():
        if not v:
            continue
        for s in [v["bonus"], *v["desc"], v["location"]]:
            s = fix(s)
            if s and s not in en and s not in fr_new and s not in missing:
                missing.append(s)
    if missing:
        out = os.path.join(os.getcwd(), "fr-a-traduire.json")
        json.dump({s: "" for s in missing}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"{len(missing)} phrase(s) anglaise(s) sans traduction. Complète {out}")
        print("puis relance avec --fr fr-a-traduire.json :")
        for s in missing:
            print("  -", s)
        sys.exit(2)
    empty = [k for k, v in fr_new.items() if not v.strip()]
    if empty:
        sys.exit("Traductions vides : " + "; ".join(empty))

    def idx(s):
        s = fix(s)
        if not s:
            return -1
        if s not in en:
            en.append(s)
            fr.append(fr_new[s])
        return en.index(s)

    added, changed = [], []
    for sid, v in sorted(scraped.items(), key=lambda kv: int(kv[0])):
        if not v:
            continue
        entry = [idx(v["bonus"]), [idx(d) for d in v["desc"]], idx(v["location"]),
                 v["cost"] or "0", v["chest"] or "0%"]
        if sid not in mp:
            added.append(sid)
        elif mp[sid] != entry:
            changed.append(sid)
        mp[sid] = entry

    print(f"fiches ajoutées ({len(added)}) :", ", ".join(added) or "—")
    print(f"fiches modifiées ({len(changed)}) :", ", ".join(changed) or "—")
    if not added and not changed:
        print("Rien de nouveau : spirits-details.js est déjà à jour.")
        return
    if dry:
        print("(--dry-run : rien n'a été écrit)")
        return
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    mp = dict(sorted(mp.items(), key=lambda kv: int(kv[0])))
    src = (src[:m_en.start(1)] + json.dumps(en, ensure_ascii=False) + src[m_en.end(1):m_fr.start(1)]
           + "[\n" + ",\n".join("      " + json.dumps(x, ensure_ascii=False) for x in fr) + "\n    ]" + src[m_fr.end(1):m_map.start(1)] + dump(mp) + src[m_map.end(1):])
    open(DETAILS_JS, "w", encoding="utf-8", newline="\n").write(src)
    print("spirits-details.js mis à jour.")


if __name__ == "__main__":
    main()
