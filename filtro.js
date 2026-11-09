// Lógica de filtro: decide se o texto de uma mensagem corresponde a algum produto.

function normalizar(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/\s+/g, " ");
}

// Extrai todos os preços no formato "R$ 1.234,56", "R$1234" ou "R$ 99,90".
function extrairPrecos(texto) {
  const precos = [];
  const re = /r\$\s*([\d.]+(?:,\d{1,2})?)/gi;
  let m;
  while ((m = re.exec(texto)) !== null) {
    const valor = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
    if (!isNaN(valor) && valor > 0) precos.push(valor);
  }
  return precos;
}

function contem(textoNorm, termo) {
  return textoNorm.includes(normalizar(termo));
}

// produto: { nome, todas: [...], alguma: [...], excluir: [...], precoMaximo }
function verificarProduto(produto, texto) {
  const t = normalizar(texto);
  const todas = produto.todas || [];
  const alguma = produto.alguma || [];
  const excluir = produto.excluir || [];

  if (todas.length === 0 && alguma.length === 0) return null;
  if (!todas.every((p) => contem(t, p))) return null;
  if (alguma.length > 0 && !alguma.some((p) => contem(t, p))) return null;
  if (excluir.some((p) => contem(t, p))) return null;

  const precos = extrairPrecos(texto);
  const menorPreco = precos.length ? Math.min(...precos) : null;
  if (produto.precoMaximo != null && menorPreco != null && menorPreco > produto.precoMaximo) {
    return null;
  }
  return { produto: produto.nome, preco: menorPreco };
}

function verificarTodos(produtos, texto) {
  return produtos.map((p) => verificarProduto(p, texto)).filter(Boolean);
}

module.exports = { normalizar, extrairPrecos, verificarProduto, verificarTodos };
