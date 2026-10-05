// Deterministic, local-only heuristics. No network, model, dictionaries downloaded,
// telemetry, or claim of exhaustive entity recognition. Exact spans are redacted.
export function createDetector() {
  return async text => {
    const sensitive = new Set();
    const collect = (pattern, group = 1) => {
      for (const match of text.matchAll(pattern)) {
        const value = match[group]?.trim();
        if (value && text.includes(value)) sensitive.add(value);
      }
    };
    // Salutations and metadata fields: conservative about names, not body sentences.
    collect(/(?:^|\n|[.!?]\s+)(?:Hi|Hello|Dear|Hey)[ \t]+([^,\n!:]{1,80})[,!:]/giu);
    collect(/(?:^|\n)(?:To|From|Cc|Bcc|Company|Employer|Applicant|Candidate|Name|Address|收件人|发件人|姓名|公司|地址)[ \t]*[:：][ \t]*([^\n]+)/giu);
    collect(/(?:^|\n)([\p{Script=Han}]{2,8})(?:先生|女士|同学)?(?:您好|你好|：)/gu);
    collect(/(?:^|\n)(?:Best(?: regards)?|Kind regards|Regards|Sincerely|Thanks|Cheers|Yours sincerely)[,！!。.]?[ \t]*\n([^\n]+(?:\n[^\n]+){0,2})/giu);
    collect(/\b(?:application|candidate|reference|account|tracking|job)[ \t]*(?:id|number|no\.?|#|reference)[ \t]*[:#-]?[ \t]*([A-Z0-9][A-Z0-9_-]{3,})\b/giu);
    // Company context and legal suffixes, including single-word brands.
    collect(/\b(?:at|from|with|join|to)[ \t]+((?:[A-Z][\p{L}\p{N}&'-]*)(?:[ \t]+[A-Z][\p{L}\p{N}&'-]*){0,5})/gu);
    collect(/\b((?:[A-Z][\p{L}\p{N}&'-]*[ \t]+){1,5}(?:Inc\.?|LLC|Ltd\.?|Limited|Corporation|Corp\.?|GmbH|PLC|University|Studio|Studios|Robotics|Technologies))\b/gu);
    collect(/(?:^|\n|[。！？，、\s]|申请|感谢|来自|加入)([\p{Script=Han}A-Za-z0-9]{2,24}(?:公司|集团|大学|工作室))/gu);
    // Dates and address-shaped spans can identify a particular application.
    collect(/\b(\d{1,5}\s+(?:[\p{L}\d.'-]+\s+){1,5}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd)\.?)(?=\s|,|$)/giu);
    collect(/\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/gu);
    return { sensitive: [...sensitive] };
  };
}
