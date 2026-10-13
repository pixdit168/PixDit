import { creativeAgents } from "./creative-agents.js";

const priceValue = /(?:\b(?:Rp\.?|IDR|USD)\s*|\$\s*)\d[\d.,]*(?:\s*(?:juta|jt|miliar|milyar|million|billion|[mk]))?|\b\d[\d.,]*\s*(?:juta|jt|miliar|milyar|million|billion|[mk])\b/gi;

function describeColor(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return "";
  const [red, green, blue] = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const difference = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  const saturation = difference ? difference / (1 - Math.abs(2 * lightness - 1)) : 0;
  let hue = 0;
  if (difference) {
    if (maximum === red) hue = ((green - blue) / difference) % 6;
    else if (maximum === green) hue = (blue - red) / difference + 2;
    else hue = (red - green) / difference + 4;
    hue = (hue * 60 + 360) % 360;
  }
  const color = saturation < 0.12
    ? (lightness < 0.2 ? "charcoal" : lightness > 0.85 ? "off-white" : "gray")
    : hue >= 5 && hue < 55 && lightness < 0.45 && saturation < 0.75 ? "brown"
    : hue < 15 || hue >= 345 ? "red"
    : hue < 45 ? "orange"
    : hue < 70 ? "yellow"
    : hue < 165 ? "green"
    : hue < 200 ? "teal"
    : hue < 255 ? "blue"
    : hue < 290 ? "violet" : "pink";
  const tone = lightness < 0.32 ? "deep" : lightness < 0.65 ? "rich" : "soft";
  return `${tone} ${color}`;
}

export function convertToVisualBrief(brief) {
  let result = String(brief || "").replace(/(?:\b(?:dengan|serta|dan)\s+)?\b(tagline|headline|call\s+to\s+action|cta|tipografi|typography|font|teks|text|logo)\b\s*[:\-]?\s*[^.!?\r\n]*[.!?]?/gim, "");
  result = result.replace(/\b(?:harga(?:nya)?|price|pricing)\s*(?:(?:mulai\s+dari|start(?:ing)?\s+(?:from|at))\s*)?[:=-]?\s*(?:(?:Rp\.?|IDR|USD|\$)\s*)?\d[\d.,]*(?:\s*(?:juta|jt|miliar|milyar|million|billion|[mk]))?/gi, "");
  result = result.replace(/\b(?:mulai\s+dari|start(?:ing)?\s+(?:from|at))\s*(?=(?:Rp\.?|IDR|USD|\$|\d))/gi, "");
  result = result.replace(priceValue, "");
  result = result.replace(/#[0-9a-f]{6}\b/gi, (hex) => describeColor(hex));
  result = result.replace(/\b(poster|flyer|banner)\b/gi, "key visual");
  result = result.replace(/^\s*(?:saya|aku|kami)\s+(?:mau|ingin)\s+(?:buat|membuat|bikin)\s+/i, "");
  result = result.replace(/^\s*(?:buat|bikin|create)\s+/i, "");
  result = result.replace(/^\s*(?:key visual|visual|gambar|desain)\s+(?:(?:untuk\s+)?(?:iklan|promosi)\s+)?/i, "");
  result = result.replace(/^\s*(?:untuk\s+)?(?:iklan|promosi)\s+/i, "");
  result = result.replace(/^\s*(?:yang\s+berkaitan\s+dengan|tentang)\s+/i, "");
  result = result.replace(/([,;])\s*[,;]\s*/g, "$1 ").replace(/\s{2,}/g, " ").trim().replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, "");
  return result || "Create a tasteful commercial key visual based on the supplied business category.";
}

function visualComposition(composition) {
  return String(composition).replace(/\b(?:poster\s+)?copy(?:\s+(?:zone|band|pocket|corridor|hierarchy))?\b/gi, "unmarked negative space");
}

export function newImagePrompt({ brief, category, creativeAgent, format, style, primaryColor, refinement = "", imageCount = 1, hasProductReference = false }) {
  const visualBrief = convertToVisualBrief(brief);
  if (refinement) {
    return `IMAGE EDIT TASK — the attached/source image is the visual source of truth.\nUSER'S REQUIRED CHANGE (highest priority): ${refinement}\n\nMake the requested change clearly visible. Preserve every element the user did not ask to change: subject identity, shape, people, activity, camera angle, crop, composition, lighting direction, background structure, and material details. If the requested change names one of those elements, change that element and preserve the rest. Do not reinterpret the full campaign or introduce an unrelated subject, object, person, industry, or setting.\nOriginal campaign context (use only to disambiguate the edit): ${visualBrief}\nBusiness category: ${category}\nOutput format: ${format}\nVisual continuity: ${style}, polished commercial quality, realistic materials.\nHard constraints: return one edited key visual only. No text, pseudo-text, letters, numbers, labels, logos, watermarks, signatures, borders, or UI. Any surface that could contain writing must remain blank.`;
  }
  if (!creativeAgents.includes(creativeAgent)) throw new Error("Behavioral agent tidak valid.");
  const referenceRule = hasProductReference
    ? "Use the supplied product image as the visual reference. Preserve its recognizable shape, material, color, packaging, and details while improving its setting and lighting."
    : "Create the scene from the written brief.";
  const variationRule = imageCount === 10 ? "Make this direction visually distinct through its camera angle, subject scale, and layout." : "Make one complete, decisive image.";
  const color = describeColor(primaryColor);
  const colorRule = color ? `Use ${color} as a subtle palette cue.` : "";
  const styleRule = {
    Eksploratif: "Use a varied editorial composition.",
    Minimal: "Use a restrained, uncluttered composition.",
    Berani: "Use a bold, high-contrast composition.",
  }[style] || "";
  const subjectRule = category === "Properti"
    ? "Keep the property itself clearly visible; if people appear, show them viewing or using that property."
    : "Keep the scene faithful to the subject.";
  return `Create a polished commercial image of ${visualBrief}. ${subjectRule} ${creativeAgent.signature} ${visualComposition(creativeAgent.composition)} ${creativeAgent.medium} ${creativeAgent.avoid} ${referenceRule} ${variationRule} ${styleRule} ${colorRule} Keep every surface and open area plain, without lettering, numbers, signs, logos, watermarks, or interface elements.`;
}
