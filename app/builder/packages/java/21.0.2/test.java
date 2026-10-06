import com.hedera.hashgraph.sdk.AccountId;
import com.hedera.hashgraph.sdk.Client;
import com.hedera.hashgraph.sdk.MirrorNodeAccountBalanceQuery;

class Test {

    public static void main(String[] args) throws Exception {
        Client client = Client.forTestnet();
        try {
            var balance = new MirrorNodeAccountBalanceQuery()
                .setAccountId(AccountId.fromString("0.0.2"))
                .execute(client);
            if (balance.hbars.toTinybars() < 0) {
                throw new AssertionError("Negative HBAR balance");
            }
            System.out.println("MirrorNodeAccountBalanceQuery: " + balance.hbars);
        } finally {
            client.close();
        }
    }
}
