const { PrivateKey } = require("@hashgraph/sdk");

console.log("Generate ED25519 Private And Public Key Pair Example Start!")
const privateKey = PrivateKey.generateED25519();
console.log('Private Key', privateKey);

const publicKey = privateKey.publicKey;
console.log('Public Key', publicKey);