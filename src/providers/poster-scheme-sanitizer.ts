export const POSTER_SCHEME_SANITIZER_LIVE_FAILURE_TERMS = [
  "bread shield",
  "large pink hammer",
  "baguette",
  "面包盾牌",
  "粉色大锤",
  "法棍面包",
] as const;

const PLACEHOLDER_PATTERN =
  "\\[(?:Game Character \\d+|Boss(?: \\d+)?|Game Logo|Brand Logo|Prop \\d+|Key Subject \\d+|Supporting Asset \\d+)\\]";
const PLACEHOLDER_RE = new RegExp(PLACEHOLDER_PATTERN, "iu");
const BOSS_PLACEHOLDER_RE = /\[Boss(?: \d+)?\]/iu;
const CHARACTER_PLACEHOLDER_RE = /\[Game Character \d+\]/iu;

const ACCESSORY_PATTERN =
  "(?:bread shield|large pink hammer|pink hammer|baguette weapon|baguette|shield|hammer|mallet|sword|axe|weapon|armor|armour|helmet|面包盾牌|粉色大锤|大锤|巨锤|锤子|盾牌|剑|斧|盔甲|头盔|法棍面包|法棍|面包武器|武器)";
const ACCESSORY_RE = new RegExp(ACCESSORY_PATTERN, "iu");
const ACCESSORY_GLOBAL_RE = new RegExp(ACCESSORY_PATTERN, "giu");
const PLACEHOLDER_APPEARANCE_PARENS_RE = new RegExp(
  `(${PLACEHOLDER_PATTERN})\\s*[（(][^）)]*(?:face|hair|costume|weapon|shield|hammer|sword|armor|tool|prop|logo|lettering|面部|脸|发型|头发|服装|武器|盾牌|锤|剑|盔甲|道具|标识|字形)[^）)]*[）)]`,
  "giu",
);

const EN_PLACEHOLDER_ACCESSORY_ACTION_RE = new RegExp(
  `\\b(?:holding|wielding|using|wearing|equipped with|armed with|bracing with|blocking with|swinging|brandishing|gripping|carrying)\\b[^。！？.!?\\n;；,，]{0,120}${ACCESSORY_PATTERN}[^。！？.!?\\n;；,，]{0,80}`,
  "giu",
);
const ZH_PLACEHOLDER_ACCESSORY_ACTION_RE =
  /(?:手持|挥舞着|挥舞|使用|用其|用|装备|拿着|抓着|举着|格挡着)[^。！？.!?\n;；,，]{0,120}(?:面包盾牌|粉色大锤|大锤|巨锤|锤子|盾牌|剑|斧|盔甲|头盔|法棍面包|法棍|面包武器|武器)[^。！？.!?\n;；,，]{0,80}/giu;

const CLAUSE_RE = /([^。！？.!?\n]+)([。！？.!?\n]*)/gu;

function firstPlaceholderDuty(clause: string): "boss" | "character" | "asset" {
  const characterIndex = clause.search(CHARACTER_PLACEHOLDER_RE);
  const bossIndex = clause.search(BOSS_PLACEHOLDER_RE);
  if (characterIndex >= 0 && (bossIndex < 0 || characterIndex < bossIndex)) return "character";
  if (bossIndex >= 0) return "boss";
  return "asset";
}

function sanitizePlaceholderClause(clause: string): string {
  if (!PLACEHOLDER_RE.test(clause) || !ACCESSORY_RE.test(clause)) return clause;

  const duty = firstPlaceholderDuty(clause);
  const replacement = duty === "boss"
    ? "performing a threat action with only uploaded reference features"
    : duty === "character"
      ? "using only visible uploaded prop/tool if present"
      : "using only visible uploaded reference features if present";

  return clause
    .replace(EN_PLACEHOLDER_ACCESSORY_ACTION_RE, replacement)
    .replace(ZH_PLACEHOLDER_ACCESSORY_ACTION_RE, "使用上传参考中可见的道具动作")
    .replace(ACCESSORY_GLOBAL_RE, "visible uploaded prop/tool if present");
}

function sanitizePlaceholderClauses(text: string): string {
  return text.replace(CLAUSE_RE, (_match, clause: string, punctuation: string) => {
    return `${sanitizePlaceholderClause(clause)}${punctuation}`;
  });
}

export function sanitizePosterSchemeText(text: string | null | undefined): string {
  const withoutParentheticalAppearance = String(text || "")
    .replace(PLACEHOLDER_APPEARANCE_PARENS_RE, "$1")
    .replace(/(\[Boss(?: \d+)?\])'s\s+[^,.，。]*(?:hammer|mallet|weapon|shield|sword|axe|粉色大锤|锤|盾牌|武器)[^,.，。]*/giu, "$1's threat action")
    .replace(/(\[Game Character \d+\])'s\s+[^,.，。]*(?:hammer|mallet|weapon|shield|sword|axe|baguette|锤|盾牌|法棍|武器)[^,.，。]*/giu, "$1's visible uploaded prop/tool if present");

  return sanitizePlaceholderClauses(withoutParentheticalAppearance)
    .replace(/\s+([,，.!?。！？;；:：])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
