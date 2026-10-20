const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%&*+-='
const ALL = `${UPPER}${LOWER}${DIGITS}${SYMBOLS}`

export function generatePassword(length = 16, entropy: () => number = randomUnit): string {
  const size = Math.max(12, Math.min(200, Math.trunc(length) || 16))
  const chars = [pick(UPPER, entropy), pick(LOWER, entropy), pick(DIGITS, entropy), pick(SYMBOLS, entropy)]
  while (chars.length < size) chars.push(pick(ALL, entropy))
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(entropy() * (index + 1)))
    const current = chars[index] ?? ''
    chars[index] = chars[swap] ?? current
    chars[swap] = current
  }
  return chars.join('')
}

function pick(alphabet: string, entropy: () => number): string {
  const index = Math.min(alphabet.length - 1, Math.floor(entropy() * alphabet.length))
  return alphabet[index] ?? alphabet[0] ?? 'a'
}

function randomUnit(): number {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return (buffer[0] ?? 0) / 2 ** 32
}
