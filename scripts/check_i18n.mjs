#!/usr/bin/env node
import { TRANSLATIONS, SUPPORTED_LANGUAGES } from "../src/i18n/translations.js";

function verifyTranslations() {
  const langs = Object.keys(TRANSLATIONS);
  if (langs.length !== 2 || !langs.includes("en") || !langs.includes("zh")) {
    console.error(
      `[i18n ERROR] Only 'en' and 'zh' are permitted per v2 specification. Found: ${langs.join(", ")}`
    );
    process.exit(1);
  }

  if (SUPPORTED_LANGUAGES.length !== 2) {
    console.error("[i18n ERROR] SUPPORTED_LANGUAGES must contain exactly 2 entries (en, zh).");
    process.exit(1);
  }

  const enKeys = Object.keys(TRANSLATIONS.en);
  const zhKeys = Object.keys(TRANSLATIONS.zh);
  const missingInZh = enKeys.filter((k) => !(k in TRANSLATIONS.zh));
  const missingInEn = zhKeys.filter((k) => !(k in TRANSLATIONS.en));
  const emptyKeys = [];

  for (const k of enKeys) {
    if (typeof TRANSLATIONS.en[k] !== "string" || TRANSLATIONS.en[k].trim() === "") {
      emptyKeys.push(`en.${k}`);
    }
  }
  for (const k of zhKeys) {
    if (typeof TRANSLATIONS.zh[k] !== "string" || TRANSLATIONS.zh[k].trim() === "") {
      emptyKeys.push(`zh.${k}`);
    }
  }

  if (missingInZh.length > 0 || missingInEn.length > 0 || emptyKeys.length > 0) {
    console.error("[i18n CHECK FAILED]");
    if (missingInZh.length) console.error("Missing in ZH:", missingInZh);
    if (missingInEn.length) console.error("Missing in EN:", missingInEn);
    if (emptyKeys.length) console.error("Empty translation values:", emptyKeys);
    process.exit(1);
  }

  console.log(
    `[i18n CHECK PASSED] EN and ZH dictionaries have exact 1:1 key parity (${enKeys.length} keys, 0 missing keys).`
  );
}

verifyTranslations();
