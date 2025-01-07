import com.hedera.hashgraph.sdk.PrivateKey;
import com.hedera.hashgraph.sdk.PublicKey;

class Test {

    public static void main(String[] args) {
        System.out.println("Generate ED25519 Private And Public Key Pair Example Start!");

        PrivateKey privateKey = PrivateKey.generateED25519();
        System.out.println("Private Key: " + privateKey);

        PublicKey publicKey = privateKey.getPublicKey();
        System.out.println("Public key: " + publicKey);
    }
}