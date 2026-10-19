export function getGenerationJobs(imageCount: number) {
  return Array.from({ length: imageCount }, (_, slot) => ({ slot, name: `Variasi ${String(slot + 1).padStart(2, "0")}` }));
}
