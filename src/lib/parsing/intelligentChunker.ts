export interface ParseChunk {
  id: string;
  chunkNumber: number;
  text: string;
  pageStart: number;
  pageEnd: number;
  tokenEstimate: number;
  quality: 'high' | 'medium' | 'low';
}

export async function splitChunkAdaptively(chunk: ParseChunk): Promise<ParseChunk[]> {
  const targetSize = Math.floor(chunk.tokenEstimate / 2);
  const lines = chunk.text.split('\n');
  const midpoint = Math.floor(lines.length / 2);

  const firstHalfText = lines.slice(0, midpoint).join('\n');
  const secondHalfText = lines.slice(midpoint).join('\n');

  const subChunks: ParseChunk[] = [
    {
      ...chunk,
      id: `${chunk.id}-a`,
      text: firstHalfText,
      tokenEstimate: Math.floor(chunk.tokenEstimate / 2),
      pageEnd: Math.floor((chunk.pageStart + chunk.pageEnd) / 2),
    },
    {
      ...chunk,
      id: `${chunk.id}-b`,
      chunkNumber: chunk.chunkNumber + 1,
      text: secondHalfText,
      tokenEstimate: Math.ceil(chunk.tokenEstimate / 2),
      pageStart: Math.ceil((chunk.pageStart + chunk.pageEnd) / 2),
    },
  ];

  return subChunks;
}
