package main

import (
	"fmt"
	"os"
	"runtime"

	hedera "github.com/hiero-ledger/hiero-sdk-go/v2/sdk"
)

func main() {
	client := hedera.ClientForTestnet()
	defer client.Close()

	balance, err := hedera.NewMirrorNodeAccountBalanceQuery().
		SetAccountID(hedera.AccountID{Account: 2}).
		Execute(client)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if balance.Hbars.AsTinybar() < 0 {
		panic("Negative HBAR balance")
	}
	fmt.Println("MirrorNodeAccountBalanceQuery:", balance.Hbars.String())
	fmt.Println("Go runtime:", runtime.Version())
}
