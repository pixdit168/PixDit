function describeColor(hex: string) {
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

export function newImagePrompt({ brief, style = "", styleExplicit = false, primaryColor = "", primaryColorExplicit = false, refinement = "", hasProductReference = false, hasMultipleProductReferences = false, hasBrandLogo = false, aiComposed = false }: {
  brief: string;
  style?: string;
  styleExplicit?: boolean;
  primaryColor?: string;
  primaryColorExplicit?: boolean;
  refinement?: string;
  hasProductReference?: boolean;
  hasMultipleProductReferences?: boolean;
  hasBrandLogo?: boolean;
  aiComposed?: boolean;
}) {
  if (refinement.trim()) {
    return `Edit the supplied image according to this request: ${refinement.trim()}\nKeep all elements not mentioned in the request unchanged.`;
  }

  const parts = [brief.trim()];
  if (aiComposed) parts.push("Create the complete ready-to-use campaign visual, with typography integrated into the composition. Keep the entire subject, logo, and every line of text inside the frame with comfortable safe margins, especially at the bottom edge; do not cut off important details. If the brief specifies exact text, reproduce it faithfully; otherwise use only concise, relevant ad copy in the brief's language when appropriate. Do not add technical labels or prompt instructions as visible text.");
  if (hasProductReference) parts.push("Use the supplied product image as the reference for the product's recognizable appearance, unless the user's prompt asks to change it.");
  if (hasMultipleProductReferences) parts.push("Use all supplied product images before the logo as visual references for varied design; preserve each product's recognizable features and do not invent unrelated products.");
  if (hasBrandLogo) parts.push("The LAST supplied reference image is the brand logo, not a product photo. Integrate one recognizable version of that logo into the finished advertisement. Choose its placement, size, and color treatment to suit the composition; preserve the mark's core identity while adapting it naturally to the design. Do not copy the logo's source background as a rectangular badge. Render the complete poster as one image; the app will not add or move the logo afterward.");
  const styleHints: Record<string, string> = {
    Minimal: "If compatible with the user's prompt, use a minimal and uncluttered style.",
    Berani: "If compatible with the user's prompt, use a bold, high-contrast style.",
  };
  if (styleExplicit && styleHints[style]) parts.push(styleHints[style]);
  const color = primaryColorExplicit ? describeColor(primaryColor) : "";
  if (color) parts.push(`If compatible with the user's prompt, use ${color} as a subtle palette cue.`);
  return parts.join("\n\n");
}
