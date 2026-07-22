export interface DensityPoint {
  year: number;
  count: number;
}

export interface AggregatedEvent {
  year: number;
  count: number;
}

export function buildDensityData(
  aggregatedEvents: AggregatedEvent[] | null,
  maxPoints: number
): DensityPoint[] {
  if (!aggregatedEvents || aggregatedEvents.length === 0) return [];
  
  const density = aggregatedEvents.map(agg => ({
    year: agg.year,
    count: agg.count
  }));
  
  // Sample if too many points
  if (density.length > maxPoints) {
    const sampled: DensityPoint[] = [];
    const step = density.length / maxPoints;
    for (let i = 0; i < maxPoints; i++) {
      const idx = Math.floor(i * step);
      sampled.push(density[idx]);
    }
    return sampled;
  }
  
  return density;
}

export function generateSVGPoints(
  densityData: DensityPoint[],
  height: number
): string {
  if (densityData.length === 0) return '';
  
  const maxCount = Math.max(...densityData.map(d => d.count), 1);
  
  return densityData.map((d, i) => {
    const x = (i / (densityData.length - 1)) * 100;
    const y = (height - 4) - ((d.count / maxCount) * (height - 4));
    return `${x},${y}`;
  }).join(' ');
}

export function createDensityGraphSVG(
  densityData: DensityPoint[],
  height: number,
  color: string
): string {
  if (densityData.length === 0) return '';
  
  const points = generateSVGPoints(densityData, height);
  
  const svgString = `
    <svg width="100%" height="${height}" viewBox="0 0 100 ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <polyline
        points="${points}"
        fill="none"
        stroke="${color}"
        stroke-width="2"
      />
    </svg>
  `;
  
  return `data:image/svg+xml;base64,${btoa(svgString)}`;
}


// ✅ Add this new function
export function parseYearInput(input: string): number | null {
  // Remove commas and trim
  const cleaned = input.replace(/,/g, '').trim().toUpperCase();
  
  // Check for BC/AD
  const isBC = cleaned.includes('BC');
  const isAD = cleaned.includes('AD');
  
  // Extract number
  const numberMatch = cleaned.match(/[\d.]+/);
  if (!numberMatch) return null;
  
  let value = parseFloat(numberMatch[0]);
  
  // Handle billions (B)
  if (cleaned.includes('B')) {
    value = value * 1000000000;
  }
  // Handle millions (M)
  else if (cleaned.includes('M')) {
    value = value * 1000000;
  }
  
  // Apply BC/AD
  if (isBC) {
    value = -Math.abs(value);
  } else if (isAD) {
    value = Math.abs(value);
  }
  
  return Math.floor(value);
}