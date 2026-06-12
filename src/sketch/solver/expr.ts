/**
 * A tiny, safe arithmetic expression evaluator for dimension formulas like
 * "d1/2 + 5". Supports + - * / ( ), numbers, and variable names (other
 * dimensions). No use of eval(); it's a hand-written recursive-descent parser.
 */

export type Scope = Record<string, number>;

const NUM = /^\d+(\.\d+)?/;
const IDENT = /^[a-zA-Z_]\w*/;

export function evaluateExpr(input: string, scope: Scope): number {
  let s = input.trim();

  const skipWs = () => {
    s = s.replace(/^\s+/, "");
  };

  // expr := term (('+'|'-') term)*
  const parseExpr = (): number => {
    let v = parseTerm();
    for (;;) {
      skipWs();
      if (s[0] === "+") {
        s = s.slice(1);
        v += parseTerm();
      } else if (s[0] === "-") {
        s = s.slice(1);
        v -= parseTerm();
      } else break;
    }
    return v;
  };

  // term := factor (('*'|'/') factor)*
  const parseTerm = (): number => {
    let v = parseFactor();
    for (;;) {
      skipWs();
      if (s[0] === "*") {
        s = s.slice(1);
        v *= parseFactor();
      } else if (s[0] === "/") {
        s = s.slice(1);
        const d = parseFactor();
        if (d === 0) throw new Error("Chia cho 0");
        v /= d;
      } else break;
    }
    return v;
  };

  // factor := number | ident | '(' expr ')' | '-' factor
  const parseFactor = (): number => {
    skipWs();
    if (s[0] === "(") {
      s = s.slice(1);
      const v = parseExpr();
      skipWs();
      if (s[0] !== ")") throw new Error("Thiếu dấu )");
      s = s.slice(1);
      return v;
    }
    if (s[0] === "-") {
      s = s.slice(1);
      return -parseFactor();
    }
    if (s[0] === "+") {
      s = s.slice(1);
      return parseFactor();
    }
    let m = s.match(NUM);
    if (m) {
      s = s.slice(m[0].length);
      return parseFloat(m[0]);
    }
    m = s.match(IDENT);
    if (m) {
      s = s.slice(m[0].length);
      const name = m[0];
      if (!(name in scope)) throw new Error(`Không biết biến "${name}"`);
      return scope[name];
    }
    throw new Error(`Cú pháp sai gần "${s}"`);
  };

  const result = parseExpr();
  skipWs();
  if (s.length > 0) throw new Error(`Dư ký tự "${s}"`);
  if (!Number.isFinite(result)) throw new Error("Kết quả không hợp lệ");
  return result;
}

/** Identifiers referenced by an expression (for dependency ordering). */
export function referencedNames(input: string): string[] {
  const names = new Set<string>();
  const re = /[a-zA-Z_]\w*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) names.add(m[0]);
  return [...names];
}
