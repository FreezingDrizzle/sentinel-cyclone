const $ = (id) => document.getElementById(id);
const SCAN_COUNT = 10;
const toDVPN = (u) =>
  (u / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 });

const log = (m) => {
  const el = $("log");
  if (el) {
    el.textContent += `${m}\n`;
    el.scrollTop = el.scrollHeight;
  }
  console.log(m);
};

if (!window.api) {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div style="background:#ff8fa3;color:#06122b;padding:10px;
     text-align:center;font-weight:600">
     Preload failed to load — window.api is undefined.</div>`,
  );
  throw new Error("preload/contextBridge not available");
}

window.api.onLog(log);

function shortAddr(a) {
  return a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a;
}

async function refreshBalances() {
  $("totalBal").textContent = "…";
  try {
    const { rows, total } = await window.api.scan(SCAN_COUNT);
    $("totalBal").textContent = toDVPN(total);

    $("rows").innerHTML = "";
    for (const r of rows) {
      const div = document.createElement("div");
      div.className = "trow";
      const zero = r.amount === 0 ? "zero" : "";
      div.innerHTML = `
        <span class="idx">#${r.index}</span>
        <span class="addr mono">${shortAddr(r.address)}</span>
        <span class="amt ${zero}">${toDVPN(r.amount)} DVPN</span>`;
      $("rows").appendChild(div);
    }
    log(`Scanned ${rows.length} addresses — total ${toDVPN(total)} DVPN`);
  } catch (e) {
    $("totalBal").textContent = "—";
    log(`ERROR scanning balances: ${e.message || e}`);
  }
}

$("btnNew").onclick = async () => {
  const { mnemonic } = await window.api.newWallet();
  $("seed").value = mnemonic;
  const { address } = await window.api.loadWallet(mnemonic);
  $("addr").textContent = `Input[0]: ${address}`;
  $("addr").classList.remove("hidden");
  log("New wallet created. Fund address #0, then refresh balances.");
  await refreshBalances();
};

$("btnLoad").onclick = async () => {
  const seed = $("seed").value.trim();
  if (!seed) return log("Enter a seed phrase first.");
  try {
    const { address } = await window.api.loadWallet(seed);
    $("addr").textContent = `Input[0]: ${address}`;
    $("addr").classList.remove("hidden");
    log("Seed loaded.");
    await refreshBalances();
  } catch (e) {
    log(`ERROR loading seed: ${e.message || e}`);
  }
};

$("btnRefresh").onclick = refreshBalances;

$("btnMix").onclick = async () => {
  try {
    const res = await window.api.runMix({
      tier: $("tier").value,
      inputIndex: Number($("inIdx").value),
      outputIndex: Number($("outIdx").value),
    });
    log(`DONE. Output ${res.outputAddress} — tx ${res.txHash}`);
    await refreshBalances();
  } catch (e) {
    log(`ERROR: ${e.message || e}`);
  }
};

// Send-max toggles the amount field.
$("sendMax").onchange = () => {
  const on = $("sendMax").checked;
  $("sendAmt").disabled = on;
  if (on) $("sendAmt").value = "";
};

$("btnSend").onclick = async () => {
  const btn = $("btnSend");
  btn.disabled = true;
  try {
    const opts = {
      index: Number($("sendIdx").value),
      toAddress: $("sendTo").value.trim(),
      amountDVPN: $("sendAmt").value,
      sendMax: $("sendMax").checked,
    };
    log(
      `Sending from index #${opts.index} to ${shortAddr(opts.toAddress)}${
        opts.sendMax ? " (max)" : ` — ${opts.amountDVPN} DVPN`
      }...`,
    );
    const res = await window.api.send(opts);
    log(
      `SENT ${toDVPN(res.amount)} DVPN (fee ${toDVPN(res.fee)}) ` +
        `to ${res.to} — tx ${res.txHash}`,
    );
    await refreshBalances();
  } catch (e) {
    log(`SEND ERROR: ${e.message || e}`);
  } finally {
    btn.disabled = false;
  }
};
