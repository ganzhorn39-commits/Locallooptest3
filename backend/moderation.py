"""Text moderation: a small German/English blacklist for chat messages, reviews and event/profile texts.

- Chat messages and reviews are censored ("F***"), everything else that others see is rejected.
- Matching works on whole words after normalising case, umlauts, leetspeak (f1ck, @rsch) and
  stretched letters (fiiiick). A few stems also match inside compounds (e.g. "Hurensohn" in
  "Hurensöhne"), the rest only as whole words, so harmless words like "Marsch" or "Schlamperei"
  stay untouched. Mild exclamations ("Mist", "Scheiße", "shit") are deliberately not on the list.
Extend the lists below as needed.
"""
import re
from typing import List, Tuple

# Whole words only.
WORDS = {
    # German insults / vulgar / slurs
    "arsch", "arschloch", "arschlöcher", "hure", "huren", "nutte", "nutten", "fotze", "fotzen",
    "wichser", "wixer", "wixxer", "spast", "spasti", "spasten", "schlampe", "schlampen",
    "missgeburt", "missgeburten", "drecksau", "drecksack", "hurensohn", "hurensöhne", "bastard",
    "schwuchtel", "schwuchteln", "kanake", "kanaken", "neger", "negerin", "judensau", "behindi",
    "fick", "ficken", "fickt", "gefickt", "fickdich", "verpiss", "verpissdich",
    # English
    "fuck", "fucker", "fuckers", "fucking", "fucked", "motherfucker", "cunt", "cunts", "bitch", "bitches",
    "asshole", "assholes", "slut", "sluts", "whore", "whores", "retard", "retarded", "faggot", "faggots",
    "fag", "nigger", "niggers", "nigga", "niggas", "wanker", "twat", "kys",
}

# Also inside longer words (compounds, inflections).
STEMS = {
    "fick", "fotze", "hurensohn", "arschloch", "wichser", "schwuchtel", "missgeburt", "kanake", "neger",
    "judensau", "fuck", "nigger", "nigga", "faggot", "motherf", "bitch",
}

# Multi-word phrases (threats, Nazi slogans).
PHRASES = [
    "sieg heil", "heil hitler", "kill yourself", "kill urself", "go kill yourself",
    "bring dich um", "häng dich auf", "geh sterben",
]

_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i"})
_UMLAUTS = (("ä", "a"), ("ö", "o"), ("ü", "u"), ("ß", "ss"))
_TOKEN = re.compile(r"[\w@$]+(?:!+[\w@$]+)*", re.UNICODE)


def _norm(word: str) -> str:
    w = word.lower()
    for a, b in _UMLAUTS:
        w = w.replace(a, b)
    w = w.translate(_LEET)
    w = re.sub(r"[_\d]", "", w)
    return re.sub(r"(.)\1+", r"\1", w)  # "fiiick" -> "fick", "nutte" -> "nute" (lists are normalised the same way)


_WORDS = {_norm(w) for w in WORDS}
_STEMS = {_norm(s) for s in STEMS}
_PHRASES = [[_norm(p) for p in phrase.split()] for phrase in PHRASES]


def _bad_spans(text: str) -> List[Tuple[int, int]]:
    tokens = [(m.start(), m.end(), _norm(m.group())) for m in _TOKEN.finditer(text or "")]
    spans = []
    for start, end, norm in tokens:
        if norm and (norm in _WORDS or any(s in norm for s in _STEMS)):
            spans.append((start, end))
    norms = [n for _, _, n in tokens]
    for phrase in _PHRASES:
        n = len(phrase)
        for i in range(len(norms) - n + 1):
            if norms[i:i + n] == phrase:
                spans.extend((tokens[j][0], tokens[j][1]) for j in range(i, i + n))
    return sorted(set(spans))


def find_bad_words(text: str) -> List[str]:
    """The offending words as written (empty list = text is fine)."""
    return [text[a:b] for a, b in _bad_spans(text)]


def censor_text(text: str) -> Tuple[str, bool]:
    """Replace offending words with their first letter + asterisks. Returns (text, changed)."""
    spans = _bad_spans(text)
    if not spans:
        return text, False
    out, last = [], 0
    for a, b in spans:
        if a < last:  # overlapping phrase/word span
            continue
        out.append(text[last:a])
        out.append(text[a] + "*" * (b - a - 1))
        last = b
    out.append(text[last:])
    return "".join(out), True
