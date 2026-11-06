const STOPWORDS_EN = new Set(
  "the and for with that this from into are was were you your its not but all any can had has have how our out use when where which who will would should could about after before also than then them they there these those their been being does did doing each more most other some such only over just like make made may much must need same him his her one two get got per via onto off own yet".split(
    " ",
  ),
);

const STOPWORDS_IT = new Set(
  "che non con per una gli del delle della dei sono stato essere dalla anche come alla alle degli delle nella nelle nella negli questo questa questi queste quello quella quelli quelle suo sua suoi sue loro quel nel sul dal dal tutto tutti tutta tutte fare fatto era erano uno dei tra fra dove quando poi ancora molto piu suoi miei senza verso dopo prima sopra sotto".split(
    " ",
  ),
);

/**
 * Light suffix normalisation table. Strips inflectional suffixes to collapse
 * common variants. Never strips below 3 characters. Applied after lowercasing.
 *
 * English: -ing, -tion, -sion, -ment, -ness, -ies, -ed, -er, -ly, -s
 * Italian: -zione, -zioni, -mente, -ità, -ari, -are, -ire, -ere, -ato, -ata, -ati, -ate, -ione, -ioni, -ando, -endo
 */
const SUFFIX_RULES = [
  // Italian first (longer suffixes before shorter)
  { suffix: "zione", min: 8 },
  { suffix: "zioni", min: 8 },
  { suffix: "mente", min: 8 },
  { suffix: "ione", min: 7 },
  { suffix: "ioni", min: 7 },
  { suffix: "ando", min: 7 },
  { suffix: "endo", min: 7 },
  { suffix: "are", min: 6 },
  { suffix: "ire", min: 6 },
  { suffix: "ere", min: 6 },
  { suffix: "ato", min: 6 },
  { suffix: "ata", min: 6 },
  { suffix: "ati", min: 6 },
  { suffix: "ate", min: 6 },
  { suffix: "ari", min: 6 },
  // English (longer before shorter)
  { suffix: "tion", min: 7 },
  { suffix: "sion", min: 7 },
  { suffix: "ment", min: 7 },
  { suffix: "ness", min: 7 },
  { suffix: "ying", min: 7 },  // studying -> stud (avoid), so min 7
  { suffix: "ing", min: 6 },
  { suffix: "ies", min: 6 },
  { suffix: "ily", min: 6 },
  { suffix: "ed", min: 5 },
  { suffix: "er", min: 5 },
  { suffix: "ly", min: 5 },
  { suffix: "s", min: 4 },
];

/** Strip one inflectional suffix if the result stays >= 3 chars. */
export function normalizeSuffix(token) {
  for (const { suffix, min } of SUFFIX_RULES) {
    if (token.length >= min && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

/** Lowercase, split on non-alphanumeric, drop short tokens and stopwords, normalize suffixes. */
export function tokenize(text) {
  const tokens = new Set();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue;
    if (STOPWORDS_EN.has(raw) || STOPWORDS_IT.has(raw)) continue;
    tokens.add(normalizeSuffix(raw));
  }
  return tokens;
}

function nameTokens(name) {
  return new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

/** Trigger and override aliases: same tokenizer and suffix table as the task text. */
function aliasTokens(values) {
  const tokens = new Set();
  for (const value of values ?? []) {
    for (const part of value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
      tokens.add(normalizeSuffix(part));
    }
  }
  return tokens;
}

/**
 * Score a skill against task tokens.
 * Weights: name=3, triggers/overrides=2, description=1.
 * Returns { score, matches } where matches is an array of { token, source, weight }.
 */
export function scoreSkill(taskTokens, skill) {
  const names = nameTokens(skill.name);
  const triggers = aliasTokens(skill.triggers);
  const overrides = aliasTokens(skill.overrides);
  const descriptions = tokenize(skill.description);
  let score = 0;
  const matches = [];
  for (const token of taskTokens) {
    if (names.has(token)) {
      score += 3;
      matches.push({ token, source: "name", weight: 3 });
    }
    // NOTE: a token in both a frontmatter trigger and an override scores once, as an override.
    if (overrides.has(token)) {
      score += 2;
      matches.push({ token, source: "override", weight: 2 });
    } else if (triggers.has(token)) {
      score += 2;
      matches.push({ token, source: "trigger", weight: 2 });
    }
    if (descriptions.has(token)) {
      score += 1;
      matches.push({ token, source: "description", weight: 1 });
    }
  }
  return { score, matches };
}

/**
 * Score, drop zeros, order by score descending then name ascending.
 * Returns the ranked candidates and the selected page.
 */
export function rankSkills(skills, task, limit) {
  const taskTokens = tokenize(task);
  const candidates = skills
    .map((skill) => {
      const { score, matches } = scoreSkill(taskTokens, skill);
      return { name: skill.name, score, path: skill.path, matches };
    })
    .filter((skill) => skill.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  const selected = candidates.slice(0, limit);
  return { candidates, selected, dropped: candidates.length - selected.length };
}
