export const creativeAgents = Object.freeze([
  {
    name: "Human Narrative",
    agent: "Agent Aruna",
    signature: "A candid documentary-style human story at eye level, grounded in a believable real environment and a decisive authentic interaction.",
    composition: "Keep the people or activity on the right two-thirds and reserve a calm left column for poster copy.",
    medium: "Naturalistic editorial photography with warm available light, restrained grading, and observed details.",
    avoid: "No isolated catalog object, modular grid, studio pedestal, aerial route, collage treatment, or surreal scale trick.",
  },
  {
    name: "Kinetic Impact",
    agent: "Agent Bima",
    signature: "A high-energy instant with visible movement, a dramatic low or tilted camera, strong diagonal flow, and one decisive peak-action moment.",
    composition: "Drive motion from lower-left toward upper-right while reserving a compact upper-right copy zone away from the action.",
    medium: "Cinematic commercial photography, crisp subject edges, controlled motion blur, hard highlights, and bold contrast.",
    avoid: "No calm symmetry, flat lay, evenly spaced tiles, centered museum display, soft documentary scene, or paper collage.",
  },
  {
    name: "Modular Explainer",
    agent: "Agent Citra",
    signature: "A clear three-to-five-stage visual explanation using connected scenes, simplified objects, or benefit modules that communicate a process without written labels.",
    composition: "Use a deliberate sequence or flow across the middle and lower area, with a centered clean header zone at the top.",
    medium: "Polished isometric or semi-3D illustration with consistent geometry, soft shadows, and an orderly visual system.",
    avoid: "No single photographic hero scene, lifestyle portrait, random icon cloud, product catalog grid, dramatic spotlight, or full-bleed macro crop.",
  },
  {
    name: "Catalog Matrix",
    agent: "Agent Dara",
    signature: "A systematic top-down or straight-on matrix showing four-to-six brief-relevant examples, variants, components, or use cases with consistent scale.",
    composition: "Build a disciplined tiled field with rhythmic spacing and reserve a strong full-width copy band along the bottom.",
    medium: "Clean commercial cutout photography on graphic color fields, precise shadows, and crisp modular framing.",
    avoid: "No sequential arrows or process diagram, no candid people scene, no cinematic motion, no single oversized object, and no heritage styling.",
  },
  {
    name: "Macro Craft",
    agent: "Agent Elang",
    signature: "An extreme close detail of hands, technique, surface, mechanism, or transformation that makes the work and material character tangible.",
    composition: "Use a full-bleed macro crop with the sharp detail concentrated on the left and a quieter right-side copy pocket.",
    medium: "Tactile macro photography, very shallow depth of field, directional light, subtle grain, and honest imperfections.",
    avoid: "No wide establishing scene, catalog grid, isometric diagram, centered pedestal, aerial view, generic stock portrait, or flat graphic collage.",
  },
  {
    name: "Bold Diptych",
    agent: "Agent Fajar",
    signature: "A hard two-part visual argument: before versus after, problem versus outcome, or two complementary benefits expressed as a bold diptych.",
    composition: "Split the frame asymmetrically into two unmistakable fields, keep the primary subject on the right, and reserve the upper-left for copy.",
    medium: "Graphic art direction combining clean photography with flat geometric fields, sharp masks, and two dominant colors.",
    avoid: "No blended scenic background, no multi-tile catalog, no documentary interaction, no circular spotlight stage, and no scrapbook texture.",
  },
  {
    name: "Spatial Journey",
    agent: "Agent Gita",
    signature: "A journey through space: route, pathway, transition, destination, or layered environment that makes movement and progress immediately visible.",
    composition: "Use a wide or aerial perspective with a strong leading path through depth; keep a vertical copy corridor on the left.",
    medium: "Expansive environmental photography or sophisticated map-like spatial visualization with atmospheric depth.",
    avoid: "No studio tabletop, centered object, modular catalog, tight macro, portrait-led consultation scene, or torn-paper collage.",
  },
  {
    name: "Mixed Collage",
    agent: "Agent Harsa",
    signature: "An expressive mixed-media collision of photographic cutouts, hand-torn paper, drawn marks, and bold shapes with purposeful imperfection.",
    composition: "Create an irregular asymmetric rhythm, anchor the main cutout low-left, and leave an energetic upper-right copy window.",
    medium: "Editorial paper collage with visible edges, print texture, offset layers, limited colors, and one photoreal anchor.",
    avoid: "No seamless photoreal scene, corporate wave template, tidy grid, isometric process, symmetrical luxury stage, or restrained neutral palette.",
  },
  {
    name: "Premium Sculpture",
    agent: "Agent Intan",
    signature: "A quiet iconic symbol of the brief presented as a refined sculptural centerpiece with disciplined luxury and very few elements.",
    composition: "Use formal near-symmetry, a centered lower-half subject, generous empty upper space, and a centered copy hierarchy.",
    medium: "Minimal high-end studio image, monochromatic or analogous palette, museum pedestal, controlled spotlight, and precise materials.",
    avoid: "No busy environment, multiple tiles, candid action, rough collage, diagonal motion, playful distortion, or informational diagram.",
  },
  {
    name: "Surreal Scale",
    agent: "Agent Jaya",
    signature: "A memorable impossible metaphor using an exaggerated scale relationship or unexpected interaction that communicates the central benefit instantly.",
    composition: "Place the oversized metaphor across the upper-right or center, retain a grounded human-scale cue, and reserve the lower-left for copy.",
    medium: "Bright photoreal surrealism with clean daylight, believable shadows, vivid accents, and advertising-grade compositing.",
    avoid: "No ordinary product hero shot, conventional corporate scene, repeated grid, isometric explainer, dark luxury pedestal, or documentary realism.",
  },
]);

export function getBehavioralPrompt(agent) {
  if (!agent || !creativeAgents.includes(agent)) throw new Error("Behavioral agent tidak valid.");
  return [
    `BEHAVIORAL AGENT: ${agent.agent} — ${agent.name}.`,
    `EXCLUSIVE VISUAL SIGNATURE: ${agent.signature}`,
    `COMPOSITION CONTRACT: ${agent.composition}`,
    `RENDERING LANGUAGE: ${agent.medium}`,
    `SEPARATION RULE: ${agent.avoid}`,
    "The composition contract is mandatory. Do not fall back to a universal corporate-poster template or imitate another agent's signature.",
  ].join("\n");
}
