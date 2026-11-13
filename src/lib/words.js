// Word counts for teaching material. Used by the Content screen (live meter) and the server
// (the same limit, enforced), so a set's size is judged the same way in both places.

import hosted from '../../config/hosted.json'

export const MAX_WORDS = hosted.maxWordsPerSet

// Slide and page markers added during extraction ("[Slide 3]") aren't counted.
export function countWords(text) {
  return (String(text ?? '').replace(/\[(Page|Slide) \d+\]/g, ' ').match(/\S+/g) ?? []).length
}

export const totalWords = (sources) => sources.reduce((n, s) => n + countWords(s.text), 0)

export const formatWords = (n) => n.toLocaleString('en-GB')
