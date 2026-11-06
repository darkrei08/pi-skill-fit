const STOPWORDS = new Set(
  "the and for with that this from into are was were you your its not but all any can had has have how our out use when where which who will would should could about after before also than then them they there these those their been being does did doing each more most other some such only over just like make made may much must need same him his her one two get got per via onto off own yet".split(
    " ",
  ),
);

/** Lowercase, split on non-alphanumeric, drop short tokens and stopwords. */
export function tokenize(text) {
  const tokens = new Set();
  for (const token of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length >= 3 && !STOPWORDS.has(token)) tokens.add(token);
  }
  return tokens;
}

function nameTokens(name) {
  return new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

/** 3 per distinct task token matching the name, 1 per matching the description. */
export function scoreSkill(taskTokens, skill) {
  const names = nameTokens(skill.name);
  const descriptions = tokenize(skill.description);
  let score = 0;
  for (const token of taskTokens) {
    if (names.has(token)) score += 3;
    if (descriptions.has(token)) score += 1;
  }
  return score;
}

/**
 * Score, drop zeros, order by score descending then name ascending.
 * Returns the ranked candidates and the selected page.
 */
export function rankSkills(skills, task, limit) {
  const taskTokens = tokenize(task);
  const candidates = skills
    .map((skill) => ({ name: skill.name, score: scoreSkill(taskTokens, skill), path: skill.path }))
    .filter((skill) => skill.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  const selected = candidates.slice(0, limit);
  return { candidates, selected, dropped: candidates.length - selected.length };
}
