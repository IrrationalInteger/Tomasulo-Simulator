function ADD(a, b) {
  return a + b;
}

function SUB(a, b) {
  return a - b;
}

function MUL(a, b) {
  return a * b;
}

function DIV(a, b) {
  return a / b;
}

function SD(a, b, cache) {
  cache[b] = a;
}

function LD(a, b, cache, c) {
  return cache[c];
}

export default { ADD, SD, LD, SUB, MUL, DIV };
