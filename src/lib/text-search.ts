// Normaliza a mayusculas sin acentos, igual que health_coverages.normalized_name,
// para que buscar "medico" encuentre "MÉDICOS" y viceversa.
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

// Coincide si CADA palabra de la busqueda aparece en algun lugar del texto,
// sin importar el orden - a diferencia de un substring literal, que exige
// que las palabras esten pegadas y en el mismo orden que se escribieron.
export function matchesAllWords(haystack: string, query: string): boolean {
  const words = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const normalizedHaystack = normalizeSearchText(haystack);
  return words.every((word) => normalizedHaystack.includes(word));
}
