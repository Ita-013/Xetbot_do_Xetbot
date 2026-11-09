// Verifica canais públicos do Telegram (páginas t.me/s/...) e avisa via bot
// quando aparece um produto configurado.
//
// Uso:
//   node check.js           -> execução normal (usada pelo GitHub Actions)
//   node check.js --seco    -> só mostra as últimas postagens e o que bateria no filtro,
//                              sem enviar nada e sem mexer no estado

const fs = require("fs");
const path = require("path");
const { verificarTodos } = require("./filtro");

const ARQ_CONFIG = path.join(__dirname, "config.json");
const ARQ_ESTADO = path.join(__dirname, "state.json");
const MAX_PAGINAS = 10; // ~20 postagens por página
const TOKEN = process.env.BOT_TOKEN;
const SECO = process.argv.includes("--seco");

const config = JSON.parse(fs.readFileSync(ARQ_CONFIG, "utf8"));
const estado = fs.existsSync(ARQ_ESTADO)
  ? JSON.parse(fs.readFileSync(ARQ_ESTADO, "utf8"))
  : { ultimos: {} };
estado.ultimos = estado.ultimos || {};

// ---------- Leitura das páginas públicas ----------

function decodificarEntidades(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function htmlParaTexto(html) {
  return decodificarEntidades(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  ).trim();
}

function extrairPostagens(html, canal) {
  const postagens = [];
  const blocos = html.split('<div class="tgme_widget_message_wrap').slice(1);
  for (const bloco of blocos) {
    const mId = bloco.match(/data-post="([^"\/]+)\/(\d+)"/);
    if (!mId) continue;
    const mTexto = bloco.match(
      /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/
    );
    postagens.push({
      canal,
      id: Number(mId[2]),
      texto: mTexto ? htmlParaTexto(mTexto[1]) : "",
      link: `https://t.me/${mId[1]}/${mId[2]}`,
    });
  }
  return postagens;
}

async function baixarPagina(canal, antesDe) {
  const url = `https://t.me/s/${canal}` + (antesDe ? `?before=${antesDe}` : "");
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (monitor-promocoes)" },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} em ${url}`);
  return extrairPostagens(await resp.text(), canal);
}

// Busca todas as postagens com id > ultimoId (paginando para trás se preciso).
async function postagensNovas(canal, ultimoId) {
  let todas = await baixarPagina(canal);
  if (ultimoId == null) return todas;

  let paginas = 1;
  while (paginas < MAX_PAGINAS && todas.length) {
    const menor = Math.min(...todas.map((p) => p.id));
    if (menor <= ultimoId + 1) break;
    const anteriores = await baixarPagina(canal, menor);
    if (!anteriores.length) break;
    todas = anteriores.concat(todas);
    paginas++;
  }
  const vistos = new Set();
  return todas
    .filter((p) => p.id > ultimoId && !vistos.has(p.id) && vistos.add(p.id))
    .sort((a, b) => a.id - b.id);
}

// ---------- Bot do Telegram ----------

async function api(metodo, corpo) {
  const resp = await fetch(`https://api.telegram.org/bot${TOKEN}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo || {}),
  });
  const json = await resp.json();
  if (!json.ok) throw new Error(`Telegram ${metodo}: ${json.description}`);
  return json.result;
}

async function descobrirChatId() {
  if (process.env.CHAT_ID) return process.env.CHAT_ID;
  if (estado.chatId) return estado.chatId;
  const updates = await api("getUpdates");
  const msg = updates.reverse().find((u) => u.message && u.message.chat.type === "private");
  if (!msg) return null;
  estado.chatId = msg.message.chat.id;
  await api("sendMessage", {
    chat_id: estado.chatId,
    text: "✅ Monitor de promoções ativado! Você vai receber os avisos aqui.",
  });
  return estado.chatId;
}

function formatarPreco(v) {
  return "R$ " + v.toFixed(2).replace(".", ",");
}

// ---------- Principal ----------

async function main() {
  if (SECO) {
    for (const canal of config.canais) {
      const posts = await baixarPagina(canal);
      console.log(`\n=== ${canal}: ${posts.length} postagens (ids ${posts[0]?.id}..${posts.at(-1)?.id}) ===`);
      for (const p of posts) {
        const achados = verificarTodos(config.produtos, p.texto);
        const linha = p.texto.split("\n")[0].slice(0, 70);
        console.log(`${achados.length ? "🔔" : "  "} ${p.id} ${linha}${achados.length ? "  -> " + achados.map((a) => a.produto).join(", ") : ""}`);
      }
    }
    return;
  }

  if (!TOKEN) throw new Error("Variável BOT_TOKEN não definida (configure o Secret no GitHub).");
  const chatId = await descobrirChatId();
  if (!chatId) {
    console.log("Nenhum chat encontrado. Mande uma mensagem para o seu bot no Telegram e rode de novo.");
  }

  for (const canal of config.canais) {
    try {
      const ultimo = estado.ultimos[canal];
      const novas = await postagensNovas(canal, ultimo);
      if (!novas.length) {
        console.log(`${canal}: nada novo`);
        continue;
      }
      const maiorId = Math.max(...novas.map((p) => p.id));

      if (ultimo == null) {
        // Primeira execução: só marca o ponto de partida, sem avisar o histórico.
        console.log(`${canal}: primeira execução, começando a partir do post ${maiorId}`);
      } else if (chatId) {
        let avisos = 0;
        for (const p of novas) {
          const achados = verificarTodos(config.produtos, p.texto);
          if (!achados.length) continue;
          const preco = achados.find((a) => a.preco != null);
          const texto =
            `🔔 ${achados.map((a) => a.produto).join(", ")}` +
            (preco ? ` — ${formatarPreco(preco.preco)}` : "") +
            `\n📢 @${canal}\n🔗 ${p.link}\n\n${p.texto.slice(0, 1500)}`;
          await api("sendMessage", {
            chat_id: chatId,
            text: texto,
            link_preview_options: { is_disabled: true },
          });
          avisos++;
        }
        console.log(`${canal}: ${novas.length} postagens novas, ${avisos} avisos enviados`);
      }

      if (chatId || ultimo == null) estado.ultimos[canal] = maiorId;
    } catch (e) {
      console.error(`${canal}: erro - ${e.message}`);
    }
  }

  fs.writeFileSync(ARQ_ESTADO, JSON.stringify(estado, null, 2) + "\n");
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { baixarPagina, postagensNovas };
