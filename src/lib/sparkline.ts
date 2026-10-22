export function finiteSegments(values: number[]) {
  const segments: { index: number; value: number }[][] = [];
  let segment: { index: number; value: number }[] = [];
  values.forEach((value, index) => {
    if (Number.isFinite(value)) segment.push({ index, value });
    else if (segment.length) { segments.push(segment); segment = []; }
  });
  if (segment.length) segments.push(segment);
  return segments;
}
/** Rounded bounds with breathing room; flat readings still have a useful scale. */
export function heartRateRange(values: number[]) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { min: 50, max: 110 };
  const low = Math.min(...finite);
  const high = Math.max(...finite);
  const middle = (low + high) / 2;
  const span = Math.max(30, (high - low) + 2 * Math.max(5, (high - low) * 0.15));
  const min = Math.max(0, Math.floor((middle - span / 2) / 5) * 5);
  const max = Math.max(min + 30, Math.ceil((middle + span / 2) / 5) * 5);
  return { min, max };
}
