import { creativeAgents } from "./creative-agents.js";

const priceValue = /(?:\b(?:Rp\.?|IDR|USD)\s*|\$\s*)\d[\d.,]*(?:\s*(?:juta|jt|miliar|milyar|million|billion|[mk]))?|\b\d[\d.,]*\s*(?:juta|jt|miliar|milyar|million|billion|[mk])\b/gi;

export function convertToVisualBrief(brief) {
  let result = String(brief || "").replace(/(?:\b(?:dengan|serta|dan)\s+)?\b(tagline|headline|call\s+to\s+action|cta|tipografi|typography|font|teks|text|logo)\b\s*[:\-]?\s*[^.!?\r\n]*[.!?]?/gim, "");
  result = result.replace(/\b(?:harga(?:nya)?|price|pricing)\s*(?:(?:mulai\s+dari|start(?:ing)?\s+(?:from|at))\s*)?[:=-]?\s*(?:(?:Rp\.?|IDR|USD|\$)\s*)?\d[\d.,]*(?:\s*(?:juta|jt|miliar|milyar|million|billion|[mk]))?/gi, "");
  result = result.replace(/\b(?:mulai\s+dari|start(?:ing)?\s+(?:from|at))\s*(?=(?:Rp\.?|IDR|USD|\$|\d))/gi, "");
  result = result.replace(priceValue, "");
  result = result.replace(/\b(poster|flyer|banner)\b/gi, "key visual").replace(/([,;])\s*[,;]\s*/g, "$1 ").replace(/\s{2,}/g, " ").trim().replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, "");
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
  const colorRule = /^#[0-9a-f]{6}$/i.test(primaryColor) ? `Use ${primaryColor} as a palette cue.` : "";
  return `Create a polished advertising image for ${visualBrief}. Follow the actual subject and setting in the brief; ${category} is background context. ${creativeAgent.signature} ${visualComposition(creativeAgent.composition)} ${creativeAgent.medium} ${creativeAgent.avoid} ${referenceRule} ${variationRule} Use a ${style} visual style and ${format} format. ${colorRule} Keep all open areas plain: no words, letters, numbers, signage, logos, watermarks, interface elements, or marks resembling writing.`;
}
