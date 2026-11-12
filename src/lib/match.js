export function compact(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·・,.'’"“”\-–—()/]/g, '')
}

export function textIncludes(haystack, query) {
  const needle = compact(query)
  if (needle.length < 2) return false
  return compact(haystack).includes(needle)
}

export function matchConcert(concert, kind, query) {
  const title = concert?.title || ''
  const people = `${concert?.cast || ''} ${concert?.crew || ''}`
  const program = concert?.story || ''

  if (kind === 'artist') {
    if (textIncludes(title, query)) return '공연명'
    if (textIncludes(people, query)) return '출연·제작'
    return null
  }

  if (textIncludes(title, query)) return '공연명'
  if (textIncludes(program, query)) return '프로그램 소개'
  if (Array.isArray(concert?.programs) && concert.programs.length > 0) {
    for (const p of concert.programs) {
      const progText = `${p.composer || ''} ${p.composerKo || ''} ${p.composerShort || ''} ${p.title || ''} ${p.titleKo || ''} ${p.searchingWord || ''} ${(p.movements || []).join(' ')}`
      if (textIncludes(progText, query)) {
        return `프로그램: ${p.composerShort || p.composerKo || p.composer} - ${p.titleKo || p.title}`
      }
    }
  }
  return null
}

export function cleanArtistName(raw) {
  if (!raw) return ''
  return String(raw)
    .replace(/^(?:지휘|피아노|바이올린|첼로|소프라노|테너|바리톤|베이스|협연|해설|연주|출연)\s*[:：\-–]\s*/i, '')
    .replace(/(?:\s+(?:등|외)(?:\s*(?:다수|\d+\s*(?:명|인|분)))?|(?:\s*외\s*\d+\s*(?:명|인|분))|\s+등\s*다수)\s*$/g, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/^["'‘“]+|["'’”]+$/g, '')
    .trim()
}

export function splitPeople(value) {
  return String(value || '')
    .split(/[,，/·・;\n\r]|(?:\s+그리고\s+)/)
    .map(cleanArtistName)
    .filter((part) => part.length >= 2 && part.length <= 40 && part !== '등' && part !== '외')
    .filter((part, index, all) => all.indexOf(part) === index)
    .slice(0, 16)
}
