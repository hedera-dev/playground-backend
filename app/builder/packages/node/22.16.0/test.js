const assert = require("node:assert/strict");
const { Client, MirrorNodeAccountBalanceQuery } = require("@hiero-ledger/sdk");

async function main() {
  const client = Client.forTestnet();
  try {
    const balance = await new MirrorNodeAccountBalanceQuery()
      .setAccountId("0.0.2")
      .execute(client);
    assert(!balance.hbars.toTinybars().isNegative());
    console.log("MirrorNodeAccountBalanceQuery:", balance.hbars.toString());
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
