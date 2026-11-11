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
export function samplePosition(index: number, times: number[], count: number) {
  const first = times[0], last = times[times.length - 1];
  if (times.length === count && Number.isFinite(first) && Number.isFinite(last)
      && last > first && Number.isFinite(times[index])) {
    return Math.max(0, Math.min(1, (times[index] - first) / (last - first)));
  }
  return index / Math.max(1, count - 1);
}

export function nearestSample(position: number, times: number[], count: number) {
  let nearest = 0, distance = Infinity;
  for (let i = 0; i < count; i++) {
    const next = Math.abs(samplePosition(i, times, count) - position);
    if (next < distance) { nearest = i; distance = next; }
  }
  return count ? nearest : null;
}
